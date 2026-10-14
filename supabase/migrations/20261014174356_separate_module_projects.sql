-- Expand schema first. Legacy projects remain the Condition Survey parents.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
alter table public.projects add column if not exists work_module text not null default 'condition';
alter table public.projects add column if not exists legacy_parent_id uuid references public.projects(id);
do $$ begin
 if not exists (select 1 from pg_constraint where conname='projects_work_module_check' and conrelid='public.projects'::regclass) then
  alter table public.projects add constraint projects_work_module_check check (work_module in ('condition','qhse','meter'));
 end if;
end $$;
create unique index if not exists projects_legacy_module_idx on public.projects(legacy_parent_id,work_module) where legacy_parent_id is not null;

-- Private, reversible move ledger. This table is not accessible through the app.
create table if not exists public.fm_module_project_moves (
 survey_id text primary key, old_project_id uuid not null, new_project_id uuid not null,
 moved_at timestamptz not null default now()
);
alter table public.fm_module_project_moves enable row level security;
revoke all on public.fm_module_project_moves from anon, authenticated;

-- Clone only modules that already have records; numbering stays server-generated.
insert into public.projects(name,client,location,notes,status,created_by,due_date,work_module,legacy_parent_id)
select p.name,p.client,p.location,p.notes,p.status,p.created_by,p.due_date,m.module,p.id
from public.projects p cross join (values ('qhse'),('meter')) m(module)
where p.work_module='condition' and p.legacy_parent_id is null
 and exists(select 1 from public.condition_surveys s where s.project_id=p.id and s.facility->>'module'=m.module)
 and not exists(select 1 from public.projects existing where existing.legacy_parent_id=p.id and existing.work_module=m.module);

-- Preserve access when separating the legacy projects.
insert into public.fm_project_members(project_id,user_id,added_by,added_at)
select p.id,m.user_id,m.added_by,m.added_at from public.projects p
join public.fm_project_members m on m.project_id=p.legacy_parent_id
where p.legacy_parent_id is not null on conflict do nothing;

insert into public.fm_module_project_moves(survey_id,old_project_id,new_project_id)
select s.id,s.project_id,p.id from public.condition_surveys s
join public.projects p on p.legacy_parent_id=s.project_id and p.work_module=s.facility->>'module'
on conflict do nothing;

-- Only parent IDs change; preserve revisions so pending device copies still sync.
select set_config('fm.workflow','on',true);
update public.condition_surveys s set project_id=m.new_project_id
from public.fm_module_project_moves m where s.id=m.survey_id and s.project_id=m.old_project_id;
select set_config('fm.workflow','',true);

-- Older clients can still send the legacy parent ID: route to its module copy.
-- A newly-created unrelated project can never be linked across modules.
create or replace function public.fm_route_module_project() returns trigger
language plpgsql security definer set search_path=public as $$
declare target_module text; record_module text; routed uuid;
begin
 if new.project_id is null then return new; end if;
 record_module := coalesce(nullif(new.facility->>'module',''),'condition');
 select work_module into target_module from public.projects where id=new.project_id;
 if target_module is null then raise exception 'Project not found.' using errcode='23503'; end if;
 if target_module=record_module then return new; end if;
 select id into routed from public.projects where legacy_parent_id=new.project_id and work_module=record_module;
 if routed is null then raise exception 'Choose a project from this module.' using errcode='23514'; end if;
 new.project_id := routed;
 return new;
end $$;
revoke all on function public.fm_route_module_project() from public,anon,authenticated;
drop trigger if exists aaa_route_module_project on public.condition_surveys;
create trigger aaa_route_module_project before insert or update on public.condition_surveys for each row execute function public.fm_route_module_project();

create or replace function public.fm_project_module_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and (new.work_module,new.legacy_parent_id) is distinct from (old.work_module,old.legacy_parent_id) then
  raise exception 'A project belongs to one module. Create a new project to change modules.' using errcode='23514';
 end if;
 if tg_op='INSERT' and new.legacy_parent_id is not null and auth.uid() is not null then
  raise exception 'Legacy project links are managed internally.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.fm_project_module_guard() from public,anon,authenticated;
drop trigger if exists projects_module_guard on public.projects;
create trigger projects_module_guard before insert or update on public.projects for each row execute function public.fm_project_module_guard();
