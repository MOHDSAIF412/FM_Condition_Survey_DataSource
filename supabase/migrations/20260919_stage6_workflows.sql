-- Stage 6: Workflows -- review, approval and due dates.
--
--   Draft -> Submitted -> In review -> Approved
--                 \______________/
--                  Changes requested (back to the surveyor, with a note)
--
-- `status` (draft / submitted) is untouched: the mobile app reads and writes
-- it exactly as before. Review is a separate column that only changes through
-- fm_workflow_move(), which checks the caller's permissions. Approved
-- facilities are locked -- the facility row, its snags and its photos --
-- until someone with Approve reopens them. Clients see approved facilities
-- only. Every move is recorded in the audit log.
--
-- Undo: 20260919_stage6_workflows.rollback.sql (keeps the new columns and
-- their data; removes the rules).

-- 1. Columns -------------------------------------------------------------------

alter table public.condition_surveys
  add column if not exists review_status text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists due_date date;

alter table public.condition_surveys drop constraint if exists condition_surveys_review_status_check;
alter table public.condition_surveys add constraint condition_surveys_review_status_check
  check (review_status is null or review_status in ('in_review', 'changes_requested', 'approved'));

alter table public.projects add column if not exists due_date date;

-- 2. Guards ----------------------------------------------------------------------

-- Review fields change only through fm_workflow_move(); approved facilities
-- cannot be changed or deleted; due dates are for those who plan or review --
-- not for surveyors, who hold "Manage projects" only so they can create one.
create or replace function public.fm_workflow_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_workflow boolean := coalesce(current_setting('fm.workflow', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_workflow then
      new.review_status := null; new.review_note := null;
      new.reviewed_by := null; new.reviewed_at := null;
      new.approved_by := null; new.approved_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.review_status = 'approved' then
      raise exception 'Refused: this facility is approved and locked. A Manager or Admin can reopen it.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if v_workflow then
    return new;
  end if;

  if old.review_status = 'approved' then
    raise exception 'Refused: this facility is approved and locked. A Manager or Admin can reopen it.'
      using errcode = '42501';
  end if;

  if (new.review_status, new.review_note, new.reviewed_by, new.reviewed_at, new.approved_by, new.approved_at)
     is distinct from
     (old.review_status, old.review_note, old.reviewed_by, old.reviewed_at, old.approved_by, old.approved_at) then
    raise exception 'Refused: review and approval change only through Review & Approval.'
      using errcode = '42501';
  end if;

  if new.due_date is distinct from old.due_date and auth.uid() is not null
     and not (fm_can('manage_team') or fm_can('review_surveys') or fm_can('approve_surveys')) then
    raise exception 'Refused: your role cannot change due dates.' using errcode = '42501';
  end if;

  -- Sent back, fixed and submitted again: back in the review queue. Taken out
  -- of review by the surveyor reopening it: out of the queue.
  if old.status is distinct from new.status then
    if new.status = 'submitted' and old.review_status = 'changes_requested' then
      new.review_status := null;
    end if;
    if new.status <> 'submitted' and old.review_status = 'in_review' then
      new.review_status := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists condition_surveys_workflow_guard on public.condition_surveys;
create trigger condition_surveys_workflow_guard before insert or update or delete on public.condition_surveys
  for each row execute function public.fm_workflow_guard();

-- A project's due date: the same people as a facility's.
create or replace function public.fm_project_due_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.due_date is distinct from old.due_date and auth.uid() is not null
     and not (fm_can('manage_team') or fm_can('approve_surveys')) then
    raise exception 'Refused: your role cannot change due dates.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_due_guard on public.projects;
create trigger projects_due_guard before update on public.projects
  for each row execute function public.fm_project_due_guard();

-- Snags and photos of an approved facility are locked with it.
create or replace function public.fm_locked_facility_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_survey text := case when tg_op = 'DELETE' then old.survey_id else new.survey_id end;
begin
  if coalesce(current_setting('fm.workflow', true), '') <> 'on'
     and exists (select 1 from condition_surveys where id = v_survey and review_status = 'approved') then
    raise exception 'Refused: this facility is approved and locked. A Manager or Admin can reopen it.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists survey_items_locked_guard on public.survey_items;
create trigger survey_items_locked_guard before insert or update or delete on public.survey_items
  for each row execute function public.fm_locked_facility_guard();
drop trigger if exists survey_photos_locked_guard on public.survey_photos;
create trigger survey_photos_locked_guard before insert or update or delete on public.survey_photos
  for each row execute function public.fm_locked_facility_guard();

-- 3. Moving a facility through the workflow ------------------------------------------

create or replace function public.fm_workflow_move(p_survey_id text, p_action text, p_note text default null)
returns public.condition_surveys
language plpgsql security definer set search_path = public as $$
declare
  v condition_surveys;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v from condition_surveys where id = p_survey_id for update;
  if not found or v.project_id not in (select fm_visible_project_ids()) then
    raise exception 'That facility was not found.';
  end if;

  perform set_config('fm.workflow', 'on', true);

  if p_action = 'start_review' then
    if not fm_can('review_surveys') then
      raise exception 'Refused: your role cannot review facilities.' using errcode = '42501';
    end if;
    if v.status <> 'submitted' or v.review_status is not null then
      raise exception 'Only a submitted facility that is waiting for review can be started.';
    end if;
    update condition_surveys
       set review_status = 'in_review', reviewed_by = auth.uid(), reviewed_at = now(),
           revision = revision + 1, updated_at = now()
     where id = p_survey_id returning * into v;

  elsif p_action = 'request_changes' then
    if not fm_can('review_surveys') then
      raise exception 'Refused: your role cannot review facilities.' using errcode = '42501';
    end if;
    if v.status <> 'submitted' or v.review_status = 'approved' then
      raise exception 'Changes can be requested only on a submitted facility that is not approved.';
    end if;
    if v_note is null then
      raise exception 'Say what needs changing, so the surveyor knows what to fix.';
    end if;
    update condition_surveys
       set status = 'draft', review_status = 'changes_requested', review_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now(),
           revision = revision + 1, updated_at = now()
     where id = p_survey_id returning * into v;

  elsif p_action = 'approve' then
    if not fm_can('approve_surveys') then
      raise exception 'Refused: your role cannot approve facilities.' using errcode = '42501';
    end if;
    if v.status <> 'submitted' or v.review_status = 'approved' then
      raise exception 'Only a submitted facility can be approved.';
    end if;
    update condition_surveys
       set review_status = 'approved', approved_by = auth.uid(), approved_at = now(),
           reviewed_by = coalesce(reviewed_by, auth.uid()), reviewed_at = coalesce(reviewed_at, now()),
           review_note = coalesce(v_note, review_note),
           revision = revision + 1, updated_at = now()
     where id = p_survey_id returning * into v;

  elsif p_action = 'reopen' then
    if not fm_can('approve_surveys') then
      raise exception 'Refused: your role cannot reopen approved facilities.' using errcode = '42501';
    end if;
    if v.review_status is distinct from 'approved' then
      raise exception 'Only an approved facility can be reopened.';
    end if;
    update condition_surveys
       set status = 'draft', review_status = null, approved_by = null, approved_at = null,
           review_note = coalesce(v_note, review_note),
           revision = revision + 1, updated_at = now()
     where id = p_survey_id returning * into v;

  else
    raise exception 'Unknown workflow step: %', p_action;
  end if;

  perform set_config('fm.workflow', 'off', true);
  return v;
end;
$$;

revoke all on function public.fm_workflow_move(text, text, text) from public, anon;
grant execute on function public.fm_workflow_move(text, text, text) to authenticated;
revoke all on function public.fm_workflow_guard() from public, anon, authenticated;
revoke all on function public.fm_locked_facility_guard() from public, anon, authenticated;
revoke all on function public.fm_project_due_guard() from public, anon, authenticated;

-- 4. Clients see approved facilities only ------------------------------------------------

create or replace function public.fm_visible_survey_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select s.id
  from condition_surveys s
  where s.project_id in (select fm_visible_project_ids())
    and (not fm_sees_approved_only() or s.review_status = 'approved');
$$;

drop policy if exists condition_surveys_read on public.condition_surveys;
create policy condition_surveys_read on public.condition_surveys for select to authenticated
  using (project_id in (select fm_visible_project_ids())
         and (not (select fm_sees_approved_only()) or review_status = 'approved'));

-- 5. Audit: review steps in the facility history ------------------------------------------

create or replace function public.fm_audit_survey()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_row condition_surveys;
  v_label text;
  v_words text;
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATED'; v_row := new;
  elsif tg_op = 'DELETE' then
    v_action := 'DELETED'; v_row := old;
  elsif old.review_status is distinct from new.review_status and new.review_status is not null then
    v_action := case new.review_status
      when 'in_review' then 'IN_REVIEW'
      when 'changes_requested' then 'CHANGES_REQUESTED'
      else 'APPROVED' end;
    v_row := new;
  elsif old.review_status = 'approved' and new.review_status is null then
    v_action := 'UNLOCKED'; v_row := new;
  elsif old.status is distinct from new.status then
    v_action := case when new.status = 'submitted' then 'SUBMITTED' else 'REOPENED' end;
    v_row := new;
  elsif old.facility_name is distinct from new.facility_name and coalesce(old.facility_name, '') = '' then
    -- A facility is usually inserted before its name is typed; record the name once it exists.
    v_action := 'NAMED'; v_row := new;
  else
    return coalesce(new, old);
  end if;

  v_label := coalesce(nullif(v_row.facility_name, ''), 'Unnamed facility');
  if v_row.facility_number is not null then
    v_label := format('FAC-%s · %s', lpad(v_row.facility_number::text, 3, '0'), v_label);
  end if;
  v_words := case v_action
    when 'IN_REVIEW' then 'review started'
    when 'CHANGES_REQUESTED' then 'changes requested'
    when 'APPROVED' then 'approved'
    when 'UNLOCKED' then 'reopened after approval'
    else lower(v_action) end;

  insert into app_audit_log (table_name, record_id, action, summary, old_data, new_data, changed_by, changed_by_email)
  values (
    'condition_surveys', v_row.id, v_action,
    format('Facility %s: %s', v_words, v_label),
    case when tg_op <> 'INSERT' then jsonb_build_object('status', old.status, 'facility_name', old.facility_name, 'review_status', old.review_status) end,
    jsonb_build_object('status', v_row.status, 'facility_name', v_row.facility_name,
                       'facility_number', v_row.facility_number, 'project_id', v_row.project_id,
                       'review_status', v_row.review_status, 'review_note', v_row.review_note),
    auth.uid(),
    (select email from fm_survey_users where id = auth.uid())
  );
  return coalesce(new, old);
end;
$$;
