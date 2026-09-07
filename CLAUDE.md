# PROJECT CONTEXT

*Last updated: 2026-09-07, end of session. Written and re-verified by
inspecting the actual source tree, `git log`, and the live Supabase database —
not from memory of the conversation. If a later session finds this file
disagrees with the code, the code is correct; update this file to match.*

*Current HEAD at time of writing: `ad3d134`. If `git log -1` shows something
different, treat §8/§11 below as a starting point, not the final word — diff
forward from `ad3d134` to see what changed since.*

## 0. Quick Status (read this first)

- **Live and working**, both web and app, as of this commit.
- **The one open question**: is the "item disappears after ~1 second" fix
  (commit `18662ce`) actually confirmed gone on the user's phone? Ask before
  doing anything else — see §11.
- **Nothing is broken right now** that this session knows of. §3 lists things
  that are *unverified*, not things known to be *failing*.
- Working tree is clean, nothing uncommitted, nothing stashed.

## 1. Project Purpose

**FM Condition Survey** — a facilities-management building condition/defect
survey app for **OCS** (a facilities company), used to survey the **Abu Dhabi
Equestrian Club**.

A surveyor walks a site, records defects ("snags") against building
assets/locations with department, priority (P1–P4), estimated remediation
cost, and photos, captures GPS, and gets a client-facing **PDF** and **Excel**
report. It runs as:

- A **web app** (React + Vite, deployed on Vercel)
- An **Android APK** (same code, wrapped with Capacitor), receiving most
  updates **over-the-air** without a new APK

Everything works **offline-first**: a surveyor with no signal can do a full
inspection, and data syncs to Supabase automatically when connectivity
returns.

## 2. Current Status

Working and live:

- Web: **https://fm-condition-survey-data-source.vercel.app**
- GitHub: **https://github.com/MOHDSAIF412/FM_Condition_Survey_DataSource**
  (public repo — see §6 for what that means for the data it contains)
- Supabase project `yymyqygpyxbndifrgjvo` (org **SHEVER-CAFM**), live data:
  as of this session, 2 surveys, 4 snags, 6 photos.
- OTA update pipeline is live and has shipped several fixes with zero APK
  reinstalls.
- Cloud sync (phone ⇄ web ⇄ Supabase) is live and — as of this session's
  final commit — no longer destructive (see §3 history and §8).
- Real device GPS (Capacitor Geolocation), native Camera capture, and network
  detection are implemented and wired in; **not yet verified on a physical
  Android device** (see §10).
- Database-level delete protection is live: archiving trigger + mass-delete
  block + `restore_deleted_items()` recovery function (§6, `DATA_SAFETY.md`).

## 3. Current Problems / Bugs

**Not yet verified on a real phone** (only simulated in a browser — see §10):
- Native camera capture end-to-end
- Native GPS capture end-to-end
- A genuine offline → airplane-mode-off → auto-sync cycle
- Whether the "item disappears within ~1 second of adding" bug (fixed in the
  final commit of this session, `18662ce`) is actually gone on-device. It was
  reproduced and fixed at the logic level and shipped, but not confirmed by
  the user yet.

**Known but not addressed (raise with the user before touching):**
- `test_verify.js` at the project root imports
  `./src/data/sampleSurvey.js`, which **no longer exists** (deleted in commit
  `ee33222` to permanently remove demo data). Running this file will throw.
  It is not part of the build (`npm run build`/`npm run dev` never touch it),
  so it is harmless dead weight, not a live bug. Same for `test_exceljs.js`
  (still runnable, just a standalone manual smoke test, not wired into any
  script).
- Repo is **public** on GitHub with a real client name (Abu Dhabi Equestrian
  Club), real facility GPS coordinates, and OCS branding baked in. This was a
  deliberate, confirmed user choice earlier in the project (not an oversight)
  — see §6.
- No login/auth. Every device shares one Supabase workspace via the public
  anon key. Anyone with the URL can read and write all survey data. Flagged
  to the user; not asked to be fixed.

## 4. User Requirements

In the order they were requested, condensed:

1. Fix PDF/Excel report bugs: photos overflowing their box, PDF logo stretched.
2. Push the project to GitHub; deploy to Vercel.
3. Explain browser storage limits/persistence.
4. Fix cross-tab / cross-device data sync (assets differed between browsers).
5. Build an Android APK of the same app — "don't want to change the app".
6. Redesign UI to look "world class", "colourful", with the OCS logo correct
   in the dashboard and reports; tab switching smooth (90fps ask).
7. Remove the "Stakeholders & Surveyor Team" section entirely.
8. Rename "Asset" → "Snag" everywhere (UI, PDF, Excel) — **without** touching
   existing stored data.
9. Remove the facility preset dropdowns and all example/placeholder text.
10. Add an **OTA update system** so most changes don't need a new APK install.
11. Show all costs in **AED**, not USD.
12. A large, formal spec (verbatim, numbered) demanding:
    - Remove "Facility / Asset Reference Code" completely.
    - Fix GPS (real device GPS, accuracy, timestamp, offline-capable, retry).
    - Facility Name must start empty, never auto-filled.
    - Fix photo capture returning to the wrong screen after taking a photo.
    - Multiple photos per snag, none replacing another.
    - Photo sync status indicators (Saved/Uploading/Synced/Retry).
    - Full offline mode + automatic sync on reconnect + sync queue + retry +
      duplicate prevention (idempotent by UUID).
    - No data loss on navigation.
13. "All data in one place" — mobile and web must show the same data.
    Excel report was missing photos that had synced from mobile.
    A **Submit** action to finish one facility and start the next, with all
    submitted facilities listed for report generation.
14. Facility Name field could not be cleared (kept repopulating).
15. "Make sure every data is safe, not deleted without permission" — led to
    the database-level archive/restore/mass-delete-block system.
16. Two bugs: a second uploaded photo, and a newly added snag on mobile, both
    visually appeared then vanished within ~1 second.
17. This file, first version.
18. Re-review this file against the actual project and fill any gaps —
    the version you're reading now is the result.

## 4a. Files Changed, Most Recent Commits First

Quick-scan table for "what did the last session actually touch". Full
reasoning for each is in the commit message (`git show <hash>`) and in §8.

Verified against `git diff-tree --name-status` for each commit (not assumed).

| Commit | Files touched | What changed |
|---|---|---|
| `ad3d134` (HEAD) | `CLAUDE.md` | This file — first version. |
| `18662ce` | `src/App.jsx` | Fixed item-disappears-after-1-second race (see §0, §11). |
| `5f9c71a` | `DATA_SAFETY.md` (local repo). DB side: 3 Supabase migrations applied directly — archive trigger, mass-delete block, `restore_deleted_items()`. No other local files. | DB-level delete archive, mass-delete block, `restore_deleted_items()`. |
| `ee33222` | `src/App.jsx`, `src/components/Header.jsx`, `src/data/sampleSurvey.js` (**deleted**) | Removed demo-data seeding permanently; recovered orphaned photos in prod DB. |
| `4fc603c` | `src/App.jsx`, `src/components/FacilityInfo.jsx`, `src/components/SavedFacilities.jsx` (**new**) | Facility Name clear-bug fix; Saved Facilities panel with PDF/Excel download per facility. |
| `aae7759` | `src/App.jsx`, `src/components/AssetItemCard.jsx`, `src/components/ReportModal.jsx`, `src/utils/cloudSync.js` | Replaced destructive delete+reinsert sync with upsert+tombstones; added `hydratePhotos()`; Submit & Start New Facility. |
| `84db0d3` | `src/utils/geolocation.js` (**new**), `src/utils/network.js` (**new**), `src/utils/photoCapture.js` (**new**), `src/utils/syncQueue.js` (**new**), `src/utils/storage.js`, `src/utils/cloudSync.js`, `src/utils/excelGenerator.js`, `src/utils/pdfGenerator.js`, `src/types/survey.js`, `src/App.jsx`, `src/components/AssetItemCard.jsx`, `src/components/FacilityInfo.jsx`, `src/components/Header.jsx`, `src/components/ReportModal.jsx`, `src/data/sampleSurvey.js`, `android/app/src/main/AndroidManifest.xml`, `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, `package.json`, `package-lock.json` | Native GPS/Camera/Network wired in; offline sync queue; reference-code field removed. This is the commit that needed a new APK (native permissions changed). |
| `f23206f` | `api/ota.js` (**new**), `scripts/build-ota.mjs` (**new**), `scripts/ship.mjs` (**new**), `capacitor.config.json`, `src/main.jsx`, `src/utils/otaUpdates.js` (**new**) | OTA update pipeline. |

Earlier commits (initial build through the first cloud-sync/branding pass) —
see `git log --oneline` for the full list; §8 narrates them.

## 5. Important Files

```
src/App.jsx                    Root component. Survey state, tab routing,
                                autosave, cloud push/pull orchestration,
                                Submit & Start New Facility, facility switcher.
                                Read this first to understand data flow.

src/components/
  Header.jsx                   Top bar: OCS logo, online/sync status pill.
  Navigation.jsx                Desktop tabs + mobile bottom nav.
  FacilityInfo.jsx              Facility name/address + GPS capture UI.
  SurveyList.jsx                List of snags for the current facility.
  AssetItemCard.jsx             One snag: fields, photo capture/thumbnails/
                                 sync badges. (Component name still
                                 "AssetItemCard" — internal only, UI says "Snag".)
  AnalyticsView.jsx             CapEx/priority dashboard ("Score & CapEx" tab).
  SignatureSection.jsx          Surveyor/client sign-off + Saved Facilities list.
  SavedFacilities.jsx           Lists submitted/draft facilities with PDF/Excel
                                 download buttons per facility (pulls from server,
                                 hydrates photos first).
  ReportModal.jsx               On-screen report preview + triggers PDF/Excel.

src/utils/
  storage.js                    IndexedDB (device-local). Survey CRUD,
                                 revision counter, BroadcastChannel for
                                 same-browser cross-tab sync.
  cloudSync.js                  Supabase sync: push/pull survey, photo
                                 upload/download, hydratePhotos(),
                                 listSurveys(), realtime subscription.
                                 THE MOST IMPORTANT FILE for data integrity —
                                 read the comments before touching.
  syncQueue.js                  Durable offline job queue (IndexedDB), retry
                                 backoff, idempotent by job id.
  network.js                    Online/offline detection (native + browser).
  geolocation.js                Device GPS capture (native + browser fallback).
  photoCapture.js                Native Camera/Gallery capture + browser file
                                 input fallback; photo UUID generation.
  otaUpdates.js                 Wires @capgo/capacitor-updater; calls
                                 notifyAppReady() (required or updates roll
                                 back).
  currency.js                   Single source of truth for money formatting
                                 (AED). Everything else must call formatMoney().
  pdfGenerator.js / excelGenerator.js
                                 Report generation. Both read photo.dataUrl —
                                 if empty, hydratePhotos() must be called first.
  fileSaver.js                  Cross-platform save (browser download vs
                                 native Filesystem+Share).

api/ota.js                      Vercel serverless function. Phone POSTs its
                                 current bundle version; returns a download
                                 URL or "no update".
scripts/build-ota.mjs           Runs after `vite build`; zips dist/ into
                                 dist/ota/bundle-<version>.zip + manifest.json.
scripts/ship.mjs                `npm run ship "message"` — commit, push, done.

android/                        Generated Capacitor native project. Do not
                                 hand-edit generated files; edit
                                 capacitor.config.json / AndroidManifest.xml
                                 permissions block, then `npx cap sync android`.

ANDROID.md                      How to build the APK (JDK 17+21 toolchain
                                 quirks documented — Android Studio's own
                                 bundled JDK does NOT work, see file).
CLOUD_SYNC.md                   How cloud sync behaves, env vars needed.
DATABASE.md                     Original "why Supabase" rationale (some of
                                 this predates the actual schema — DATA_SAFETY.md
                                 and this file are more current).
DATA_SAFETY.md                  The delete-archive/mass-delete-block/restore
                                 system added this session. Read before any
                                 work that touches deletion logic.
README.md                       Original project README (general).
```

## 6. Database / API

**Supabase project:** `yymyqygpyxbndifrgjvo`, org `SHEVER-CAFM`, region
ap-northeast-1 (Tokyo). This is a **shared Supabase account** that also hosts
an unrelated CAFM (computerised facilities management) system with its own
tables — this project's tables are deliberately **standalone** and reference
nothing in that CAFM schema. Do not join against `buildings`, `work_orders`,
`profiles`, etc. — they belong to that other system.

**This project's tables (all in `public` schema):**

| Table | Purpose |
|---|---|
| `condition_surveys` | One row per facility inspection. Columns: `id` (client-generated), `title`, `facility` (jsonb), `signatures` (jsonb), `general_notes`, `revision` (int, optimistic concurrency), `status` (`draft`/`submitted`), `submitted_at`, `facility_name` (denormalised for listing), `updated_at`. |
| `survey_items` | One row per snag. `id`, `survey_id`, `position`, `asset_name`, `department`, `location`, `priority`, `defect_description`, `estimated_cost`, `quantity`, `unit`. |
| `survey_photos` | One row per photo. `id`, `survey_id`, `item_id`, `caption`, `name`, `storage_path` (points into Storage, **not** the image bytes), `taken_at`. |
| `deleted_rows_archive` | Safety net (added this session). Every row deleted from the three tables above is copied here by a trigger first. Read-only to the app (`SELECT` only for `anon`/`authenticated`). |

**Storage bucket:** `survey-photos` — **private**, 10 MB/file limit,
JPEG/PNG/WebP only. Image bytes live here; DB rows only hold the path.

**Auth:** none. No Supabase Auth, no login screen. Every client uses the
public **anon publishable key** and every device shares one workspace — RLS
policies grant `anon`/`authenticated` full access to exactly these four
tables/this one bucket, nothing else. This is a known, accepted trade-off,
not an oversight — raised with the user, they chose to proceed without auth.

**Key server-side functions (see `DATA_SAFETY.md` for full detail):**
- `archive_deleted_row()` — trigger function, copies deleted rows to the archive.
- `block_mass_delete()` — trigger function, **refuses any single statement
  that deletes more than 5 rows** from `survey_items`/`survey_photos`, rolling
  back the whole transaction. This exists because a wholesale
  `DELETE ... WHERE survey_id = X` used to be how `pushSurvey()` synced items,
  and it destroyed data twice. Do not raise this threshold or remove this
  trigger without understanding why it's there.
- `restore_deleted_items(survey_id, interval default 30 days)` — puts deleted
  snags + their photos back from the archive; idempotent (safe to re-run).

**Sync model (`src/utils/cloudSync.js`):** upsert-based, **not** wholesale
delete+reinsert. Deletions travel as explicit tombstone arrays
(`deletedItemIds`, `deletedPhotoIds`) set only when the user actually deletes
something in the UI, and cleared once the push confirms. Conflict detection
is optimistic-concurrency via `revision` + `cloudRevision` (the revision the
client last actually pulled) — **not** a simple `if (mine > theirs)` compare,
because that was defeated once already (see git history `64a052f`).

**Environment variables** (`.env.local`, gitignored; also set in Vercel
Project Settings → Environment Variables for Production/Preview/Development):
```
VITE_SUPABASE_URL=<project URL>
VITE_SUPABASE_ANON_KEY=<publishable anon key — safe to expose, it's meant to be public>
```
Absence of these is handled gracefully: `isCloudConfigured` becomes `false`
and the app runs fully local-only (IndexedDB), no crash. `.env.uitest` (also
gitignored) deliberately sets both to blank — used during development to test
the UI against a live dev server **without** any risk of writing to
production Supabase data. **Always prefer `.env.uitest` / `--mode uitest`
when doing exploratory testing against a running dev server** — pointing a
throwaway test at production has caused real data loss in this project
before (see git history).

**Vercel:** project `fm-condition-survey-data-source`. `vercel.json` sets
framework `vite`, build command `npm run build` (which also runs
`scripts/build-ota.mjs`), output `dist`. The **same env vars** above must be
set in Vercel or the deployed site silently runs local-only — this has bitten
the project before (a redeploy with "Use existing Build Cache" checked can
also silently skip picking up new env vars; uncheck it if sync mysteriously
stops working after a redeploy).

**OTA (`api/ota.js`):** phone POSTs `{version_name}`; endpoint reads
`dist/ota/manifest.json` (built by `scripts/build-ota.mjs`, served as a
static file from the same Vercel deployment) and returns either
`{version, url}` or `{error: "no_new_version_available"}`. No third-party
update service — bundle and endpoint are both on the same Vercel deployment
as the web app, so one `git push` updates web and app together.

## 7. Design Requirements

**Brand colours** — sampled directly from the OCS logo artwork, not guessed:
- Navy `#28417C` → Tailwind `ocs-*` scale (`ocs-600` = the navy) — primary
  surface/header colour.
- Orange `#F15E22` → Tailwind `flame-*` scale (`flame-500` = the orange) —
  reserved for the single primary "act now" accent (main CTA buttons). Must
  **not** be reused for priority colours or it collides semantically.
- Priority P1–P4 has its own separate scale (`priority-1..4` in
  `tailwind.config.js`) — kept deliberately distinct from brand orange.
- Logo assets: `public/ocs-logo.png` (trimmed, transparent) and
  `public/ocs-logo-white.png` (knockout — white letterforms, orange "C"
  kept — for use on the navy header/PDF cover, since the colour logo is
  navy-on-navy and disappears there). The original untouched file is
  `public/ocs_logo.png` (note underscore) / `src/assets/ocs_logo.png` — true
  aspect ratio 1.4798, but has ~20% dead margin baked in; prefer the trimmed
  versions for any new placement.

**Layout/navigation:** 5 tabs — Facility Info, Survey Items, Score & CapEx,
Sign-Off, Report. Desktop: top tab bar. Mobile: bottom nav bar (safe-area
aware). Tab panels stay **mounted** (`hidden` attribute, not
conditional-render) so switching is instant and doesn't re-render 1000+ DOM
nodes — this was a deliberate perf fix, don't revert to conditional
mounting/unmounting.

**Typography/spacing:** legibility was explicitly raised as an issue once
(text too small); tiny `text-[9px]`/`text-[10px]` labels were bumped up a
size globally. Don't reintroduce sub-11px body text without a specific
reason.

**Motion:** tab-switch and card-expand animations must animate only
`opacity`/`transform` (compositor-only), never layout properties — this was
the actual fix for a "make it 90fps" complaint (the real cause was excessive
DOM churn on tab switch, now fixed by keeping panels mounted; the animation
choice is secondary but keep it compositor-only regardless).

**Terminology:** the word "Asset" was fully replaced with "Snag" in all
user-facing text (buttons, labels, PDF, Excel), per explicit user request.
**Do not reintroduce "Asset" in UI copy.** Internal code identifiers
(`AssetItemCard`, `assetName` field, `createDefaultAsset`, `asset_name` DB
column) were deliberately **left alone** — renaming those would be a data
migration, not a relabel, and was out of scope.

**Currency:** AED only, via `formatMoney()` in `src/utils/currency.js`. Never
write `$` or hardcode a currency symbol anywhere new — call the helper.

## 8. Completed Changes

Chronological, by git commit (`git log` has full messages — read them, they
document root causes in detail):

1. Fixed PDF logo distortion, photo-fit gaps in Excel (cover-crop algorithm),
   OCS branding applied throughout, tab-switch performance (mounted panels +
   memoisation), dead/no-op Tailwind classes replaced.
2. GitHub repo created and pushed (public, by explicit user choice — real
   client name and GPS coordinates are visible). Vercel deployment fixed (a
   `vercel.json` `rewrites` regex was invalid JSON and blocked every deploy —
   removed; app has no client-side router so it wasn't needed anyway).
3. Android APK built via Capacitor (JDK toolchain issues documented in
   `ANDROID.md` — worth reading before any native build work).
4. Cross-tab **and** cross-device sync: revision-based optimistic
   concurrency, `BroadcastChannel` for same-browser tabs, Supabase Realtime
   for cross-device.
5. "Stakeholders & Surveyor Team" section removed from Facility Info entirely
   (fields `clientName`, `facilityManager`, `surveyorCompany`,
   `weatherCondition` have no UI anymore; `surveyorName`/`surveyDate` still
   settable via the Sign-Off tab's signature fields, which reports fall back
   to).
6. "Asset" → "Snag" rename (UI/PDF/Excel text only, see §7).
7. Facility preset dropdown (23 hardcoded ADEC facilities) and all
   `placeholder="e.g. ..."` example text removed from every form field.
8. OTA update system built (`api/ota.js`, `scripts/build-ota.mjs`,
   `@capgo/capacitor-updater`). `npm run ship "msg"` is the day-to-day
   workflow now.
9. Currency switched USD → AED via one shared `formatMoney()` helper.
10. Major offline-first rebuild: real native GPS (was completely broken — the
    Android manifest never declared location permissions, so
    `navigator.geolocation` failed silently), native Camera/Gallery capture
    (was using a bare file input that lost the survey to Android killing the
    backgrounded Activity — root-caused and fixed with immediate persistence
    + tab-state restoration, not just a UI patch), durable IndexedDB sync
    queue with backoff retry, network monitoring, per-photo sync-status
    badges, "Facility / Asset Reference Code" field removed everywhere
    (form/PDF/Excel/model), new inspections start with an empty facility name
    (previously auto-seeded demo data).
11. **Root-caused and fixed the core sync destructiveness**: `pushSurvey()`
    used to `DELETE ... WHERE survey_id = X` then reinsert — any device
    pushing a partial view of the survey destroyed every other device's
    snags and, via cascade, their photos too (image files stayed orphaned in
    Storage). Replaced with **upsert + explicit tombstones**. Added
    `hydratePhotos()` so reports pull down photo bytes from Storage before
    generating (previously a synced facility's Excel/PDF had no photos at
    all, because the generators only read `photo.dataUrl` and a pulled
    survey often didn't have it). Added "Submit & Start New Facility" +
    `SavedFacilities.jsx` panel for the multi-facility workflow.
12. Facility Name clear-then-reappear bug fixed (was
    `value={facility.facilityName || facility.buildingName || ''}` — an
    empty string is falsy, so clearing it fell through to the old building
    name; also fixed a duplicate-update bug in the same handler that could
    silently drop keystrokes).
13. **Database-level** delete protection added (`DATA_SAFETY.md`): archive
    trigger, mass-delete block (max 5 rows/statement), `restore_deleted_items()`.
    All demo/sample data + leftover test rows purged from production;
    `src/data/sampleSurvey.js` deleted from the codebase entirely and the
    "Load Sample Commercial Survey" menu action removed — there is now no
    code path that can reintroduce demo data.
14. Fixed "item appears then vanishes within ~1 second": the realtime
    cross-device/cross-tab handlers were adopting a server pull
    unconditionally, including the server's **own echo** of a push that
    hadn't finished writing everything yet. Added an "unpushed local edits"
    guard (skip any incoming pull while there's a pending push) plus a
    monotonic guard (never adopt a pull with fewer snags/photos than what's
    already on screen).

## 9. Do Not Change

- **`pushSurvey()`'s upsert + tombstone model** in `cloudSync.js`. Reverting
  to delete-and-reinsert has destroyed real user data **twice** in this
  project's history. If it ever needs modifying, re-read the comments in
  that file first.
- **The mass-delete-block trigger threshold (5 rows)** in Supabase, without
  understanding why it exists (§6).
- **Tab panels stay mounted** (`hidden`, not conditional render) in
  `App.jsx`'s `TabPanel` — reverting this reintroduces the perf regression
  that was explicitly complained about.
- **`notifyAppReady()`** call in `src/utils/otaUpdates.js` — removing it (or
  moving it before the app actually renders) breaks the OTA rollback safety
  net; a bundle that never calls this is treated as failed and reverted.
- **Brand colour tokens** (`ocs-*`, `flame-*` in `tailwind.config.js`) —
  sampled from the real logo file, don't replace with arbitrary blues again.
- **"Asset" wording in user-facing text** — must stay "Snag" (§7). Internal
  code identifiers using "Asset" (component/file/variable/column names) are
  intentionally unchanged; don't "fix" those either without being asked —
  it's a deliberate scope boundary, not an inconsistency.
- **Facility preset dropdown / demo sample data** — deliberately deleted, not
  just hidden. Don't reintroduce `sampleSurvey.js` or a "Load Sample" action.
- **`.env.uitest`** — keep this pointing at blank Supabase credentials. It
  exists specifically so exploratory dev-server testing can never write to
  production data.

## 10. Testing

**Tested and verified this session** (with actual evidence, not assumption —
see git commit messages for specifics of each):
- Cover-crop Excel photo fit: measured 0px gap on all sides for both
  landscape and portrait source photos.
- PDF logo aspect ratio corrected (was 44% stretched).
- Tab-switch DOM node count reduction (1608 → ~300 nodes) and confirmed
  panels are not remounted (same DOM node identity across switches).
- Cross-tab sync (two tabs, one browser) and cross-device sync (two separate
  origins simulating two devices) — add/edit/delete/photo, all propagate
  live in both directions.
- The exact destructive-push scenario reproduced and confirmed fixed: a
  client pushing a partial survey no longer wipes another device's snags/photos.
- Deletion tombstones confirmed to still correctly propagate real deletions
  while non-deletions survive.
- `hydratePhotos()` confirmed to recover photo bytes for a report generated
  from a pulled (not locally-cached) survey — Excel image count went from 2
  (logo only) to 4 (logo + 3 photos) after the fix.
- Database mass-delete block: replayed the literal destructive statement
  against 8 test rows — refused, all 8 survived; a normal single-row delete
  still worked and was archived correctly; `restore_deleted_items()`
  confirmed to bring a deleted row back with its content intact.
- Facility Name field: typed, cleared, cleared again — confirmed it stays
  empty (previously repopulated instantly).
- OTA pipeline verified end-to-end on the live Vercel deployment: manifest
  publishes, endpoint correctly reports update-available vs up-to-date,
  bundle downloads and its SHA-256 matches the manifest.

**NOT yet tested — needs a physical Android device:**
- Native Camera capture (permission prompt, actual photo, app surviving
  Android backgrounding/killing the Activity during capture).
- Native GPS capture (permission prompt, actual coordinates, accuracy).
- A real offline → reconnect cycle (airplane mode toggle), not just the
  simulated/unit-level queue and idempotency tests.
- The "item disappears after ~1 second" fix (commit `18662ce`) — fixed at
  the logic level and reasoned through carefully, but not yet confirmed by
  the user on-device.
- Photo capture UI on a real device end-to-end (does it stay on the
  Facility/Survey Items screen after taking a photo, as required).

## 11. NEXT SESSION START HERE

**Exact next task, in order:**

1. `git log -1` and `git status`. If HEAD is still `ad3d134` and the tree is
   clean, everything below is current. If not, something happened outside
   this doc — read the newer commit messages before doing anything else.
2. **Open the conversation with this question**: *"Did the item you added
   (photo or snag) stop disappearing after a second? And have you tried GPS /
   the camera on the phone yet?"* Don't wait passively for the user to bring
   it up — ask directly, first message. Their answer branches the work:
   - **"Still disappears"** → get exact repro (which screen, photo or snag,
     online or offline, how many devices open at once) and re-open
     `src/App.jsx`'s two `subscribeTo*` handlers (search for
     `hasUnpushedEditsRef`) — the guard added in `18662ce` may have a gap
     the reasoning missed. `.env.uitest` for any exploratory testing (see
     step 4).
   - **"Fixed, but GPS/camera not tried yet"** → that's the actual open item.
     Walk the user through installing the APK already built this session
     (native permissions for GPS/Camera were added in `84db0d3` — if they're
     on an older APK, GPS/Camera will not work at all, regardless of any
     code fix) and running Test 1 from the original spec they gave: capture
     GPS, take 2+ photos, confirm none disappear, confirm the app doesn't
     return to the wrong screen after the camera closes.
   - **"Both fine"** → nothing urgent. Ask what they want next; there is no
     other known open bug (§3 lists unverified items, not known failures).
3. Whatever the answer, **do not** start refactoring `cloudSync.js` or the
   sync guards speculatively. Every past incident in this project came from
   a "clean-up" of that file done without a concrete, reproduced failure in
   hand. Fix what's actually reported, verify it the same way this session
   did (reproduce the exact broken scenario, confirm the fix stops it,
   check the live DB before and after), then stop.
4. Before writing **any** Supabase query or running the dev server for
   testing, use `.env.uitest` / `npm run dev -- --mode uitest` — this
   disables cloud sync entirely so it is *physically impossible* to write to
   production data by accident. This project has lost real data to
   exploratory testing against prod more than once. Only point at the real
   `.env.local` when the user has explicitly asked to test against live data.
5. If asked to change anything in `cloudSync.js`, read the file's own inline
   comments first — nearly every defensive check in it exists because of a
   specific, named past incident. Removing one without knowing which
   incident it prevents is how they come back.
6. Check `DATA_SAFETY.md` before any delete-related work — there is a
   database-level safety net now (archive + mass-delete block +
   `restore_deleted_items()`); understand it before working around it.
7. Routine changes ship via `npm run ship "message"` (OTA, no APK). Only
   native-layer changes (new Capacitor plugin, Android permission, app icon,
   `capacitor.config.json`) need a new APK build — see `ANDROID.md` for the
   JDK toolchain gotchas (Android Studio's bundled JDK does not work for
   command-line builds; JDK 17 + JDK 21 side-by-side is the working
   combination, details in that file).
