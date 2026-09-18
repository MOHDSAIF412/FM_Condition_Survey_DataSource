import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus, Trash2, Loader2, ShieldCheck, Copy, Check, X, AlertCircle, KeyRound, FolderKanban, Pencil, Plus
} from 'lucide-react';
import { listUsers, createUser, deleteUser, resetUserPassword, listUserPermissions, setUserPermission } from '../utils/auth';
import { listRoles, setUserRole, listProjectMembers, addProjectMember, removeProjectMember, accessErrorMessage, rolesBackendReady } from '../utils/access';
import { NotSwitchedOn } from '../admin/RolesPermissions';
import { PERMISSIONS, DEFAULT_ROLES, ADMIN_ROLES, isSuperAdmin, roleKey } from '../utils/roles';

const ROLE_BADGE = {
  super_admin: 'bg-ocs-600 text-white border-ocs-600',
  admin: 'bg-ocs-100 text-ocs-700 border-ocs-200',
  manager: 'bg-violet-50 text-violet-700 border-violet-200',
  surveyor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  engineer: 'bg-sky-50 text-sky-700 border-sky-200',
  client: 'bg-amber-50 text-amber-700 border-amber-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200'
};

const projectLabel = (p) => [p.projectNumber, p.name].filter(Boolean).join(' · ');

/**
 * Users: who can sign in, what role they hold, which projects they work on,
 * and any permission given to them on top of their role.
 *
 * Every change is checked again by the server: accounts by the admin-users
 * Edge Function, roles and teams by the database. Administrator accounts can
 * only be changed by a Super Admin, and the screen says so rather than
 * offering buttons that would be refused.
 */
export default function UserManagement({ myId, me, projects = [] }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [members, setMembers] = useState([]);   // [{ project_id, user_id }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const blankForm = { email: '', fullName: '', role: 'surveyor', password: '', projectIds: [] };
  const [form, setForm] = useState(blankForm);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { email, password }
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [perms, setPerms] = useState({});      // userId -> { role, permissions }
  const [savingKey, setSavingKey] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [editingProjectsFor, setEditingProjectsFor] = useState(null);
  const [ready, setReady] = useState(true);

  // Before the database has roles, an old 'admin' is all-powerful, as before.
  const iAmSuper = isSuperAdmin(me) || (!ready && me?.role === 'admin');
  const roleByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const offeredRoles = roles.filter((r) => iAmSuper || !ADMIN_ROLES.includes(r.key));
  const projectsOf = (userId) => members.filter((m) => m.user_id === userId).map((m) => m.project_id);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, permissions, roleList, team, ok] = await Promise.all([
        listUsers(), listUserPermissions(), listRoles(), listProjectMembers().catch(() => []), rolesBackendReady()
      ]);
      setReady(ok);
      setUsers(list);
      setPerms(permissions);
      setRoles(roleList);
      setMembers(team);
    } catch (err) {
      setError(err.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Through roleKey, so an account still on a pre-Stage-5 role reads correctly.
  const roleOfUser = (u) => roleKey({ role: perms[u.id]?.role || u.role });
  const touchable = (u) => iAmSuper || !ADMIN_ROLES.includes(roleOfUser(u));

  const togglePermission = async (userId, key, granted) => {
    setSavingKey(`${userId}:${key}`);
    setError('');
    try {
      const next = await setUserPermission(userId, key, granted);
      setPerms((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), permissions: next } }));
    } catch (err) {
      setError(accessErrorMessage(err, 'Could not change that permission.'));
    } finally {
      setSavingKey(null);
    }
  };

  const changeRole = async (u, role) => {
    const to = roleByKey[role];
    const toAdmin = ADMIN_ROLES.includes(role);
    if (!confirm(
      `Change ${u.email} to ${to?.label || role}?\n\n`
      + (to?.description || '')
      + (toAdmin ? '\n\nThis gives full access to everything.' : '')
    )) return;
    setSavingKey(`${u.id}:role`);
    setError('');
    try {
      await setUserRole(u.id, role);
      setPerms((prev) => ({ ...prev, [u.id]: { ...(prev[u.id] || {}), role } }));
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
    } catch (err) {
      setError(accessErrorMessage(err, 'Could not change that role.'));
    } finally {
      setSavingKey(null);
    }
  };

  const toggleProject = async (userId, projectId, on) => {
    setSavingKey(`${userId}:p:${projectId}`);
    setError('');
    try {
      if (on) await addProjectMember(projectId, userId);
      else await removeProjectMember(projectId, userId);
      setMembers((prev) => (on
        ? [...prev, { project_id: projectId, user_id: userId }]
        : prev.filter((m) => !(m.project_id === projectId && m.user_id === userId))));
    } catch (err) {
      setError(accessErrorMessage(err, 'Could not change that project team.'));
    } finally {
      setSavingKey(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const result = await createUser(form);
      setJustCreated({ email: result.user.email, password: result.password, kind: 'created' });
      setForm(blankForm);
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not create the user.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (user) => {
    if (!confirm(`Remove ${user.email}? They will no longer be able to sign in.`)) return;
    setDeletingId(user.id);
    setError('');
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err.message || 'Could not remove the user.');
    } finally {
      setDeletingId(null);
    }
  };

  const resetPassword = async (user) => {
    if (!confirm(
      `Give ${user.email} a new password?\n\n`
      + 'Their current password stops working immediately. You will see the new one once, to pass on to them.'
    )) return;
    setResettingId(user.id);
    setError('');
    setShowForm(false);
    try {
      const result = await resetUserPassword(user.id);
      setJustCreated({ email: result.user.email, password: result.password, kind: 'reset' });
      setCopied(false);
    } catch (err) {
      setError(err.message || 'Could not reset that password.');
    } finally {
      setResettingId(null);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(justCreated.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable; the password stays visible on screen */ }
  };

  const formRole = roleByKey[form.role];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Users</h2>
          <p className="text-sky-200/80 text-xs mt-0.5">
            A role sets what someone can do; projects set what they can see.
            {!iAmSuper && ' Administrator accounts can only be changed by a Super Admin.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setError(''); setJustCreated(null); }}
          className="px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 text-white font-bold text-sm inline-flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {justCreated && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-2">
          <p className="text-sm font-bold text-emerald-800">
            {justCreated.kind === 'reset'
              ? `New password for ${justCreated.email}`
              : `Account created for ${justCreated.email}`}
          </p>
          <p className="text-xs text-emerald-700">
            Share this password with them now — it is shown only this once and cannot be retrieved later.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-white border border-emerald-300 text-sm font-mono text-slate-800 break-all">
              {justCreated.password}
            </code>
            <button
              type="button"
              onClick={copyPassword}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
              title="Copy password"
              aria-label={copied ? 'Password copied' : 'Copy password'}
            >
              {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nu-email" className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                id="nu-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="nu-name" className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                id="nu-name"
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="nu-role" className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select
                id="nu-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
              >
                {offeredRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              {formRole && <p className="text-[11px] text-slate-500 mt-1">{formRole.description}</p>}
            </div>
            <div>
              <label htmlFor="nu-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                Password <span className="font-normal text-slate-400">(blank = auto-generate)</span>
              </label>
              <input
                id="nu-pass"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
          </div>

          {formRole && !formRole.all_projects && !ADMIN_ROLES.includes(formRole.key) && (
            <fieldset>
              <legend className="block text-xs font-semibold text-slate-700 mb-1.5">Projects they work on</legend>
              {!projects.length && <p className="text-xs text-slate-500">No projects yet.</p>}
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => {
                  const on = form.projectIds.includes(p.id);
                  return (
                    <label key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer inline-flex items-center gap-1.5 ${
                      on ? 'bg-ocs-50 text-ocs-700 border-ocs-300' : 'bg-white text-slate-600 border-slate-200'}`}>
                      <input type="checkbox" className="accent-ocs-600" checked={on}
                        onChange={() => setForm((f) => ({
                          ...f, projectIds: on ? f.projectIds.filter((x) => x !== p.id) : [...f.projectIds, p.id]
                        }))} />
                      {projectLabel(p)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <button
            type="submit"
            disabled={creating}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm inline-flex items-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            {creating ? 'Creating…' : 'Create User'}
          </button>
        </form>
      )}

      {!ready && !loading && <NotSwitchedOn />}

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            All Users ({users.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm inline-flex items-center gap-2 w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {users.map((u) => {
              const roleKeyNow = roleOfUser(u);
              const role = roleByKey[roleKeyNow];
              const isAdminRole = ADMIN_ROLES.includes(roleKeyNow);
              const canEdit = touchable(u);
              const theirProjects = projectsOf(u.id);
              // Managing users is an administrator's job: it comes with a role,
              // never as a single tick on someone else's account.
              const extras = PERMISSIONS.filter((p) => p.key !== 'manage_users' && role?.permissions?.[p.key] !== true);
              return (
                <li key={u.id} className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm truncate">{u.full_name || u.email}</span>
                      {u.id === myId && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">You</span>
                      )}
                      {u.is_active === false && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Deactivated</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 -mt-1">{u.email}</p>

                    {/* Role */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
                      {ready && canEdit && u.id !== myId ? (
                        <select
                          id={`role-${u.id}`}
                          value={roleKeyNow}
                          disabled={savingKey === `${u.id}:role`}
                          onChange={(e) => changeRole(u, e.target.value)}
                          className={`pl-2.5 pr-7 py-1 rounded-full text-[12px] font-bold border focus:outline-none focus:ring-2 focus:ring-sky-500 ${ROLE_BADGE[roleKeyNow] || ROLE_BADGE.viewer}`}
                        >
                          {offeredRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                          {!offeredRoles.some((r) => r.key === roleKeyNow) && <option value={roleKeyNow}>{role?.label || roleKeyNow}</option>}
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-[12px] font-bold border inline-flex items-center gap-1 ${ROLE_BADGE[roleKeyNow] || ROLE_BADGE.viewer}`}
                          title={u.id === myId ? 'You cannot change your own role here.' : 'Only a Super Admin can change an administrator.'}>
                          {isAdminRole && <ShieldCheck className="w-3 h-3" />} {role?.label || roleKeyNow}
                        </span>
                      )}
                      {savingKey === `${u.id}:role` && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                      <span className="text-[11px] text-slate-500">{role?.description}</span>
                    </div>

                    {/* Projects */}
                    {ready && <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
                      {role?.all_projects || isAdminRole ? (
                        <span className="text-slate-500 italic">Every project (role)</span>
                      ) : (
                        <>
                          {!theirProjects.length && <span className="text-rose-600 font-semibold">No projects — sees nothing yet</span>}
                          {theirProjects.map((pid) => {
                            const p = projects.find((x) => x.id === pid);
                            return <span key={pid} className="px-2 py-0.5 rounded-full bg-ocs-50 text-ocs-700 border border-ocs-200 font-semibold">{p ? p.projectNumber : 'Project'}</span>;
                          })}
                          {canEdit && (
                            <button type="button" onClick={() => setEditingProjectsFor(editingProjectsFor === u.id ? null : u.id)}
                              className="px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold inline-flex items-center gap-1">
                              <Pencil className="w-3 h-3" /> {editingProjectsFor === u.id ? 'Done' : 'Projects'}
                            </button>
                          )}
                        </>
                      )}
                    </div>}
                    {ready && editingProjectsFor === u.id && (
                      <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                        {projects.map((p) => {
                          const on = theirProjects.includes(p.id);
                          const busy = savingKey === `${u.id}:p:${p.id}`;
                          return (
                            <button key={p.id} type="button" disabled={busy} onClick={() => toggleProject(u.id, p.id, !on)}
                              aria-pressed={on}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 disabled:opacity-50 ${
                                on ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                              {projectLabel(p)}
                            </button>
                          );
                        })}
                        {!projects.length && <span className="text-xs text-slate-500">No projects yet.</span>}
                      </div>
                    )}

                    {/* Extra permissions on top of the role */}
                    {!isAdminRole && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-400 mr-0.5">Extra:</span>
                        {extras.map((p) => {
                          const granted = perms[u.id]?.permissions?.[p.key] === true;
                          const busy = savingKey === `${u.id}:${p.key}`;
                          return (
                            <button
                              key={p.key}
                              type="button"
                              disabled={busy || !canEdit}
                              onClick={() => togglePermission(u.id, p.key, !granted)}
                              title={granted ? `Revoke: ${p.help}` : `Grant: ${p.help}`}
                              aria-pressed={granted}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                granted
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : granted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {p.label}
                            </button>
                          );
                        })}
                        {!extras.length && <span className="text-[11px] text-slate-400 italic">The role already gives everything.</span>}
                      </div>
                    )}
                  </div>

                  {/* Your own password is changed from the account menu, which
                      asks for the current one; resetting is for other people. */}
                  {u.id !== myId && canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={resettingId === u.id}
                        onClick={() => resetPassword(u)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 border border-slate-200"
                      >
                        {resettingId === u.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          : <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />}
                        Reset password
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === u.id}
                        onClick={() => remove(u)}
                        title={`Remove ${u.email}`}
                        aria-label={`Remove ${u.email}`}
                        className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-bold inline-flex items-center gap-1 border border-red-200"
                      >
                        {deletingId === u.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
