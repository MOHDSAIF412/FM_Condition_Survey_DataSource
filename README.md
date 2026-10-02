# FM Condition Survey Portal

Facilities inspections for web and Android: projects, facility details, snags,
photos, GPS, signatures, review/approval, and PDF/Excel reports with AED costs.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
npm run dev
```

Vite serves port 3000 (override with PORT). Copy .env.example to .env.local and
configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for authenticated cloud
access. Use a publishable/anon key, never a service-role key in a browser build.
Without configuration, the app runs in local-only mode.

## Storage, accounts, and offline use

- Survey drafts and compressed photos live in IndexedDB on the device.
- Configured builds use Supabase Auth, project membership, and database RLS.
- Supabase stores survey rows and photos in the private survey-photos bucket.
- After the first successful production-page load, the application caches its
  files for offline restart. Check **Sync status → App available offline** before
  leaving coverage. Development mode does not install a service worker.
- Android bundles its application files and does not use the web service worker.
- Only facilities/photos already downloaded or created on the device are usable
  offline. Creating projects and the first sign-in require a connection.
- Clearing site data deletes local drafts, offline files, and recovery backups.
  Use **Backup Survey (JSON)** before clearing storage or changing devices.

Edits upload on reconnect; failed uploads retain their pending flag. A stale
device copy is kept for comparison instead of overwriting another device's work.
**Recovery backups** in the account menu downloads copies preserved during
conflict resolution. These backups remain local and do not enter the sync queue.

## Tests and builds

```sh
npm test
npm run build:web
npm run build
npm run preview
```

build:web produces dist/; build also packages the Android OTA bundle.
Tests include isolated PostgreSQL migration/RLS/rollback checks through PGlite,
IndexedDB upload/restart tests, service-worker cache behavior, and report checks.
See ANDROID.md for native builds.

## Deployment

Vercel uses vercel.json. Set the same two environment variables there before
building. **Apply the atomic-sync database migration before deploying this
client**, and coordinate the Android update: older sync clients will be refused
until updated. The new client keeps work local if the migration is missing.

See [SYNC_ROLLOUT.md](SYNC_ROLLOUT.md) for prerequisites, validation, and rollback.
The checked-in migration is not proof that it has been applied to production.

Web updates activate after all tabs for the app are closed and reopened, keeping
open inspections on one consistent build. Report engines and administration
screens load on demand and are also cached for offline use.
