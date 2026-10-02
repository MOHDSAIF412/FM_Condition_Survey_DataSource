-- Apply before releasing the new web/Android client. Old sync clients are
-- refused by the guards and retain their local work; update them before retry.
-- No survey data or existing RLS policies are removed or relaxed.
begin;

create or replace function public.fm_atomic_sync_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_id text;
begin
  v_id := case when tg_table_name = 'condition_surveys' then to_jsonb(new)->>'id' else to_jsonb(new)->>'survey_id' end;
  if coalesce(current_setting('fm.atomic_survey', true), '') = v_id
     or coalesce(current_setting('fm.workflow', true), '') = 'on' then
    return new;
  end if;
  -- Project assignment and due dates are separate existing operations.
  if tg_table_name = 'condition_surveys' and tg_op = 'UPDATE'
     and (to_jsonb(new) - array['project_id','due_date','updated_at'])
       = (to_jsonb(old) - array['project_id','due_date','updated_at']) then
    if (to_jsonb(new)->'project_id', to_jsonb(new)->'due_date') is distinct from
       (to_jsonb(old)->'project_id', to_jsonb(old)->'due_date') then
      new.revision := old.revision + 1;
    end if;
    return new;
  end if;
  raise exception 'Safe sync requires the updated app. Your work remains on this device.' using errcode = '40001';
end;
$$;

drop trigger if exists condition_surveys_atomic_sync on public.condition_surveys;
drop trigger if exists survey_items_atomic_sync on public.survey_items;
drop trigger if exists survey_photos_atomic_sync on public.survey_photos;
create trigger condition_surveys_atomic_sync before insert or update on public.condition_surveys
for each row execute function public.fm_atomic_sync_guard();
create trigger survey_items_atomic_sync before insert or update on public.survey_items
for each row execute function public.fm_atomic_sync_guard();
create trigger survey_photos_atomic_sync before insert or update on public.survey_photos
for each row execute function public.fm_atomic_sync_guard();

create or replace function public.fm_commit_survey(
  p_survey jsonb, p_expected_revision integer, p_items jsonb, p_photos jsonb,
  p_deleted_items jsonb default '[]', p_deleted_photos jsonb default '[]'
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v public.condition_surveys;
  s public.condition_surveys;
  i public.survey_items;
  p public.survey_photos;
  j jsonb;
  d text;
  photo_id text;
  exists_on_server boolean;
  previous_context text := coalesce(current_setting('fm.atomic_survey', true), '');
begin
  if auth.uid() is null or not public.fm_can('edit_surveys') then
    raise exception 'Refused: your role cannot upload surveys.' using errcode = '42501';
  end if;
  s := jsonb_populate_record(null::public.condition_surveys, p_survey);
  if s.id is null or s.id = '' then raise exception 'A survey ID is required'; end if;
  -- The advisory lock also serializes the first insert, when no row exists.
  perform pg_advisory_xact_lock(hashtextextended(s.id, 0));
  select * into v from public.condition_surveys where id = s.id for update;
  exists_on_server := found;
  if (exists_on_server and p_expected_revision is distinct from v.revision)
     or (not exists_on_server and p_expected_revision is not null) then
    return jsonb_build_object('conflict', true, 'reason', 'stale', 'serverRevision', v.revision);
  end if;
  perform set_config('fm.atomic_survey', s.id, true);
  if exists_on_server then
    update public.condition_surveys set
      title = s.title, facility = s.facility, signatures = s.signatures,
      general_notes = s.general_notes, status = s.status, submitted_at = s.submitted_at,
      facility_name = s.facility_name, revision = v.revision + 1, updated_at = now(),
      project_id = case when p_survey ? 'project_id' then s.project_id else v.project_id end
    where id = s.id returning * into v;
    if not found then raise exception 'Refused: survey update was not allowed' using errcode = '42501'; end if;
  else
    insert into public.condition_surveys
      (id, title, facility, signatures, general_notes, status, submitted_at, facility_name, revision, project_id)
    values (s.id, s.title, s.facility, s.signatures, s.general_notes, s.status, s.submitted_at, s.facility_name, 1, s.project_id)
    returning * into v;
  end if;
  if (jsonb_array_length(p_deleted_items) > 0 or jsonb_array_length(p_deleted_photos) > 0)
     and not public.fm_can('delete_snags') then
    raise exception 'Refused: your role cannot delete snags or photos.' using errcode = '42501';
  end if;
  -- Keep existing archive/mass-delete protection. Delete one explicit row per
  -- statement, including an item's photos, rather than cascading a large batch.
  for d in select jsonb_array_elements_text(p_deleted_photos) loop
    delete from public.survey_photos where id = d and survey_id = s.id;
  end loop;
  for d in select jsonb_array_elements_text(p_deleted_items) loop
    for photo_id in select id from public.survey_photos where item_id = d and survey_id = s.id loop
      delete from public.survey_photos where id = photo_id and survey_id = s.id;
    end loop;
    delete from public.survey_items where id = d and survey_id = s.id;
  end loop;
  for j in select jsonb_array_elements(p_items) loop
    i := jsonb_populate_record(null::public.survey_items, j);
    if i.survey_id is distinct from s.id then raise exception 'Snag belongs to a different survey'; end if;
    if p_deleted_items ? i.id then continue; end if;
    insert into public.survey_items as target
      (id, survey_id, position, asset_name, department, location, priority, defect_description,
       estimated_cost, quantity, unit, custom_values, updated_at)
    values (i.id, s.id, i.position, i.asset_name, i.department, i.location, i.priority, i.defect_description,
       i.estimated_cost, i.quantity, i.unit, coalesce(i.custom_values, '{}'::jsonb), now())
    on conflict (id) do update set
      position = excluded.position, asset_name = excluded.asset_name, department = excluded.department,
      location = excluded.location, priority = excluded.priority, defect_description = excluded.defect_description,
      estimated_cost = excluded.estimated_cost, quantity = excluded.quantity, unit = excluded.unit,
      custom_values = case when j ? 'custom_values' then excluded.custom_values else target.custom_values end,
      updated_at = now()
    where target.survey_id = s.id;
    if not found then raise exception 'Snag ID belongs to another survey'; end if;
  end loop;
  for j in select jsonb_array_elements(p_photos) loop
    p := jsonb_populate_record(null::public.survey_photos, j);
    if p.survey_id is distinct from s.id then raise exception 'Photo belongs to a different survey'; end if;
    if p_deleted_photos ? p.id or p_deleted_items ? p.item_id then continue; end if;
    if not exists (select 1 from public.survey_items where id = p.item_id and survey_id = s.id) then
      raise exception 'Photo has no snag in this survey';
    end if;
    insert into public.survey_photos as target (id, survey_id, item_id, caption, name, storage_path, taken_at)
    values (p.id, s.id, p.item_id, p.caption, p.name, p.storage_path, p.taken_at)
    on conflict (id) do update set caption = excluded.caption, name = excluded.name,
      storage_path = excluded.storage_path, taken_at = excluded.taken_at
    where target.survey_id = s.id and target.item_id = p.item_id;
    if not found then raise exception 'Photo ID belongs to another snag'; end if;
  end loop;
  perform set_config('fm.atomic_survey', previous_context, true);
  return jsonb_build_object('pushed', true, 'cloudRevision', v.revision, 'facilityNumber', v.facility_number);
end;
$$;
revoke all on function public.fm_commit_survey(jsonb, integer, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.fm_commit_survey(jsonb, integer, jsonb, jsonb, jsonb, jsonb) to authenticated;
commit;
