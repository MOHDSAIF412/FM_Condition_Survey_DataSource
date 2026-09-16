/**
 * Loading and saving configuration versions (`app_config_versions`).
 *
 *   draft      -- being edited in the admin dashboard; at most one per kind
 *   published  -- what the web portal and the phone app use; exactly one
 *   superseded -- an earlier published version, kept for history and rollback
 *   discarded  -- a draft thrown away, kept for history
 *
 * The database enforces all of it: only administrators can create or change a
 * draft, published versions cannot be edited or deleted, and publishing goes
 * through one function so the old version is retired and the new one goes live
 * together. Rollback copies an older version into a new draft and publishes
 * that, so history only ever moves forwards.
 */
import { supabase, isCloudConfigured } from '../utils/supabaseClient';
import { normaliseFormsConfig, defaultFormsConfig, validateFormsConfig } from './formConfig';

const CACHE_KEY = (kind) => `fm_config_${kind}_cache`;
const COLUMNS = 'id, kind, version, status, config, notes, based_on, created_by, created_at, updated_at, published_by, published_at';

const normalisers = { forms: normaliseFormsConfig };
const defaults = { forms: defaultFormsConfig };

function normalise(kind, config) {
  return (normalisers[kind] || ((c) => c || {}))(config || {});
}

function readCache(kind) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(kind));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(kind, value) {
  try { localStorage.setItem(CACHE_KEY(kind), JSON.stringify(value)); } catch { /* private mode */ }
}

/** The configuration this device used last, or the built-in default. Never throws. */
export function cachedPublishedConfig(kind = 'forms') {
  const cached = readCache(kind);
  return {
    config: normalise(kind, cached?.config || (defaults[kind] ? defaults[kind]() : {})),
    version: cached?.version || 0
  };
}

/**
 * The published configuration. Falls back to the cached copy with no signal,
 * and to the built-in default when nothing has been published yet -- which
 * reproduces the app exactly as it was before configuration existed.
 */
export async function loadPublishedConfig(kind = 'forms') {
  if (!isCloudConfigured) return cachedPublishedConfig(kind);
  const { data, error } = await supabase
    .from('app_config_versions')
    .select('id, kind, version, config, published_at')
    .eq('kind', kind)
    .eq('status', 'published')
    .maybeSingle();
  if (error) {
    console.warn(`[config] using the cached ${kind} configuration:`, error.message);
    return cachedPublishedConfig(kind);
  }
  const result = {
    config: normalise(kind, data?.config),
    version: data?.version || 0,
    id: data?.id || null,
    publishedAt: data?.published_at || null
  };
  writeCache(kind, { config: result.config, version: result.version });
  return result;
}

function toVersion(row) {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    status: row.status,
    config: normalise(row.kind, row.config),
    notes: row.notes || '',
    basedOn: row.based_on,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedBy: row.published_by,
    publishedAt: row.published_at
  };
}

function friendly(error) {
  const msg = error?.message || String(error);
  if (/row-level security|permission denied|42501/i.test(msg)) return 'Only administrators can change the configuration.';
  if (/app_config_one_draft/.test(msg)) return 'Another draft already exists. Refresh to continue editing it.';
  return msg.replace(/^Refused: /, '');
}

/** Every version of a kind, newest first. */
export async function listVersions(kind = 'forms') {
  const { data, error } = await supabase
    .from('app_config_versions')
    .select(COLUMNS)
    .eq('kind', kind)
    .order('version', { ascending: false });
  if (error) throw new Error(friendly(error));
  return (data || []).map(toVersion);
}

async function nextVersionNumber(kind) {
  const { data, error } = await supabase
    .from('app_config_versions')
    .select('version')
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1);
  if (error) throw new Error(friendly(error));
  return (data?.[0]?.version || 0) + 1;
}

/**
 * Saves the draft. Creates it when there is none yet.
 * `expectedUpdatedAt` stops two administrators silently overwriting each other.
 */
export async function saveDraft(kind, config, { draftId = null, basedOn = null, notes = '', expectedUpdatedAt = null } = {}) {
  const clean = normalise(kind, config);
  if (kind === 'forms') {
    const problems = validateFormsConfig(clean);
    if (problems.length) throw new Error(problems.join(' '));
  }

  if (draftId) {
    let query = supabase.from('app_config_versions')
      .update({ config: clean, notes: notes || null })
      .eq('id', draftId)
      .eq('status', 'draft');
    if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
    const { data, error } = await query.select(COLUMNS);
    if (error) throw new Error(friendly(error));
    if (!data?.length) {
      throw new Error('This draft was changed or published by someone else. Refresh to see the latest version before saving.');
    }
    return toVersion(data[0]);
  }

  const version = await nextVersionNumber(kind);
  const { data, error } = await supabase
    .from('app_config_versions')
    .insert({ kind, version, config: clean, notes: notes || null, based_on: basedOn })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(friendly(error));
  return toVersion(data);
}

export async function discardDraft(draftId) {
  const { error } = await supabase.from('app_config_versions')
    .update({ status: 'discarded' })
    .eq('id', draftId)
    .eq('status', 'draft');
  if (error) throw new Error(friendly(error));
}

/**
 * Makes a draft live. Custom fields are marked as published once, which from
 * then on limits type changes to ones that keep recorded answers meaningful.
 */
export async function publishDraft(draft, notes = '') {
  if (draft.kind === 'forms') {
    const marked = {
      ...draft.config,
      fields: draft.config.fields.map((f) => (f.system || f.publishedOnce ? f : { ...f, publishedOnce: true }))
    };
    if (JSON.stringify(marked) !== JSON.stringify(draft.config)) {
      draft = await saveDraft('forms', marked, { draftId: draft.id, notes: draft.notes });
    }
  }
  const { data, error } = await supabase.rpc('fm_publish_config', { p_version_id: draft.id, p_notes: notes || null });
  if (error) throw new Error(friendly(error));
  const row = Array.isArray(data) ? data[0] : data;
  const published = toVersion(row);
  writeCache(published.kind, { config: published.config, version: published.version });
  return published;
}

/** Publishes a copy of an earlier version. Refused while a draft is open. */
export async function rollbackTo(version, notes = '') {
  const copy = await saveDraft(version.kind, version.config, {
    basedOn: version.id,
    notes: notes || `Rollback to version ${version.version}`
  });
  return publishDraft(copy, notes || `Rollback to version ${version.version}`);
}

/** Change history, newest first. */
export async function listAuditLog({ limit = 50, before = null, table = null } = {}) {
  let query = supabase
    .from('app_audit_log')
    .select('id, table_name, record_id, action, summary, old_data, new_data, changed_by, changed_by_email, changed_at')
    .order('id', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('id', before);
  if (table) query = query.eq('table_name', table);
  const { data, error } = await query;
  if (error) throw new Error(friendly(error));
  return data || [];
}
