import React, { useEffect, useMemo, useState } from 'react';
import { Users, Loader2, Plus, X, AlertCircle, ChevronDown } from 'lucide-react';
import { listTeamUsers, listProjectMembers, addProjectMember, removeProjectMember, listRoles, accessErrorMessage, rolesBackendReady } from '../utils/access';
import { DEFAULT_ROLES, ADMIN_ROLES, roleKey } from '../utils/roles';

/**
 * Who works on this project. People whose role sees every project (Admins,
 * Managers) are listed apart: adding or removing them here would change
 * nothing they can see.
 */
export default function ProjectTeam({ project, canManage }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [memberIds, setMemberIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rolesBackendReady().then((ok) => { if (!cancelled) setReady(ok); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || !project?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([listTeamUsers(), listProjectMembers(project.id), listRoles()])
      .then(([u, m, r]) => {
        if (cancelled) return;
        setUsers(u.filter((x) => x.is_active !== false));
        setMemberIds(m.map((x) => x.user_id));
        setRoles(r);
      })
      .catch((err) => { if (!cancelled) setError(accessErrorMessage(err, 'Could not load the team.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, project?.id]);

  const roleByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const seesAll = (u) => ADMIN_ROLES.includes(roleKey(u)) || roleByKey[roleKey(u)]?.all_projects;
  const name = (u) => u.full_name || u.email;

  const team = users.filter((u) => memberIds.includes(u.id) && !seesAll(u));
  if (!ready) return null;
  const automatic = users.filter((u) => seesAll(u));
  const candidates = users.filter((u) => !memberIds.includes(u.id) && !seesAll(u));

  const change = async (userId, on) => {
    setBusy(userId);
    setError('');
    try {
      if (on) await addProjectMember(project.id, userId);
      else await removeProjectMember(project.id, userId);
      setMemberIds((prev) => (on ? [...prev, userId] : prev.filter((x) => x !== userId)));
      setAdding('');
    } catch (err) {
      setError(accessErrorMessage(err, 'Could not change the team.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full px-4 sm:px-6 py-3.5 flex items-center gap-2 text-left">
        <Users className="w-4 h-4 text-ocs-600" />
        <span className="font-bold text-slate-800">Project Team</span>
        {open && !loading && <span className="text-slate-400 font-semibold text-sm">({team.length})</span>}
        <span className="text-xs text-slate-500 ml-2 hidden sm:inline">Who can see and work on {project.projectNumber}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 sm:px-6 pb-5 space-y-3 border-t border-slate-100 pt-4">
          {error && (
            <p role="alert" className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2">
                {!team.length && <li className="text-sm text-slate-500">Nobody is on this project's team yet.</li>}
                {team.map((u) => (
                  <li key={u.id} className="pl-3 pr-1 py-1 rounded-full bg-ocs-50 border border-ocs-200 text-ocs-800 text-xs font-semibold inline-flex items-center gap-1.5">
                    {name(u)} <span className="text-ocs-500 font-normal">· {roleByKey[roleKey(u)]?.label}</span>
                    {canManage && (
                      <button type="button" disabled={busy === u.id} onClick={() => change(u.id, false)}
                        aria-label={`Remove ${name(u)} from the team`} className="p-0.5 rounded-full hover:bg-ocs-100 disabled:opacity-50">
                        {busy === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {canManage && !!candidates.length && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor={`team-add-${project.id}`} className="sr-only">Add someone to the team</label>
                  <select id={`team-add-${project.id}`} value={adding} onChange={(e) => setAdding(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white min-w-[220px]">
                    <option value="">Add someone…</option>
                    {candidates.map((u) => <option key={u.id} value={u.id}>{name(u)} ({roleByKey[roleKey(u)]?.label})</option>)}
                  </select>
                  <button type="button" disabled={!adding || busy === adding} onClick={() => change(adding, true)}
                    className="px-3.5 py-2 rounded-xl bg-ocs-600 hover:bg-ocs-700 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center gap-1.5">
                    {busy === adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                  </button>
                </div>
              )}

              {!!automatic.length && (
                <p className="text-xs text-slate-500">
                  Also sees this project through their role: {automatic.map((u) => `${name(u)} (${roleByKey[roleKey(u)]?.label})`).join(', ')}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
