# Cloud sync

IndexedDB keeps the device copy. Supabase Auth, project membership, and RLS
control cloud access. The browser uses a publishable key; administration that
requires elevated access runs in supabase/functions/admin-users.

## Uploads

1. Save the device snapshot locally.
2. Upload photo objects, retaining failed photos for retry.
3. Call fm_commit_survey with the last observed server revision.
4. In one transaction, the RPC locks the survey, checks that revision, updates
   its metadata, applies explicit deletions, and upserts its snags/photo rows.
5. Save the receipt locally. Newer edits and failed photos remain pending.

The RPC runs with the caller's permissions. Existing RLS, approval locks, delete
archives, and mass-delete limits remain in force. A child-row error rolls back
the parent revision and every row change. Storage objects upload before that
transaction; unused uploads can remain if the transaction fails. No automatic
Storage cleanup is introduced.

## Conflicts and retries

The app never automatically substitutes a new revision into an old snapshot.
A conflict keeps the local copy pending and offers a comparison plus JSON
download. Choosing the server copy first saves a separate recovery record in
IndexedDB; find it in **Recovery backups**. Reconcile remaining changes manually
against the server copy. This is deliberate conflict review, not field merging.

Connectivity restoration, manual Sync, and a 30-second retry while online with
waiting work process pending uploads. Failed photos keep their bytes and are
retried against the confirmed server revision. Access refusals require corrected
permissions or sign-in; conflicting copies require review.

## Configuration and release

Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY locally and in Vercel.
Without them, the app runs locally without cloud/authentication.

The new client requires 20261002_atomic_survey_sync.sql. Read
[SYNC_ROLLOUT.md](SYNC_ROLLOUT.md) before release. That migration refuses old
direct sync writers, which must update before retrying; it does not delete their
device work. Project assignment, due dates, review transitions, and explicit
facility deletion retain their existing permission checks.
