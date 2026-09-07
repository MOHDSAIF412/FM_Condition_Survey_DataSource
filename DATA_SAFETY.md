# Data safety

Survey data was lost more than once in this project. Every one of those losses
was caused by application code, so the protections below deliberately live in
the **database**, underneath the app. A promise made in JavaScript is worth
nothing when JavaScript is the thing that fails.

## 1. Nothing is deleted without being archived first

A `BEFORE DELETE` trigger on `survey_items`, `survey_photos` and
`condition_surveys` copies the complete row into `deleted_rows_archive` before
it goes. This fires no matter what issued the delete — the phone, the web app, a
sync fault, or a stray SQL statement.

The archive is **read-only to the app**: the anon key has a `SELECT` policy and
nothing else, so the same bug that deletes a snag cannot erase the evidence.

## 2. Mass deletion is refused

The fault that destroyed the data ran a single statement deleting every item in
a survey. An `AFTER DELETE ... FOR EACH STATEMENT` trigger now counts the rows
removed and aborts if one statement takes more than **5**. The whole transaction
rolls back, so the outcome is "nothing deleted" rather than "half deleted".

Verified by running the original destructive statement against 8 rows: refused,
and all 8 survived.

Normal work is unaffected — deleting one snag or one photo at a time is what the
app actually does.

## 3. Photo files are never deleted

Image files in the `survey-photos` bucket are not removed when a photo row goes.
That is why six photos were recoverable after their database rows were
destroyed, including three taken on the phone. Storage is cheap; a site photo
that cannot be retaken is not.

## Recovering deleted work

```sql
-- Everything deleted from a survey in the last 30 days
select * from public.restore_deleted_items('survey_id_here');

-- Or a narrower window
select * from public.restore_deleted_items('survey_id_here', '2 hours');
```

Snags are restored first, then their photos, so nothing is orphaned. Rows that
still exist are skipped, so running it twice is safe.

To see what was deleted before restoring anything:

```sql
select table_name, row_id, deleted_at, row_data->>'asset_name' as name
from public.deleted_rows_archive
where survey_id = 'survey_id_here'
order by deleted_at desc;
```

## What this does not cover

- **Deliberate deletion by an administrator** using the service-role key can
  still bypass RLS, and the mass-delete guard can be disabled on purpose. These
  guards stop accidents and bugs, not someone with admin access acting
  intentionally.
- **The archive is not a backup.** It captures deletions, not the whole
  database. For point-in-time recovery of everything, Supabase's own backups
  are the right tool.
- Rows deleted **before** these triggers existed were not captured.
