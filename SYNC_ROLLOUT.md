# Atomic sync release — 2026-10-02

Status: implementation and isolated tests are local. No production database
migration, deployment, or physical Android verification has been performed.

## Prerequisites

The production schema must already contain the roles/project-access and workflow
migrations, including fm_can, condition_surveys.facility_number,
survey_items.custom_values, review guards, and the existing delete archive and
mass-delete protection. This repository does not contain a complete baseline
schema; inspect those production objects before applying the migration.

## Rollout order

1. Record the deployed web/OTA version and back up the database. Have active
   surveyors sync or export JSON before the cutover.
2. Apply supabase/migrations/20261002_atomic_survey_sync.sql in staging, then
   verify two authorized accounts editing the same facility: the second stale
   write must return a conflict with both copies preserved.
3. Verify a real surveyor's RLS, approved-facility refusal, custom values,
   existing archive triggers, photos, and explicit deletion in staging.
4. Apply the same migration to production, then deploy the web and Android OTA
   bundle together. Old direct writers receive an update-required error; there
   is intentionally no unsafe fallback while versions overlap.
5. Close and reopen web tabs to activate a waiting application update. Confirm
   Android receives the OTA update, then test camera → offline edits → restart
   → reconnect → photos/reports on another device.

The migration changes functions/triggers only; it does not rewrite survey data
or change RLS. Deletes still use explicit IDs and existing permissions. A stale
or missing base revision cannot overwrite an existing survey. A lost response
after a successful commit may surface as a conflict on retry; compare the copies
instead of forcing a resend.

## Rollback

Restore the preceding app/OTA release together with
20261002_atomic_survey_sync.rollback.sql. The rollback drops only the new RPC
and guards; it preserves surveys, photos, roles, approval state, and existing
triggers. The old release restores its former non-atomic sync behavior, so
coordinate rollback and avoid concurrent edits during that window.

## Local verification

npm test exercises the migration and rollback against isolated PostgreSQL
fixtures, including RLS, stale revisions, row ownership, and partial-failure
rollback. IndexedDB tests cover new edits during uploads and failed-photo retry
after restart. These fixtures do not certify the live schema or native plugins.

Browser verification used a separate local-only production build: the app
reloaded with its preview server stopped, an unopened lazy report screen loaded
from cache, and missing facility-name validation focused the input without a
blocking alert.
