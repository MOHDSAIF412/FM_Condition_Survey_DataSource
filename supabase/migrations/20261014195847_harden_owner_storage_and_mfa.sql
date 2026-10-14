-- No record/photo deletions. Enforce optional MFA only after verified enrollment.
create or replace function public.fm_session_allowed()
returns boolean language sql stable security definer set search_path = public
as $$
 select auth.uid() is not null
   and exists (select 1 from public.fm_survey_users u where u.id=auth.uid() and u.is_active)
   and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
     or not exists (select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified'));
$$;
revoke all on function public.fm_session_allowed() from public, anon;
grant execute on function public.fm_session_allowed() to authenticated, service_role;

create or replace function public.fm_can(p_permission text)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.fm_session_allowed() and case when p_permission in ('delete_snags','delete_projects')
   then public.fm_is_deletion_owner()
   else exists (select 1 from public.fm_survey_users u left join public.fm_roles r on r.key=u.role
     where u.id=auth.uid() and u.is_active and (u.role in ('super_admin','admin')
       or (r.permissions->>p_permission)::boolean is true or (u.permissions->>p_permission)::boolean is true)) end;
$$;
revoke all on function public.fm_can(text) from public, anon;
grant execute on function public.fm_can(text) to authenticated, service_role;

create or replace function public.fm_visible_project_ids()
returns setof uuid language sql stable security definer set search_path=public
as $$
 select p.id from public.projects p join public.fm_survey_users u on u.id=auth.uid() and u.is_active
 left join public.fm_roles r on r.key=u.role
 where public.fm_session_allowed() and (u.role in ('super_admin','admin') or r.all_projects is true
   or p.created_by=u.id or exists (select 1 from public.fm_project_members m where m.project_id=p.id and m.user_id=u.id));
$$;
revoke all on function public.fm_visible_project_ids() from public, anon;
grant execute on function public.fm_visible_project_ids() to authenticated, service_role;

create or replace function public.fm_owner_deletion_guard()
returns trigger language plpgsql security definer set search_path=public
as $$
declare protected boolean := false;
begin
 if TG_OP='DELETE' then protected:=true;
 elsif TG_TABLE_NAME='projects' then
   if TG_OP='INSERT' then protected:=public.fm_project_trash_marker(new.notes) is not null;
   else protected:=public.fm_project_trash_marker(new.notes) is distinct from public.fm_project_trash_marker(old.notes); end if;
 elsif TG_TABLE_NAME='condition_surveys' then
   if TG_OP='INSERT' then protected:=nullif(new.facility#>>'{qhse,deletedAt}','') is not null
      or nullif(new.facility#>>'{meter,deletedAt}','') is not null;
   else protected:=(new.facility#>>'{qhse,deletedAt}') is distinct from (old.facility#>>'{qhse,deletedAt}')
      or (new.facility#>>'{meter,deletedAt}') is distinct from (old.facility#>>'{meter,deletedAt}'); end if;
 end if;
 if protected and not (public.fm_session_allowed() and public.fm_is_deletion_owner()) then
   raise exception 'Only the owner can delete or restore projects, inspections, snags or photos.' using errcode='42501';
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function public.fm_owner_deletion_guard() from public, anon, authenticated;
revoke all on function public.fm_is_deletion_owner() from public, anon;
grant execute on function public.fm_is_deletion_owner() to authenticated, service_role;

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
 using (public.fm_session_allowed() and (created_by=auth.uid() or id in (select public.fm_visible_project_ids())));

-- Upload/update must belong to a visible survey, not merely a signed-in editor.
drop policy if exists survey_photos_write on storage.objects;
create policy survey_photos_write on storage.objects for insert to authenticated
 with check (bucket_id='survey-photos' and public.fm_can('edit_surveys')
   and ((storage.foldername(name))[1] in (select public.fm_visible_survey_ids())
     or ((storage.foldername(name))[1]='projects'
       and (storage.foldername(name))[2] in (select id::text from public.fm_visible_project_ids() id))));
drop policy if exists survey_photos_update on storage.objects;
create policy survey_photos_update on storage.objects for update to authenticated
 using (bucket_id='survey-photos' and public.fm_can('edit_surveys')
   and ((storage.foldername(name))[1] in (select public.fm_visible_survey_ids())
     or ((storage.foldername(name))[1]='projects'
       and (storage.foldername(name))[2] in (select id::text from public.fm_visible_project_ids() id))))
 with check (bucket_id='survey-photos' and public.fm_can('edit_surveys')
   and ((storage.foldername(name))[1] in (select public.fm_visible_survey_ids())
     or ((storage.foldername(name))[1]='projects'
       and (storage.foldername(name))[2] in (select id::text from public.fm_visible_project_ids() id))));
drop policy if exists survey_photos_read on storage.objects;
create policy survey_photos_read on storage.objects for select to authenticated
 using (bucket_id='survey-photos' and (
   (storage.foldername(name))[1] in (select public.fm_visible_survey_ids())
   or ((storage.foldername(name))[1]='projects'
     and (storage.foldername(name))[2] in (select id::text from public.fm_visible_project_ids() id)
     and (storage.foldername(name))[3] in (select public.fm_visible_survey_ids()))));
-- Application photo files are retained for recovery, even when report rows are removed.
drop policy if exists survey_photos_delete on storage.objects;
notify pgrst, 'reload schema';
