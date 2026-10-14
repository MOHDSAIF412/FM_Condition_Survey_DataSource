-- Applied to live Supabase; tested against inspection-opening query plans.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create index if not exists fm_inspection_items_order_idx
  on public.survey_items (survey_id, position);
