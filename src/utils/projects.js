/**
 * Projects: the layer above facilities.
 *
 *   Project -> Facility (a condition_surveys row) -> Snags / Photos / Signatures
 *
 * Numbering is never done in the browser. `project_number` has a database
 * DEFAULT driven by a sequence plus a unique index, so two devices creating a
 * project at the same moment cannot collide and the client never chooses a
 * number it might duplicate.
 *
 * Creating a project needs a connection -- only the database can hand out a
 * number. Everything after that (facilities, snags, photos, signatures) stays
 * fully offline, which is what matters on site.
 */
import { supabase, isCloudConfigured } from './supabaseClient';

const PROJECTS_CACHE_KEY = 'fm_projects_cache';
const ACTIVE_PROJECT_KEY = 'fm_active_project_id';

/** Remembers the project list so the picker still works with no signal. */
function cacheProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projects));
  } catch { /* private mode */ }
}

export function cachedProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getActiveProjectId() {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveProjectId(projectId) {
  try {
    if (projectId) localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch { /* private mode */ }
}

function normalise(row) {
  return {
    id: row.id,
    projectNumber: row.project_number,
    name: row.name || '',
    client: row.client || '',
    location: row.location || '',
    notes: row.notes || '',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Every project, newest first, with how many facilities each holds.
 * Falls back to the cached copy when there is no connection.
 */
export async function listProjects() {
  if (!isCloudConfigured) return cachedProjects();

  const { data, error } = await supabase
    .from('projects')
    .select('id, project_number, name, client, location, notes, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[projects] falling back to the cached list:', error.message);
    return cachedProjects();
  }

  const projects = (data || []).map(normalise);

  // Facility counts in one query rather than one per project.
  const { data: facilityRows, error: countErr } = await supabase
    .from('condition_surveys')
    .select('project_id');

  if (!countErr) {
    const counts = {};
    for (const row of facilityRows || []) {
      if (row.project_id) counts[row.project_id] = (counts[row.project_id] || 0) + 1;
    }
    for (const p of projects) p.facilityCount = counts[p.id] || 0;
  }

  cacheProjects(projects);
  return projects;
}

/**
 * Creates a project. The number comes from the database, never from here.
 *
 * @param {{name: string, client?: string, location?: string, notes?: string}} details
 */
export async function createProject(details) {
  if (!isCloudConfigured) {
    throw new Error('Cloud sync is not configured, so projects cannot be created on this build.');
  }
  const name = (details?.name || '').trim();
  if (!name) throw new Error('Enter a project name.');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name,
      client: (details.client || '').trim() || null,
      location: (details.location || '').trim() || null,
      notes: (details.notes || '').trim() || null
    })
    .select('id, project_number, name, client, location, notes, status, created_at, updated_at')
    .single();

  if (error) {
    // Anything the database refuses is reported in plain words; the raw
    // Postgres text is for the console, not the surveyor.
    console.error('[projects] create failed:', error);
    throw new Error('Could not create the project. Check your connection and try again.');
  }
  return normalise(data);
}

export async function updateProject(projectId, details) {
  if (!isCloudConfigured) throw new Error('Cloud sync is not configured on this build.');

  const patch = { updated_at: new Date().toISOString() };
  if (details.name !== undefined) patch.name = (details.name || '').trim();
  if (details.client !== undefined) patch.client = (details.client || '').trim() || null;
  if (details.location !== undefined) patch.location = (details.location || '').trim() || null;
  if (details.notes !== undefined) patch.notes = (details.notes || '').trim() || null;

  if (patch.name === '') throw new Error('A project must have a name.');

  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .select('id, project_number, name, client, location, notes, status, created_at, updated_at')
    .single();

  if (error) {
    console.error('[projects] update failed:', error);
    throw new Error('Could not save the project. Check your connection and try again.');
  }
  return normalise(data);
}

/**
 * Attaches a facility to a project.
 *
 * Called when a facility is created and when an older one that predates
 * projects is opened, so nothing is left stranded outside the hierarchy.
 */
export async function assignFacilityToProject(surveyId, projectId) {
  if (!isCloudConfigured || !surveyId || !projectId) return false;
  const { error } = await supabase
    .from('condition_surveys')
    .update({ project_id: projectId })
    .eq('id', surveyId);
  if (error) {
    console.warn('[projects] could not attach facility to project:', error.message);
    return false;
  }
  return true;
}
