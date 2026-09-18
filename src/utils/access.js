/**
 * Roles and project teams, read and written straight to their tables. The
 * row-level policies decide who may: changing a role or a user's role needs
 * manage_users, changing a project team needs manage_team, and only a Super
 * Admin can give or take an administrator role (a database trigger).
 */
import { supabase, isCloudConfigured } from './supabaseClient';
import { DEFAULT_ROLES } from './roles';

const ROLES_CACHE_KEY = 'fm_roles_cache';

function readCache(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

/** Every role, in display order. Falls back to the last copy, then the built-in defaults. */
export async function listRoles() {
  if (!isCloudConfigured) return DEFAULT_ROLES;
  const { data, error } = await supabase
    .from('fm_roles')
    .select('key, label, description, permissions, all_projects, approved_only, locked, sort, updated_at')
    .order('sort', { ascending: true });
  if (error) {
    console.warn('[access] roles unavailable:', error.message);
    return readCache(ROLES_CACHE_KEY, DEFAULT_ROLES);
  }
  try { localStorage.setItem(ROLES_CACHE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  return data;
}

/** Changes one role's permissions or access rules. Administrator roles are refused by the database. */
export async function updateRole(key, patch) {
  const row = {};
  if (patch.permissions) row.permissions = patch.permissions;
  if (typeof patch.all_projects === 'boolean') row.all_projects = patch.all_projects;
  if (typeof patch.approved_only === 'boolean') row.approved_only = patch.approved_only;
  const { data, error } = await supabase.from('fm_roles').update(row).eq('key', key).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That role could not be changed.');
  return data;
}

/** Users a team manager can choose from: name, email, role -- nothing more. */
export async function listTeamUsers() {
  if (!isCloudConfigured) return [];
  const { data, error } = await supabase
    .from('fm_survey_users')
    .select('id, email, full_name, role, is_active')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function setUserRole(userId, role) {
  const { data, error } = await supabase
    .from('fm_survey_users').update({ role }).eq('id', userId).select('id, role').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That user could not be changed.');
  return data;
}

/** Team rows: [{ project_id, user_id }], for one project or (no id) every project the caller can see. */
export async function listProjectMembers(projectId = null) {
  if (!isCloudConfigured) return [];
  let q = supabase.from('fm_project_members').select('project_id, user_id, added_at');
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addProjectMember(projectId, userId) {
  const { error } = await supabase
    .from('fm_project_members')
    .upsert({ project_id: projectId, user_id: userId }, { onConflict: 'project_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeProjectMember(projectId, userId) {
  const { error } = await supabase
    .from('fm_project_members').delete().eq('project_id', projectId).eq('user_id', userId);
  if (error) throw error;
}

/** Plain wording for a refusal from the access rules. */
export function accessErrorMessage(err, fallback = 'That change was not allowed.') {
  const msg = String(err?.message || '');
  if (/^Refused:/.test(msg)) return msg.replace(/^Refused:\s*/, '');
  if (/row-level security|permission denied|42501/i.test(msg + (err?.code || ''))) {
    return 'Your role does not allow that change.';
  }
  return msg || fallback;
}
