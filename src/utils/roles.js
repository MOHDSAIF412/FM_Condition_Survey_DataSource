/**
 * Roles and permissions.
 *
 * A role is a named bundle of permissions plus two access rules: whether it
 * sees every project or only the projects its members are added to, and
 * whether it sees only approved facilities (clients). A user holds their
 * role's permissions plus any extra ones ticked for them individually.
 *
 * The database (fm_roles, fm_can, the row-level policies) is what enforces all
 * of this. The copy here decides what the screens offer, and doubles as the
 * fallback when the role table cannot be read -- offline, or before it exists.
 * Keep DEFAULT_ROLES identical to the seed in the Stage 5 migration.
 */

export const PERMISSIONS = [
  { key: 'edit_surveys', label: 'Edit surveys', help: 'Create and edit facilities, snags, photos and sign-offs' },
  { key: 'delete_snags', label: 'Delete', help: 'Delete snags, photos and whole facilities' },
  { key: 'download_reports', label: 'Download reports', help: 'Generate client PDF and Excel reports' },
  { key: 'manage_projects', label: 'Manage projects', help: 'Create projects and edit their details' },
  { key: 'manage_team', label: 'Project teams', help: 'Choose who works on each project' },
  { key: 'review_surveys', label: 'Review', help: 'Review submitted facilities and send them back with changes' },
  { key: 'approve_surveys', label: 'Approve', help: 'Approve facilities, and reopen approved ones' },
  { key: 'manage_templates', label: 'Inspection templates', help: 'Create and edit standard checklists' },
  { key: 'manage_config', label: 'Survey & report setup', help: 'Survey Builder, report layouts and workflow settings' },
  { key: 'manage_users', label: 'Users & roles', help: 'Add users, reset passwords, change roles and this table' }
];

const all = Object.fromEntries(PERMISSIONS.map((p) => [p.key, true]));
const only = (...keys) => Object.fromEntries(keys.map((k) => [k, true]));

export const DEFAULT_ROLES = [
  {
    key: 'super_admin', label: 'Super Admin', sort: 1, locked: true, all_projects: true, approved_only: false,
    description: 'Everything, including other administrators.', permissions: all
  },
  {
    key: 'admin', label: 'Admin', sort: 2, locked: true, all_projects: true, approved_only: false,
    description: 'Everything except changing administrator accounts.', permissions: all
  },
  {
    key: 'manager', label: 'Manager', sort: 3, locked: false, all_projects: true, approved_only: false,
    description: 'Runs projects: teams, review and approval.',
    permissions: only('edit_surveys', 'delete_snags', 'download_reports', 'manage_projects', 'manage_team',
      'review_surveys', 'approve_surveys', 'manage_templates')
  },
  {
    key: 'surveyor', label: 'Surveyor', sort: 4, locked: false, all_projects: false, approved_only: false,
    description: 'Records facilities and snags on site.', permissions: only('edit_surveys', 'manage_projects')
  },
  {
    key: 'engineer', label: 'Engineer', sort: 5, locked: false, all_projects: false, approved_only: false,
    description: 'Surveys and reviews technical findings.',
    permissions: only('edit_surveys', 'download_reports', 'review_surveys')
  },
  {
    key: 'client', label: 'Client', sort: 6, locked: false, all_projects: false, approved_only: true,
    description: 'Reads approved facilities and reports for their projects.', permissions: only('download_reports')
  },
  {
    key: 'viewer', label: 'Viewer', sort: 7, locked: false, all_projects: false, approved_only: false,
    description: 'Reads everything in their projects, changes nothing.', permissions: {}
  }
];

export const ROLE_KEYS = DEFAULT_ROLES.map((r) => r.key);
export const ADMIN_ROLES = ['super_admin', 'admin'];

/**
 * Roles from before Stage 5. Only 'user' is translated: 'admin' is also the
 * key of the new Admin role, so reading it as Super Admin would over-grant
 * every real Admin. An account still on the old 'admin' (only until the
 * migration runs) is simply an Admin here -- the database still gives it
 * everything.
 */
const LEGACY = { user: 'surveyor' };

export function roleKey(user) {
  const role = user?.role;
  return LEGACY[role] || (ROLE_KEYS.includes(role) ? role : 'viewer');
}

/** The role's definition: the one loaded with the profile, else the built-in default. */
export function roleOf(user, roles = null) {
  const key = roleKey(user);
  return (roles || []).find((r) => r.key === key)
    || (user?.roleInfo?.key === key ? user.roleInfo : null)
    || DEFAULT_ROLES.find((r) => r.key === key);
}

export function roleLabel(user) {
  return roleOf(user)?.label || 'Viewer';
}

export const isAdminUser = (user) => !!user && user.is_active !== false && ADMIN_ROLES.includes(roleKey(user));
export const isSuperAdmin = (user) => !!user && user.is_active !== false && roleKey(user) === 'super_admin';

/**
 * Whether a user may do something. Mirrors the database's fm_can(): refused
 * for a deactivated account; administrators hold everything; otherwise the
 * role's permissions plus the user's own extra ticks. Only an explicit true
 * grants.
 */
export function hasPermission(user, permission, roles = null) {
  if (!user || user.is_active === false) return false;
  if (isAdminUser(user)) return true;
  if (roleOf(user, roles)?.permissions?.[permission] === true) return true;
  return user.permissions?.[permission] === true;
}
