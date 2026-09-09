/**
 * Supabase client. Absent config simply disables cloud sync — the app keeps
 * working offline against IndexedDB, which stays the source of truth on site.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudConfigured = Boolean(url && key);
export const SUPABASE_URL = url;

// persistSession must stay true: a surveyor logs in once on wifi, and that
// session then has to survive the app being closed and reopened with no
// signal all day on site -- that is the whole "login once, works offline"
// agreement, and it only holds if the session is actually written to
// localStorage rather than held in memory alone.
export const supabase = isCloudConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 2 } }
    })
  : null;

export const PHOTO_BUCKET = 'survey-photos';
