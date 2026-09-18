-- Undo for 20260918_stage5_roles_and_project_access.sql.
--
-- Puts back the pre-Stage-5 access model exactly: two roles (admin, user),
-- every signed-in user sees every project and facility. Super Admins and
-- Admins become admin; every other role becomes user. Each user's own extra
-- permissions are left as they are. Project teams and the role table are
-- dropped (nothing else refers to them).

-- Policies back to their previous definitions.
drop policy if exists app_audit_read_survey_events on public.app_audit_log;
create policy app_audit_read_survey_events on public.app_audit_log for select to authenticated
  using (table_name = 'condition_surveys');

drop policy if exists survey_photos_read on storage.objects;
create policy survey_photos_read on storage.objects for select to authenticated using (bucket_id = 'survey-photos');
drop policy if exists survey_photos_write on storage.objects;
create policy survey_photos_write on storage.objects for insert to authenticated with check (bucket_id = 'survey-photos');
drop policy if exists survey_photos_update on storage.objects;
create policy survey_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'survey-photos') with check (bucket_id = 'survey-photos');

drop policy if exists survey_photos_read on public.survey_photos;
drop policy if exists survey_photos_insert on public.survey_photos;
drop policy if exists survey_photos_update on public.survey_photos;
drop policy if exists survey_photos_delete on public.survey_photos;
create policy survey_photos_read_write on public.survey_photos for select to authenticated using (true);
create policy survey_photos_insert on public.survey_photos for insert to authenticated with check (true);
create policy survey_photos_update on public.survey_photos for update to authenticated using (true) with check (true);
create policy survey_photos_delete on public.survey_photos for delete to authenticated using (fm_can('delete_snags'));

drop policy if exists survey_items_read on public.survey_items;
drop policy if exists survey_items_insert on public.survey_items;
drop policy if exists survey_items_update on public.survey_items;
drop policy if exists survey_items_delete on public.survey_items;
create policy survey_items_read_write on public.survey_items for select to authenticated using (true);
create policy survey_items_insert on public.survey_items for insert to authenticated with check (true);
create policy survey_items_update on public.survey_items for update to authenticated using (true) with check (true);
create policy survey_items_delete on public.survey_items for delete to authenticated using (fm_can('delete_snags'));

drop policy if exists condition_surveys_read on public.condition_surveys;
drop policy if exists condition_surveys_insert on public.condition_surveys;
drop policy if exists condition_surveys_update on public.condition_surveys;
drop policy if exists condition_surveys_delete on public.condition_surveys;
create policy survey_app_condition_surveys on public.condition_surveys for all to authenticated using (true) with check (true);

drop policy if exists projects_read on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
create policy projects_signed_in on public.projects for all to authenticated using (true) with check (true);

drop policy if exists fm_survey_users_select on public.fm_survey_users;
create policy fm_survey_users_select on public.fm_survey_users for select to authenticated
  using ((id = auth.uid()) or fm_is_admin());
drop policy if exists fm_survey_users_update on public.fm_survey_users;
create policy fm_survey_users_update on public.fm_survey_users for update to authenticated
  using (fm_is_admin()) with check (fm_is_admin());

-- Roles back to admin / user. The guards are removed first so the conversion
-- is not refused part-way.
drop trigger if exists guard_role_change on public.fm_survey_users;
drop function if exists public.fm_guard_role_change();
drop trigger if exists guard_last_admin on public.fm_survey_users;

alter table public.fm_survey_users drop constraint if exists fm_survey_users_role_fkey;
update public.fm_survey_users set role = 'admin' where role in ('super_admin', 'admin');
update public.fm_survey_users set role = 'user' where role <> 'admin';
alter table public.fm_survey_users alter column role drop default;
alter table public.fm_survey_users
  add constraint fm_survey_users_role_check check (role = any (array['admin'::text, 'user'::text]));

create or replace function public.fm_guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  remaining integer;
begin
  if old.role <> 'admin' or not old.is_active then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.is_active then
    return new;
  end if;
  select count(*) into remaining from fm_survey_users where role = 'admin' and is_active and id <> old.id;
  if remaining = 0 then
    raise exception 'Refused: this would leave no active administrator. Make another user an administrator first.'
      using errcode = 'raise_exception';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger guard_last_admin before delete or update on public.fm_survey_users
  for each row execute function public.fm_guard_last_admin();

create or replace function public.fm_can(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fm_survey_users
    where id = auth.uid()
      and is_active
      and (role = 'admin' or (permissions ->> p_permission)::boolean is true)
  );
$$;

create or replace function public.fm_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.fm_survey_users where id = auth.uid()) = 'admin', false);
$$;

-- Project teams and creator tracking.
drop trigger if exists projects_add_creator on public.projects;
drop function if exists public.fm_project_add_creator();
alter table public.projects alter column created_by drop default;
drop table if exists public.fm_project_members;

drop function if exists public.fm_visible_survey_ids();
drop function if exists public.fm_visible_project_ids();
drop function if exists public.fm_sees_approved_only();
drop table if exists public.fm_roles;
drop function if exists public.fm_touch_updated_at();
-- fm_audit keeps its new branches; they are inert without the dropped tables.
