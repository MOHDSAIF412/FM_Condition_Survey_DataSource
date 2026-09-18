-- Stage 5: Roles & Permissions.
--
-- Seven roles, each a bundle of permissions plus two access rules (sees every
-- project, or only the projects it is a member of; clients see only finished
-- facilities). Access is enforced here, by row-level policies, so a hidden
-- button can never be the only thing standing in the way.
--
-- Nothing is lost on the day this runs: today's admins become Super Admins,
-- today's users become Surveyors keeping their own extra permissions, and
-- every user is added to every existing project.
--
-- Undo: 20260918_stage5_roles_and_project_access.rollback.sql

-- 1. Roles --------------------------------------------------------------------

create table if not exists public.fm_roles (
  key text primary key,
  label text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  all_projects boolean not null default false,
  approved_only boolean not null default false,
  locked boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Keep identical to DEFAULT_ROLES in src/utils/roles.js.
insert into public.fm_roles (key, label, description, permissions, all_projects, approved_only, locked, sort) values
  ('super_admin', 'Super Admin', 'Everything, including other administrators.',
   '{"edit_surveys":true,"delete_snags":true,"download_reports":true,"manage_projects":true,"manage_team":true,"review_surveys":true,"approve_surveys":true,"manage_templates":true,"manage_config":true,"manage_users":true}', true, false, true, 1),
  ('admin', 'Admin', 'Everything except changing administrator accounts.',
   '{"edit_surveys":true,"delete_snags":true,"download_reports":true,"manage_projects":true,"manage_team":true,"review_surveys":true,"approve_surveys":true,"manage_templates":true,"manage_config":true,"manage_users":true}', true, false, true, 2),
  ('manager', 'Manager', 'Runs projects: teams, review and approval.',
   '{"edit_surveys":true,"delete_snags":true,"download_reports":true,"manage_projects":true,"manage_team":true,"review_surveys":true,"approve_surveys":true,"manage_templates":true}', true, false, false, 3),
  ('surveyor', 'Surveyor', 'Records facilities and snags on site.',
   '{"edit_surveys":true,"manage_projects":true}', false, false, false, 4),
  ('engineer', 'Engineer', 'Surveys and reviews technical findings.',
   '{"edit_surveys":true,"download_reports":true,"review_surveys":true}', false, false, false, 5),
  ('client', 'Client', 'Reads approved facilities and reports for their projects.',
   '{"download_reports":true}', false, true, false, 6),
  ('viewer', 'Viewer', 'Reads everything in their projects, changes nothing.',
   '{}', false, false, false, 7)
on conflict (key) do nothing;

create or replace function public.fm_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fm_roles_touch on public.fm_roles;
create trigger fm_roles_touch before update on public.fm_roles
  for each row execute function public.fm_touch_updated_at();

-- 2. Users move onto the new roles ---------------------------------------------

-- The last-admin guard now protects the last active Super Admin. Replaced
-- before the conversion below, which the old guard would refuse part-way.
create or replace function public.fm_guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  remaining integer;
begin
  if old.role <> 'super_admin' or not old.is_active then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'super_admin' and new.is_active then
    return new;
  end if;

  select count(*) into remaining
  from fm_survey_users
  where role = 'super_admin' and is_active and id <> old.id;

  if remaining = 0 then
    raise exception 'Refused: this would leave no active Super Admin. Make another user a Super Admin first.'
      using errcode = 'raise_exception';
  end if;
  return coalesce(new, old);
end;
$$;

alter table public.fm_survey_users drop constraint if exists fm_survey_users_role_check;
update public.fm_survey_users set role = 'super_admin' where role = 'admin';
update public.fm_survey_users set role = 'surveyor' where role = 'user';
alter table public.fm_survey_users alter column role set default 'surveyor';
alter table public.fm_survey_users
  add constraint fm_survey_users_role_fkey foreign key (role) references public.fm_roles(key) on update cascade;

-- Only a Super Admin gives, changes or removes an administrator role. Server
-- paths with no signed-in user (the admin-users Edge Function, migrations)
-- make their own checks.
create or replace function public.fm_guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caller text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.is_active is not distinct from old.is_active then
    return new;
  end if;
  if (tg_op <> 'INSERT' and old.role in ('super_admin', 'admin'))
     or (tg_op <> 'DELETE' and new.role in ('super_admin', 'admin')) then
    select role into v_caller from fm_survey_users where id = auth.uid() and is_active;
    if v_caller is distinct from 'super_admin' then
      raise exception 'Refused: only a Super Admin can give, change or remove an administrator role.'
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_role_change on public.fm_survey_users;
create trigger guard_role_change before insert or update or delete on public.fm_survey_users
  for each row execute function public.fm_guard_role_change();

-- 3. Project teams --------------------------------------------------------------

create table if not exists public.fm_project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.fm_survey_users(id) on delete cascade,
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists fm_project_members_user_idx on public.fm_project_members (user_id);

-- Everyone keeps every project they can see today.
insert into public.fm_project_members (project_id, user_id)
select p.id, u.id from public.projects p cross join public.fm_survey_users u
on conflict do nothing;

-- Whoever creates a project is on its team, and is recorded as its creator.
alter table public.projects alter column created_by set default auth.uid();

create or replace function public.fm_project_add_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from fm_survey_users where id = auth.uid()) then
    insert into fm_project_members (project_id, user_id, added_by)
    values (new.id, auth.uid(), auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_add_creator on public.projects;
create trigger projects_add_creator after insert on public.projects
  for each row execute function public.fm_project_add_creator();

-- 4. Access functions -------------------------------------------------------------

-- Admins hold everything; everyone else their role's permissions plus their own ticks.
create or replace function public.fm_can(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from fm_survey_users u
    left join fm_roles r on r.key = u.role
    where u.id = auth.uid()
      and u.is_active
      and (u.role in ('super_admin', 'admin')
           or (r.permissions ->> p_permission)::boolean is true
           or (u.permissions ->> p_permission)::boolean is true)
  );
$$;

create or replace function public.fm_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fm_survey_users
    where id = auth.uid() and is_active and role in ('super_admin', 'admin')
  );
$$;

-- Projects this user can see: all of them for admins and all-project roles,
-- otherwise the ones they are a member of or created.
create or replace function public.fm_visible_project_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
  from projects p
  join fm_survey_users u on u.id = auth.uid() and u.is_active
  left join fm_roles r on r.key = u.role
  where u.role in ('super_admin', 'admin')
     or r.all_projects is true
     or p.created_by = u.id
     or exists (select 1 from fm_project_members m where m.project_id = p.id and m.user_id = u.id);
$$;

-- Clients see finished work only. Until Workflows add approval, finished
-- means submitted.
create or replace function public.fm_sees_approved_only()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.approved_only
    from fm_survey_users u join fm_roles r on r.key = u.role
    where u.id = auth.uid() and u.role not in ('super_admin', 'admin')
  ), false);
$$;

create or replace function public.fm_visible_survey_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select s.id
  from condition_surveys s
  where s.project_id in (select fm_visible_project_ids())
    and (not fm_sees_approved_only() or s.status = 'submitted');
$$;

revoke all on function public.fm_visible_project_ids() from public, anon;
revoke all on function public.fm_visible_survey_ids() from public, anon;
revoke all on function public.fm_sees_approved_only() from public, anon;
revoke all on function public.fm_guard_role_change() from public, anon;
revoke all on function public.fm_project_add_creator() from public, anon;
-- Trigger-only: not callable through the API at all (applied live as stage5_trigger_functions_not_callable).
revoke execute on function public.fm_guard_role_change() from authenticated;
revoke execute on function public.fm_project_add_creator() from authenticated;
grant execute on function public.fm_visible_project_ids() to authenticated;
grant execute on function public.fm_visible_survey_ids() to authenticated;
grant execute on function public.fm_sees_approved_only() to authenticated;

-- 5. Row-level policies ---------------------------------------------------------------

alter table public.fm_roles enable row level security;
alter table public.fm_project_members enable row level security;

drop policy if exists fm_roles_read on public.fm_roles;
create policy fm_roles_read on public.fm_roles for select to authenticated using (true);
drop policy if exists fm_roles_update on public.fm_roles;
create policy fm_roles_update on public.fm_roles for update to authenticated
  using (not locked and (select fm_can('manage_users')))
  with check (not locked and (select fm_can('manage_users')));

drop policy if exists fm_project_members_read on public.fm_project_members;
create policy fm_project_members_read on public.fm_project_members for select to authenticated
  using (user_id = auth.uid() or (select fm_can('manage_team')) or (select fm_can('manage_users')));
drop policy if exists fm_project_members_insert on public.fm_project_members;
create policy fm_project_members_insert on public.fm_project_members for insert to authenticated
  with check ((select fm_can('manage_team')) and project_id in (select fm_visible_project_ids()));
drop policy if exists fm_project_members_delete on public.fm_project_members;
create policy fm_project_members_delete on public.fm_project_members for delete to authenticated
  using ((select fm_can('manage_team')) and project_id in (select fm_visible_project_ids()));

-- Users: yourself, or everyone if you manage users or project teams.
drop policy if exists fm_survey_users_select on public.fm_survey_users;
create policy fm_survey_users_select on public.fm_survey_users for select to authenticated
  using (id = auth.uid() or (select fm_can('manage_users')) or (select fm_can('manage_team')));
drop policy if exists fm_survey_users_update on public.fm_survey_users;
create policy fm_survey_users_update on public.fm_survey_users for update to authenticated
  using ((select fm_can('manage_users'))) with check ((select fm_can('manage_users')));

-- Projects.
drop policy if exists projects_signed_in on public.projects;
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (created_by = auth.uid() or id in (select fm_visible_project_ids()));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check ((select fm_can('manage_projects')));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using ((select fm_can('manage_projects')) and id in (select fm_visible_project_ids()))
  with check ((select fm_can('manage_projects')));

-- Facilities.
drop policy if exists survey_app_condition_surveys on public.condition_surveys;
drop policy if exists condition_surveys_read on public.condition_surveys;
create policy condition_surveys_read on public.condition_surveys for select to authenticated
  using (project_id in (select fm_visible_project_ids())
         and (not (select fm_sees_approved_only()) or status = 'submitted'));
drop policy if exists condition_surveys_insert on public.condition_surveys;
create policy condition_surveys_insert on public.condition_surveys for insert to authenticated
  with check ((select fm_can('edit_surveys')) and project_id in (select fm_visible_project_ids()));
drop policy if exists condition_surveys_update on public.condition_surveys;
create policy condition_surveys_update on public.condition_surveys for update to authenticated
  using ((select fm_can('edit_surveys')) and project_id in (select fm_visible_project_ids()))
  with check ((select fm_can('edit_surveys')) and project_id in (select fm_visible_project_ids()));
drop policy if exists condition_surveys_delete on public.condition_surveys;
create policy condition_surveys_delete on public.condition_surveys for delete to authenticated
  using ((select fm_can('delete_snags')) and project_id in (select fm_visible_project_ids()));

-- Snags.
drop policy if exists survey_items_read_write on public.survey_items;
drop policy if exists survey_items_read on public.survey_items;
create policy survey_items_read on public.survey_items for select to authenticated
  using (survey_id in (select fm_visible_survey_ids()));
drop policy if exists survey_items_insert on public.survey_items;
create policy survey_items_insert on public.survey_items for insert to authenticated
  with check ((select fm_can('edit_surveys')) and survey_id in (select fm_visible_survey_ids()));
drop policy if exists survey_items_update on public.survey_items;
create policy survey_items_update on public.survey_items for update to authenticated
  using ((select fm_can('edit_surveys')) and survey_id in (select fm_visible_survey_ids()))
  with check ((select fm_can('edit_surveys')) and survey_id in (select fm_visible_survey_ids()));
drop policy if exists survey_items_delete on public.survey_items;
create policy survey_items_delete on public.survey_items for delete to authenticated
  using ((select fm_can('delete_snags')) and survey_id in (select fm_visible_survey_ids()));

-- Photo records.
drop policy if exists survey_photos_read_write on public.survey_photos;
drop policy if exists survey_photos_read on public.survey_photos;
create policy survey_photos_read on public.survey_photos for select to authenticated
  using (survey_id in (select fm_visible_survey_ids()));
drop policy if exists survey_photos_insert on public.survey_photos;
create policy survey_photos_insert on public.survey_photos for insert to authenticated
  with check ((select fm_can('edit_surveys')) and survey_id in (select fm_visible_survey_ids()));
drop policy if exists survey_photos_update on public.survey_photos;
create policy survey_photos_update on public.survey_photos for update to authenticated
  using ((select fm_can('edit_surveys')) and survey_id in (select fm_visible_survey_ids()))
  with check ((select fm_can('edit_surveys')) and survey_id in (select fm_visible_survey_ids()));
drop policy if exists survey_photos_delete on public.survey_photos;
create policy survey_photos_delete on public.survey_photos for delete to authenticated
  using ((select fm_can('delete_snags')) and survey_id in (select fm_visible_survey_ids()));

-- Photo files: stored under "<facility id>/...", readable with the facility.
-- Uploads only need the permission: a new facility's photos can reach the
-- bucket before its own row does.
drop policy if exists survey_photos_read on storage.objects;
create policy survey_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'survey-photos' and (storage.foldername(name))[1] in (select public.fm_visible_survey_ids()));
drop policy if exists survey_photos_write on storage.objects;
create policy survey_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'survey-photos' and (select public.fm_can('edit_surveys')));
drop policy if exists survey_photos_update on storage.objects;
create policy survey_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'survey-photos' and (select public.fm_can('edit_surveys')))
  with check (bucket_id = 'survey-photos' and (select public.fm_can('edit_surveys')));

-- Facility events in the activity feed follow the facility.
drop policy if exists app_audit_read_survey_events on public.app_audit_log;
create policy app_audit_read_survey_events on public.app_audit_log for select to authenticated
  using (table_name = 'condition_surveys' and record_id in (select fm_visible_survey_ids()));

-- 6. Audit ----------------------------------------------------------------------------

create or replace function public.fm_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_id text := coalesce(v_row ->> 'id', v_row ->> 'key', (v_row ->> 'project_id') || ':' || (v_row ->> 'user_id'));
  v_summary text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  if tg_table_name = 'app_config_versions' then
    v_summary := format('%s v%s %s', coalesce(v_new ->> 'kind', v_old ->> 'kind'),
      coalesce(v_new ->> 'version', v_old ->> 'version'),
      case
        when tg_op = 'INSERT' then 'draft created'
        when (v_old ->> 'status') is distinct from (v_new ->> 'status') then (v_old ->> 'status') || ' -> ' || (v_new ->> 'status')
        else 'draft edited'
      end);
  elsif tg_table_name = 'fm_survey_users' then
    v_summary := case
      when tg_op = 'UPDATE' and (v_old ->> 'role') is distinct from (v_new ->> 'role')
        then format('user %s role %s -> %s', v_new ->> 'email', v_old ->> 'role', v_new ->> 'role')
      else format('user %s %s', coalesce(v_new ->> 'email', v_old ->> 'email'), lower(tg_op))
    end;
  elsif tg_table_name = 'fm_roles' then
    v_summary := format('role %s changed', v_row ->> 'label');
  elsif tg_table_name = 'fm_project_members' then
    v_summary := format('%s %s project %s',
      (select email from fm_survey_users where id = (v_row ->> 'user_id')::uuid),
      case when tg_op = 'INSERT' then 'added to' else 'removed from' end,
      (select project_number from projects where id = (v_row ->> 'project_id')::uuid));
  else
    v_summary := format('%s %s', tg_table_name, lower(tg_op));
  end if;

  insert into app_audit_log (table_name, record_id, action, summary, old_data, new_data, changed_by, changed_by_email)
  values (
    tg_table_name, v_id, tg_op, v_summary, v_old, v_new, auth.uid(),
    (select email from fm_survey_users where id = auth.uid())
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists fm_roles_audit on public.fm_roles;
create trigger fm_roles_audit after update on public.fm_roles
  for each row execute function public.fm_audit();
drop trigger if exists fm_project_members_audit on public.fm_project_members;
create trigger fm_project_members_audit after insert or delete on public.fm_project_members
  for each row execute function public.fm_audit();
