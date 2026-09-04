/**
 * Supabase client. Absent config simply disables cloud sync — the app keeps
 * working offline against IndexedDB, which stays the source of truth on site.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudConfigured = Boolean(url && key);

export const supabase = isCloudConfigured
  ? createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } }
    })
  : null;

export const PHOTO_BUCKET = 'survey-photos';
