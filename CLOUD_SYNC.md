# Cloud sync

Surveys now sync across devices through Supabase. A change made on a phone
appears on a laptop within a second or two, and vice versa.

**IndexedDB is still the source of truth on site.** The app works with no
signal; the cloud is a layer on top, not a replacement. That ordering is
deliberate - a surveyor in a plant room with no bars must never be blocked.

## What syncs

Assets, photos, facility details, signatures and deletions. All of it.

## How it behaves

| Situation | What happens |
| --- | --- |
| Edit on phone, laptop open | Laptop updates live, no refresh |
| Delete an asset | Disappears everywhere |
| Add a photo | Uploads, other devices download it |
| No signal | Keeps working, badge shows **Offline** |
| Signal returns | Pending work uploads, badge shows **Synced** |
| Fresh device, empty storage | Pulls the whole survey down |
| Two devices edit at once | Last write wins |

The badge in the header shows the state: **Cloud Sync On**, **Syncing…**,
**Synced**, or **Offline**.

## Setup

`.env.local` holds the credentials (gitignored):

```
VITE_SUPABASE_URL=https://yymyqygpyxbndifrgjvo.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

**The same two variables must be set in Vercel**, or the deployed site will
silently run in local-only mode: *Project → Settings → Environment Variables*,
then redeploy. Without them nothing breaks, but nothing syncs either.

## Tables

Standalone, referencing nothing in the existing CAFM schema:

- `condition_surveys` - facility, signatures, notes, revision
- `survey_items` - one row per asset/defect
- `survey_photos` - captions and the storage path, never the image bytes
- `survey-photos` storage bucket - private, 10 MB per file, JPEG/PNG/WebP

## Security

The app has no login, so **every device shares one workspace**: anyone who can
open the app sees and edits the same surveys. Access is granted to the `anon`
role but scoped strictly to these three tables and that one bucket - it cannot
touch any CAFM table.

Since the Vercel site is public, treat this as: anyone who finds the URL can
read and edit survey data. If that is not acceptable, the fix is a login, and
surveys then get scoped per user.

## Known limitation

Deleting an asset removes its photo rows, but the image files stay in the
bucket. Harmless, though storage use creeps up over time. A periodic cleanup
job would fix it.
