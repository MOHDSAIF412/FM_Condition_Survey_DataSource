-- In Supabase SQL Editor run EACH CREATE INDEX statement separately.
-- CONCURRENTLY must run outside a transaction; do not submit this whole file
-- as one editor query. Then run the verification SELECT separately.
-- These indexes add lookup paths only; no report rows or access policies change.
create index concurrently if not exists fm_inspection_items_order_idx
  on public.survey_items (survey_id, position);
create index concurrently if not exists fm_inspection_photos_survey_idx
  on public.survey_photos (survey_id);
create index concurrently if not exists fm_inspection_photos_item_idx
  on public.survey_photos (item_id);
create index concurrently if not exists fm_inspection_project_updated_idx
  on public.condition_surveys (project_id, updated_at desc);

-- Verify that all four indexes are valid and ready.
select i.relname as index_name, x.indisvalid, x.indisready,
       pg_get_indexdef(i.oid) as definition
from pg_index x join pg_class i on i.oid = x.indexrelid
where i.relname in ('fm_inspection_items_order_idx',
 'fm_inspection_photos_survey_idx', 'fm_inspection_photos_item_idx',
 'fm_inspection_project_updated_idx');
