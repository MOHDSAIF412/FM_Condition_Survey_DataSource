# Adding a database

The app currently has **no database**. Every survey lives in the browser's
IndexedDB on the device that recorded it. That is deliberate — it is what makes
the app work with no signal on site — and nothing below is required for the app
to run on Vercel.

Read this only when you need surveys shared between devices or people.

## What you gain, and what it costs

| Today (IndexedDB)                  | With a database                          |
| ---------------------------------- | ---------------------------------------- |
| Works fully offline                | Needs a connection to sync               |
| Data trapped on one device/browser | Any surveyor sees any survey             |
| Lost if site data is cleared       | Backed up server-side                    |
| No login                           | Needs login, or anyone can read the data |
| Free                               | Free tier is usually enough              |

## Recommended: Supabase

Supabase is the closest fit: it is Postgres, it has file storage for the
photos, it has built-in login, and it works from a static Vercel site with no
backend of your own.

Vercel Postgres (Neon) is the alternative, but it has no file storage and
cannot be queried directly from the browser — you would also have to write
Vercel serverless functions. Supabase avoids that.

### 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a project.
2. Copy the **Project URL** and the **anon/publishable key** from
   *Project Settings → API*.

### 2. Suggested tables

Mirror the shape the app already uses (`src/types/survey.js`):

```sql
create table surveys (
  id            text primary key,
  title         text,
  facility      jsonb,           -- the whole facility object
  signatures    jsonb,
  general_notes text,
  owner_id      uuid references auth.users(id),
  updated_at    timestamptz default now()
);

create table survey_items (
  id                 text primary key,
  survey_id          text references surveys(id) on delete cascade,
  asset_name         text,
  department         text,
  location           text,
  priority           int,
  defect_description text,
  estimated_cost     numeric,
  quantity           numeric,
  unit               text
);

create table survey_photos (
  id         text primary key,
  item_id    text references survey_items(id) on delete cascade,
  caption    text,
  storage_path text,             -- path in Supabase Storage, NOT the image bytes
  created_at timestamptz default now()
);
```

**Do not store photos as base64 in a table column.** A single survey here is
already ~350 KB of images; put the files in a Supabase **Storage** bucket and
keep only the path in the database.

### 3. Lock it down

Turn on Row Level Security on every table and add policies, otherwise the anon
key lets anyone on the internet read and edit all surveys:

```sql
alter table surveys enable row level security;

create policy "own surveys" on surveys
  for all using (auth.uid() = owner_id);
```

### 4. Wire it into the app

```bash
npm install @supabase/supabase-js
```

Create `.env.local` (already gitignored):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Add the same two variables in Vercel under
*Project → Settings → Environment Variables*, then redeploy.

Only `VITE_`-prefixed variables reach the browser, and **anything that reaches
the browser is public**. Never put a Supabase *service role* key in this app.

### 5. Keep offline working

The sensible pattern is to keep IndexedDB as the source of truth on-site and
sync upward, rather than replacing it:

1. Keep writing to IndexedDB exactly as `src/utils/storage.js` does now.
2. Add a "Sync" action that pushes the current survey to Supabase when online.
3. On load, pull the survey list from Supabase and cache it into IndexedDB.

Doing it the other way round — reading straight from the database — breaks the
app the moment a surveyor walks into a plant room with no signal.
