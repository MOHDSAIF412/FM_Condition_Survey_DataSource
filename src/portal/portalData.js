/**
 * Numbers for the web portal dashboard, all from real data.
 *
 * The app records two survey states -- draft and submitted -- and snag
 * priority P1-P4. The dashboard shows exactly those. States the design has but
 * the app does not record yet (Overdue, In Review, a condition rating) arrive
 * with the Workflows stage rather than being invented here.
 */
import { supabase, isCloudConfigured } from '../utils/supabaseClient';
import { fetchAllPages } from '../utils/cloudSync';
import { sectionsForScope, fieldsForSection, activeOptions } from '../config/formConfig';

const DAY = 24 * 60 * 60 * 1000;
const PRIORITY_CACHE_KEY = 'fm_portal_priority_cache';
const ACTIVITY_CACHE_KEY = 'fm_portal_activity_cache';

const inWindow = (iso, from, to) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) && t >= from && t < to;
};

/**
 * Change between the last 30 days and the 30 before, as a whole percentage.
 * Null when there is nothing to compare against -- a "+100%" from zero would
 * look like a trend when it is really just a start.
 */
export function trendPercent(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function dashboardStats(surveys = [], now = Date.now()) {
  const last = [now - 30 * DAY, now + DAY];
  const prev = [now - 60 * DAY, now - 30 * DAY];
  const submitted = surveys.filter((s) => s.status === 'submitted');
  const drafts = surveys.filter((s) => s.status !== 'submitted');
  const created = (w) => surveys.filter((s) => inWindow(s.createdAt || s.updatedAt, ...w)).length;
  const completed = (w) => submitted.filter((s) => inWindow(s.submittedAt, ...w)).length;
  const snags = surveys.reduce((n, s) => n + (s.itemCount || 0), 0);
  const photos = surveys.reduce((n, s) => n + (s.photoCount || 0), 0);
  const pct = (n) => (surveys.length ? Math.round((n / surveys.length) * 100) : 0);

  return {
    total: surveys.length,
    totalTrend: trendPercent(created(last), created(prev)),
    createdLast30: created(last),
    completed: submitted.length,
    completedTrend: trendPercent(completed(last), completed(prev)),
    completedLast30: completed(last),
    drafts: drafts.length,
    draftsWithSnags: drafts.filter((s) => (s.itemCount || 0) > 0).length,
    snags,
    photos,
    noPhotoFacilities: submitted.filter((s) => (s.itemCount || 0) > 0 && !(s.photoCount || 0)).length,
    statusBreakdown: [
      { key: 'submitted', label: 'Completed', count: submitted.length, percent: pct(submitted.length) },
      { key: 'draft', label: 'Draft (in progress)', count: drafts.length, percent: pct(drafts.length) }
    ]
  };
}

/** Most recently touched facilities first. */
export function recentSurveys(surveys = [], limit = 5) {
  const t = (s) => new Date(s.submittedAt || s.updatedAt || s.createdAt || 0).getTime() || 0;
  return [...surveys].sort((a, b) => t(b) - t(a)).slice(0, limit);
}

/** Counts of the published form configuration, for the Configuration Status panel. */
export function configurationStatus(config, templates = []) {
  if (!config) return null;
  const scopes = ['facility', 'snag'];
  const sections = scopes.flatMap((sc) => sectionsForScope(config, sc));
  const fields = sections.flatMap((s) => fieldsForSection(config, s.id));
  const customFields = fields.filter((f) => !f.system);
  return {
    forms: scopes.length,
    sections: sections.length,
    customSections: sections.filter((s) => !s.system).length,
    fields: fields.length,
    customFields: customFields.length,
    options: customFields.reduce((n, f) => n + activeOptions(f).length, 0),
    rules: (config.rules || []).filter((r) => !r.archived && r.enabled !== false).length,
    templates: templates.filter((t) => !t.archived).length
  };
}

function readCache(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function cachedPriorityCounts() {
  return readCache(PRIORITY_CACHE_KEY, null);
}

/** Snags per priority across the given facilities. Falls back to the last known counts offline. */
export async function loadPriorityCounts(surveyIds = []) {
  if (!isCloudConfigured || !surveyIds.length) return cachedPriorityCounts();
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  // Chunked so a large portfolio never builds an over-long request URL.
  for (let i = 0; i < surveyIds.length; i += 150) {
    const rows = await fetchAllPages('survey_items', 'survey_id, priority', surveyIds.slice(i, i + 150));
    for (const r of rows) {
      const p = [1, 2, 3, 4].includes(Number(r.priority)) ? Number(r.priority) : 2;
      counts[p] += 1;
    }
  }
  writeCache(PRIORITY_CACHE_KEY, counts);
  return counts;
}

export function cachedActivity() {
  return readCache(ACTIVITY_CACHE_KEY, []);
}

/**
 * Latest events from the audit log. Administrators see configuration, user and
 * template changes as well; everyone else sees facility events only (the
 * database decides which rows each user can read).
 */
export async function loadRecentActivity(limit = 6) {
  if (!isCloudConfigured) return cachedActivity();
  const { data, error } = await supabase
    .from('app_audit_log')
    .select('id, table_name, record_id, action, summary, new_data, changed_by_email, changed_at')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[portal] activity unavailable:', error.message);
    return cachedActivity();
  }
  writeCache(ACTIVITY_CACHE_KEY, data || []);
  return data || [];
}

/** "3 minutes ago", "2 days ago". */
export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const units = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let v = s / 60;
  let unit = 'minute';
  for (const [size, name] of units) {
    unit = name;
    if (v < size) break;
    v /= size;
  }
  const n = Math.floor(v);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Counts per time bucket over the last `days`, oldest first, for the small
 * trend lines on the dashboard cards. `dateOf` picks which date a survey counts
 * on (created, submitted, last updated).
 */
export function dailySeries(surveys = [], dateOf, { days = 30, buckets = 15, now = Date.now() } = {}) {
  const size = (days * DAY) / buckets;
  const start = now - days * DAY;
  const out = new Array(buckets).fill(0);
  for (const s of surveys) {
    const t = new Date(dateOf(s) || 0).getTime();
    if (!Number.isFinite(t) || t < start || t > now) continue;
    out[Math.min(buckets - 1, Math.floor((t - start) / size))] += 1;
  }
  return out;
}
