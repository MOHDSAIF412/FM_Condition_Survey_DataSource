-- Only the account explicitly nominated by the owner can delete work.
-- Retains existing RLS, workflow locks, archival and mass-deletion protection.
begin;

create or replace function public.fm_is_deletion_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users a join public.fm_survey_users p on p.id = a.id
    where a.id = auth.uid() and lower(a.email) = 'msaif412@gmail.com' and p.is_active
  );
$$;

create or replace function public.fm_can(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_permission in ('delete_snags', 'delete_projects')
    then public.fm_is_deletion_owner()
    else exists (
      select 1 from fm_survey_users u left join fm_roles r on r.key = u.role
      where u.id = auth.uid() and u.is_active
        and (u.role in ('super_admin', 'admin')
          or (r.permissions ->> p_permission)::boolean is true
          or (u.permissions ->> p_permission)::boolean is true)
    ) end;
$$;

create or replace function public.fm_project_trash_marker(p_notes text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v jsonb;
begin
  begin v := p_notes::jsonb;
  exception when invalid_text_representation then return null; end;
  if v->>'_fmProjectTrash' = '1' then return v->'deletedAt'; end if;
  return null;
end;
$$;

create or replace function public.fm_owner_deletion_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare protected boolean := false;
begin
  if TG_OP = 'DELETE' then protected := true;
  elsif TG_TABLE_NAME = 'projects' then
    if TG_OP = 'INSERT' then protected := public.fm_project_trash_marker(new.notes) is not null;
    else protected := public.fm_project_trash_marker(new.notes) is distinct from public.fm_project_trash_marker(old.notes); end if;
  elsif TG_TABLE_NAME = 'condition_surveys' then
    if TG_OP = 'INSERT' then protected := nullif(new.facility #>> '{qhse,deletedAt}', '') is not null;
    else protected := (new.facility #>> '{qhse,deletedAt}') is distinct from (old.facility #>> '{qhse,deletedAt}'); end if;
  end if;
  if protected and not public.fm_is_deletion_owner() then
    raise exception 'Only the owner can delete or restore projects, inspections, snags or photos.' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists projects_owner_deletion_guard on public.projects;
create trigger projects_owner_deletion_guard before insert or update or delete on public.projects
for each row execute function public.fm_owner_deletion_guard();
drop trigger if exists condition_surveys_owner_deletion_guard on public.condition_surveys;
create trigger condition_surveys_owner_deletion_guard before insert or update or delete on public.condition_surveys
for each row execute function public.fm_owner_deletion_guard();
drop trigger if exists survey_items_owner_deletion_guard on public.survey_items;
create trigger survey_items_owner_deletion_guard before delete on public.survey_items
for each row execute function public.fm_owner_deletion_guard();
drop trigger if exists survey_photos_owner_deletion_guard on public.survey_photos;
create trigger survey_photos_owner_deletion_guard before delete on public.survey_photos
for each row execute function public.fm_owner_deletion_guard();

commit;
