import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Check, AlertCircle, ShieldCheck, Info } from 'lucide-react';
import { listRoles, updateRole, listTeamUsers, accessErrorMessage, rolesBackendReady } from '../utils/access';
import { PERMISSIONS, DEFAULT_ROLES, roleKey } from '../utils/roles';

/**
 * Roles & Permissions: one row per role, one tick box per permission, plus the
 * two access rules (every project or only assigned ones; approved facilities
 * only). A change takes effect for everyone in that role immediately -- the
 * database reads this table on every request.
 *
 * Super Admin and Admin are fixed at "everything": an administrator who could
 * untick their own access could lock everyone out.
 */
export default function RolesPermissions({ canEdit = true, onOpenUsers }) {
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(null);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRoles(), listTeamUsers().catch(() => []), rolesBackendReady()])
      .then(([r, u, ok]) => { if (!cancelled) { setRoles(r); setUsers(u); setReady(ok); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the roles.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const countByRole = useMemo(() => {
    const out = {};
    for (const u of users) { const k = roleKey(u); out[k] = (out[k] || 0) + 1; }
    return out;
  }, [users]);

  const save = async (role, patch, label) => {
    setSaving(`${role.key}:${label}`);
    setError('');
    try {
      const updated = await updateRole(role.key, patch);
      setRoles((prev) => prev.map((r) => (r.key === role.key ? { ...r, ...updated } : r)));
      setSavedKey(`${role.key}:${label}`);
      setTimeout(() => setSavedKey((k) => (k === `${role.key}:${label}` ? null : k)), 1500);
    } catch (err) {
      setError(accessErrorMessage(err, 'Could not change that role.'));
    } finally {
      setSaving(null);
    }
  };

  const togglePermission = (role, key) => {
    const has = role.permissions?.[key] === true;
    const permissions = { ...(role.permissions || {}) };
    if (has) delete permissions[key]; else permissions[key] = true;
    save(role, { permissions }, key);
  };

  // A plain function rather than a component: defined in render, a component
  // would remount on every change and lose keyboard focus.
  const cell = ({ role, label, on, onToggle, title }) => {
    const busy = saving === `${role.key}:${label}`;
    const disabled = role.locked || !canEdit || !ready || busy;
    return (
      <td key={label} className="px-2 py-2.5 text-center">
        <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={on}
          aria-label={`${role.label}: ${title}`} title={role.locked ? 'Administrators always hold everything' : title}
          className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center transition-colors ${
            on ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-emerald-400'} ${savedKey === `${role.key}:${label}` ? 'ring-2 ring-emerald-300' : ''}`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : <Check className="w-4 h-4" />}
        </button>
      </td>
    );
  };

  return (
    <div className="max-w-full space-y-5 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold inline-flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Roles &amp; Permissions</h2>
          <p className="text-sky-200/80 text-xs mt-0.5 max-w-2xl">
            What each role can do, and what it can see. Changes apply to everyone in the role straight away,
            and the database enforces them — hiding a button is never the only protection.
          </p>
        </div>
        {onOpenUsers && (
          <button type="button" onClick={onOpenUsers}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20">
            Assign roles to users
          </button>
        )}
      </div>

      {!ready && <NotSwitchedOn />}

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 align-bottom">
                  <th className="px-4 py-3 font-bold min-w-[220px] sticky left-0 bg-slate-50">Role</th>
                  {PERMISSIONS.map((p) => (
                    <th key={p.key} className="px-2 py-3 font-bold text-center w-20" title={p.help}>
                      <span className="block leading-tight normal-case text-[11px]">{p.label}</span>
                    </th>
                  ))}
                  <th className="px-2 py-3 font-bold text-center w-20 border-l border-slate-200" title="Sees every project without being added to it">
                    <span className="block leading-tight normal-case text-[11px]">All projects</span>
                  </th>
                  <th className="px-2 py-3 font-bold text-center w-20" title="Sees only approved facilities">
                    <span className="block leading-tight normal-case text-[11px]">Approved only</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles.map((role) => (
                  <tr key={role.key} className={role.locked ? 'bg-slate-50/60' : ''}>
                    <td className="px-4 py-2.5 sticky left-0 bg-inherit">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{role.label}</span>
                        {role.locked && <Lock className="w-3.5 h-3.5 text-slate-400" aria-label="Fixed" />}
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold">
                          {countByRole[role.key] || 0} user{countByRole[role.key] === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{role.description}</p>
                    </td>
                    {PERMISSIONS.map((p) => cell({
                      role, label: p.key, title: p.help,
                      on: role.locked || role.permissions?.[p.key] === true,
                      onToggle: () => togglePermission(role, p.key)
                    }))}
                    {cell({ role, label: 'all_projects', title: 'Sees every project without being added to it',
                      on: role.locked || role.all_projects, onToggle: () => save(role, { all_projects: !role.all_projects }, 'all_projects') })}
                    {cell({ role, label: 'approved_only', title: 'Sees only approved facilities',
                      on: !role.locked && role.approved_only, onToggle: () => save(role, { approved_only: !role.approved_only }, 'approved_only') })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-2">What each permission means</h3>
          <dl className="text-xs space-y-1.5">
            {PERMISSIONS.map((p) => (
              <div key={p.key} className="flex gap-2">
                <dt className="font-semibold text-slate-700 w-36 shrink-0">{p.label}</dt>
                <dd className="text-slate-500">{p.help}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="bg-sky-50/70 rounded-2xl border border-sky-100 p-4 text-xs text-slate-600 space-y-2">
          <p className="flex gap-2"><Info className="w-4 h-4 text-sky-600 shrink-0" />
            <span><b>All projects</b> — the role sees every project. Without it, a person sees only the projects they are
            added to (Users → Projects, or the Team panel on a project).</span></p>
          <p className="flex gap-2"><Info className="w-4 h-4 text-sky-600 shrink-0" />
            <span><b>Approved only</b> — for clients: drafts and facilities still being reviewed are hidden from them.</span></p>
          <p className="flex gap-2"><Info className="w-4 h-4 text-sky-600 shrink-0" />
            <span>A person can also be given single extra permissions on top of their role, on the Users page.</span></p>
        </div>
      </div>
    </div>
  );
}

/** Shown until the Stage 5 database change is applied. */
export function NotSwitchedOn() {
  return (
    <div role="status" className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
      <Info className="w-5 h-5 shrink-0 text-amber-600" />
      <div>
        <p className="font-bold">Roles are built but not switched on yet.</p>
        <p className="text-xs mt-0.5">
          The database update that enforces them has not been applied, so nothing here can be saved yet.
          Until it is, everyone keeps today&rsquo;s access: administrators can do everything, other users what is ticked for them.
        </p>
      </div>
    </div>
  );
}
