-- Undo for 20260919_stage6_workflows.sql.
--
-- Removes the workflow rules: no locking, no review function, clients back to
-- "submitted" as their finished work, the facility history back to its
-- Stage 5 wording. The new columns (review status, notes, due dates) are left
-- in place with their data -- nothing reads them without the app, and
-- dropping them would lose the record of past reviews.

drop trigger if exists condition_surveys_workflow_guard on public.condition_surveys;
drop trigger if exists survey_items_locked_guard on public.survey_items;
drop trigger if exists survey_photos_locked_guard on public.survey_photos;
drop trigger if exists projects_due_guard on public.projects;
drop function if exists public.fm_project_due_guard();
drop function if exists public.fm_workflow_guard();
drop function if exists public.fm_locked_facility_guard();
drop function if exists public.fm_workflow_move(text, text, text);

create or replace function public.fm_visible_survey_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select s.id
  from condition_surveys s
  where s.project_id in (select fm_visible_project_ids())
    and (not fm_sees_approved_only() or s.status = 'submitted');
$$;

drop policy if exists condition_surveys_read on public.condition_surveys;
create policy condition_surveys_read on public.condition_surveys for select to authenticated
  using (project_id in (select fm_visible_project_ids())
         and (not (select fm_sees_approved_only()) or status = 'submitted'));

create or replace function public.fm_audit_survey()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_row condition_surveys;
  v_label text;
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATED'; v_row := new;
  elsif tg_op = 'DELETE' then
    v_action := 'DELETED'; v_row := old;
  elsif old.status is distinct from new.status then
    v_action := case when new.status = 'submitted' then 'SUBMITTED' else 'REOPENED' end;
    v_row := new;
  elsif old.facility_name is distinct from new.facility_name and coalesce(old.facility_name, '') = '' then
    v_action := 'NAMED'; v_row := new;
  else
    return coalesce(new, old);
  end if;

  v_label := coalesce(nullif(v_row.facility_name, ''), 'Unnamed facility');
  if v_row.facility_number is not null then
    v_label := format('FAC-%s · %s', lpad(v_row.facility_number::text, 3, '0'), v_label);
  end if;

  insert into app_audit_log (table_name, record_id, action, summary, old_data, new_data, changed_by, changed_by_email)
  values (
    'condition_surveys', v_row.id, v_action,
    format('Facility %s: %s', lower(v_action), v_label),
    case when tg_op <> 'INSERT' then jsonb_build_object('status', old.status, 'facility_name', old.facility_name) end,
    jsonb_build_object('status', v_row.status, 'facility_name', v_row.facility_name,
                       'facility_number', v_row.facility_number, 'project_id', v_row.project_id),
    auth.uid(),
    (select email from fm_survey_users where id = auth.uid())
  );
  return coalesce(new, old);
end;
$$;
