-- Retain all archives; remove anonymous access to application data.
revoke all on public.deleted_rows_archive, public.condition_surveys, public.survey_items,
 public.survey_photos, public.projects, public.fm_survey_users, public.fm_roles,
 public.fm_project_members from anon;
drop policy if exists archive_read_only on public.deleted_rows_archive;
create policy archive_read_only on public.deleted_rows_archive for select to authenticated
 using (public.fm_session_allowed() and public.fm_is_deletion_owner());
create or replace function public.fm_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$
 select public.fm_session_allowed() and exists
 (select 1 from public.fm_survey_users where id=auth.uid() and is_active and role in ('super_admin','admin'));
$$;
revoke all on function public.fm_is_admin() from public,anon;
grant execute on function public.fm_is_admin() to authenticated,service_role;
notify pgrst,'reload schema';
