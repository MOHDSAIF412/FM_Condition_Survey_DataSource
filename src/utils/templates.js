/**
 * Inspection templates: named checklists an administrator prepares once, and a
 * surveyor applies to a facility so it starts with the standard snags instead
 * of an empty list.
 *
 * Stored in `inspection_templates` with the checklist as one jsonb array, so a
 * template is always saved whole -- never half its rows. The database lets any
 * signed-in user read templates and only administrators create or change them.
 * Templates are archived, never deleted: a facility that was started from one
 * should still be explainable later.
 *
 * Applying a template only ever adds snags. It never overwrites or removes
 * anything a surveyor has written, and it skips defects already on the list,
 * so applying the same template twice does not duplicate work.
 */
import { supabase, isCloudConfigured } from './supabaseClient';
import { createDefaultAsset, DEPARTMENTS, PRIORITY_LEVELS } from '../types/survey';

const TEMPLATES_CACHE_KEY = 'fm_templates_cache';

// ---------------------------------------------------------------------------
// Pure helpers (no network) -- covered by src/__tests__/templates.test.js
// ---------------------------------------------------------------------------

/** One checklist line, with anything missing or invalid replaced by a safe default. */
export function normaliseTemplateItem(raw = {}) {
  const department = DEPARTMENTS[raw.department] ? raw.department : 'GENERAL';
  const priority = PRIORITY_LEVELS[Number(raw.priority)] ? Number(raw.priority) : 2;
  const cost = Number(raw.estimatedCost);
  return {
    id: raw.id || 'tpl_item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    department,
    priority,
    location: (raw.location || '').trim(),
    description: (raw.description || '').trim(),
    unit: (raw.unit || 'Unit').trim() || 'Unit',
    quantity: Math.max(1, parseInt(raw.quantity, 10) || 1),
    estimatedCost: Number.isFinite(cost) && cost > 0 ? cost : 0
  };
}

function normaliseRow(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    facilityType: row.facility_type || '',
    items: (Array.isArray(row.items) ? row.items : []).map(normaliseTemplateItem),
    archived: !!row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Problems that must be fixed before a template can be saved; empty when fine. */
export function validateTemplate(template = {}) {
  const problems = [];
  if (!(template.name || '').trim()) problems.push('Give the template a name.');
  const items = template.items || [];
  if (!items.length) problems.push('Add at least one checklist item.');
  const blank = items.filter((i) => !(i.description || '').trim()).length;
  if (blank) problems.push(`${blank} checklist item${blank === 1 ? ' has' : 's have'} no description.`);
  return problems;
}

/**
 * Live templates for a facility type: those made for that type first, then
 * general ones (no type). Templates for a different type are left out, so a
 * school is never offered the hotel checklist.
 */
export function templatesForType(templates = [], facilityType = '') {
  const live = templates.filter((t) => !t.archived);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const matching = facilityType ? live.filter((t) => t.facilityType === facilityType).sort(byName) : [];
  const general = live.filter((t) => !t.facilityType).sort(byName);
  return [...matching, ...general];
}

/** The template to preselect for a type: only when exactly one is made for it. */
export function suggestedTemplate(templates = [], facilityType = '') {
  if (!facilityType) return null;
  const matching = templates.filter((t) => !t.archived && t.facilityType === facilityType);
  return matching.length === 1 ? matching[0] : null;
}

/** A snag nobody has touched: the blank one every new facility starts with. */
export function isBlankSnag(item = {}) {
  return !(item.defectDescription || '').trim()
    && !(item.location || '').trim()
    && !(item.assetName || '').trim()
    && !(item.photos || []).length
    && !Number(item.estimatedCost);
}

const key = (text) => (text || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * What applying a template to these snags produces.
 *
 * @returns {{ items: object[], added: number, skipped: number, removedBlankIds: string[] }}
 *   `removedBlankIds` are untouched blank snags dropped to make room -- the
 *   caller tombstones them so another device does not bring them back.
 */
export function applyTemplateToItems(existingItems = [], template = {}) {
  const templateItems = (template.items || []).map(normaliseTemplateItem).filter((t) => t.description);
  if (!templateItems.length) {
    return { items: existingItems, added: 0, skipped: 0, removedBlankIds: [] };
  }

  const blanks = existingItems.filter(isBlankSnag);
  const kept = existingItems.filter((i) => !isBlankSnag(i));
  const already = new Set(kept.map((i) => key(i.defectDescription)));

  const added = [];
  let skipped = 0;
  for (const t of templateItems) {
    if (already.has(key(t.description))) { skipped++; continue; }
    already.add(key(t.description));
    const snag = createDefaultAsset(t.location, t.department);
    snag.defectDescription = t.description;
    snag.priority = t.priority;
    snag.unit = t.unit;
    snag.quantity = t.quantity;
    snag.estimatedCost = t.estimatedCost;
    snag.templateId = template.id || null;
    added.push(snag);
  }

  // Nothing new to add: leave the list exactly as it was, blank snag included.
  if (!added.length) {
    return { items: existingItems, added: 0, skipped, removedBlankIds: [] };
  }
  return {
    items: [...kept, ...added],
    added: added.length,
    skipped,
    removedBlankIds: blanks.map((b) => String(b.id))
  };
}

// ---------------------------------------------------------------------------
// Server access
// ---------------------------------------------------------------------------

function cacheTemplates(list) {
  try { localStorage.setItem(TEMPLATES_CACHE_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/** The last template list this device loaded, so a surveyor with no signal can still use them. */
export function cachedTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATES_CACHE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Every template including archived ones, newest change first. Falls back to the cache. */
export async function listTemplates() {
  if (!isCloudConfigured) return cachedTemplates();
  const { data, error } = await supabase
    .from('inspection_templates')
    .select('id, name, description, facility_type, items, archived, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('[templates] using the cached list:', error.message);
    return cachedTemplates();
  }
  const list = (data || []).map(normaliseRow);
  cacheTemplates(list);
  return list;
}

/** Creates or updates a template. Needs a connection and administrator rights (enforced by the database). */
export async function saveTemplate(template) {
  if (!isCloudConfigured) throw new Error('Templates need the cloud connection.');
  const problems = validateTemplate(template);
  if (problems.length) throw new Error(problems.join(' '));

  const row = {
    name: template.name.trim(),
    description: (template.description || '').trim() || null,
    facility_type: template.facilityType || null,
    items: (template.items || []).map(normaliseTemplateItem)
  };

  const query = template.id
    ? supabase.from('inspection_templates').update(row).eq('id', template.id)
    : supabase.from('inspection_templates').insert(row);

  const { data, error } = await query
    .select('id, name, description, facility_type, items, archived, created_at, updated_at')
    .single();
  if (error) {
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new Error('Only administrators can change templates.');
    }
    throw new Error(error.message);
  }
  return normaliseRow(data);
}

/** Archives (or restores) a template. Archived templates are no longer offered to surveyors. */
export async function setTemplateArchived(id, archived) {
  if (!isCloudConfigured) throw new Error('Templates need the cloud connection.');
  const { data, error } = await supabase
    .from('inspection_templates')
    .update({ archived: !!archived })
    .eq('id', id)
    .select('id, name, description, facility_type, items, archived, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return normaliseRow(data);
}
