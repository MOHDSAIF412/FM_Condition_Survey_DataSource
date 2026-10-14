-- Live query plans continued to prefer the existing survey_id index.
-- Remove only the candidate introduced by the preceding migration.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
drop index if exists public.fm_inspection_items_order_idx;
