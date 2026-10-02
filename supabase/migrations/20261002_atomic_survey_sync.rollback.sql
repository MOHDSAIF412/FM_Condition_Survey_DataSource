-- Restore the previous app release together with this rollback. No data removed.
begin;
drop trigger if exists condition_surveys_atomic_sync on public.condition_surveys;
drop trigger if exists survey_items_atomic_sync on public.survey_items;
drop trigger if exists survey_photos_atomic_sync on public.survey_photos;
drop function if exists public.fm_atomic_sync_guard();
drop function if exists public.fm_commit_survey(jsonb, integer, jsonb, jsonb, jsonb, jsonb);
commit;
