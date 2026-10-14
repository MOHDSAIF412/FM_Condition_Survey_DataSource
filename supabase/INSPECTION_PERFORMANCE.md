# Inspection performance verification — 14 October 2026

App changes deployed in commit 70062ed: cached records open immediately,
first-time editing requests metadata only, independent reads run in parallel,
photos load near the viewport with account-scoped memory/disk caching, and
unchanged finding cards skip rendering. The synthetic 80-finding/400-photo
browser test averaged 98 ms per edit before and 5 ms after (development build;
these are render measurements, not end-to-end phone opening timings).

Live database project: yymyqygpyxbndifrgjvo.

Verified existing indexes are valid and ready:

- condition_surveys_pkey: inspection ID.
- condition_surveys_project_id_idx: project filtering/access.
- survey_items_survey_id_idx: finding lookup.
- survey_photos_survey_id_idx: inspection photo lookup.
- survey_photos_item_id_idx: finding photo lookup.
- fm_project_members_pkey and fm_project_members_user_idx: membership lookup.

EXPLAIN ANALYZE for the largest inspected record (78 findings) uses the existing
survey_items_survey_id_idx followed by an in-memory sort. Warm execution was
approximately 0.24 ms inside PostgreSQL, excluding HTTP latency and photos.
A (survey_id, position) candidate was created and tested; the planner continued
to prefer the existing index, so the candidate was removed. Both applied
migration files mirror the live migration history. The earlier unverified
four-index proposal has been removed to avoid duplicate indexes.

No report rows, photos, access policies, or deletion protections were changed.

The performance advisor has a separate existing membership-policy auth-initplan
recommendation; that is outside the inspection-index change:
https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
