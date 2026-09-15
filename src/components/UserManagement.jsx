import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Loader2, ShieldCheck, User, Copy, Check, X, AlertCircle } from 'lucide-react';
import { listUsers, createUser, deleteUser, listUserPermissions, setUserPermission } from '../utils/auth';

/**
 * What an ordinary surveyor can be granted. Deliberately short: every entry
 * here is something that destroys work or leaves the building as a client
 * document, and a long list of switches nobody understands is worse than none.
 */
const PERMISSIONS = [
  { key: 'delete_snags', label: 'Delete snags', help: 'remove snags and photos from a facility' },
  { key: 'download_reports', label: 'Download reports', help: 'generate client-facing PDF and Excel reports' }
];

/**
 * Admin-only. The server (the admin-users Edge Function) enforces "only an
 * admin can create or delete" on every call regardless of what this screen
 * does -- this UI is convenience, not the actual security boundary.
 */
export default function UserManagement({ myId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'user', password: '' });
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { email, password }
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [perms, setPerms] = useState({});      // userId -> { role, permissions }
  const [savingKey, setSavingKey] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, permissions] = await Promise.all([listUsers(), listUserPermissions()]);
      setUsers(list);
      setPerms(permissions);
    } catch (err) {
      setError(err.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (userId, key, granted) => {
    setSavingKey(`${userId}:${key}`);
    setError('');
    try {
      const next = await setUserPermission(userId, key, granted);
      setPerms((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), permissions: next } }));
    } catch (err) {
      setError(err.message || 'Could not change that permission.');
    } finally {
      setSavingKey(null);
    }
  };

  useEffect(() => { refresh(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const result = await createUser(form);
      setJustCreated({ email: result.user.email, password: result.password });
      setForm({ email: '', fullName: '', role: 'user', password: '' });
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

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(justCreated.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable; the password stays visible on screen */ }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Users</h2>
          <p className="text-sky-200/80 text-xs mt-0.5">Only an administrator can add or remove a login.</p>
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
            Account created for {justCreated.email}
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
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password <span className="font-normal text-slate-400">(blank = auto-generate)</span>
              </label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
          </div>

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

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
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
            {users.map((u) => (
              <li key={u.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm truncate">
                      {u.full_name || u.email}
                    </span>
                    {u.role === 'admin' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ocs-100 text-ocs-700 border border-ocs-200 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Admin
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                        <User className="w-3 h-3" /> User
                      </span>
                    )}
                    {u.id === myId && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{u.email}</p>

                  {/* What this person is allowed to do, shown as the current
                      state rather than hidden behind an edit screen. An admin
                      holds everything by definition, so there is nothing to
                      tick for them. */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {u.role === 'admin' ? (
                      <span className="text-[11px] text-slate-400 italic">
                        Administrator — full access to everything
                      </span>
                    ) : (
                      PERMISSIONS.map((p) => {
                        const granted = perms[u.id]?.permissions?.[p.key] === true;
                        const busy = savingKey === `${u.id}:${p.key}`;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            disabled={busy}
                            onClick={() => togglePermission(u.id, p.key, !granted)}
                            title={granted ? `Revoke: ${p.help}` : `Grant: ${p.help}`}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                              granted
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {busy
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : granted
                                ? <Check className="w-3 h-3" />
                                : <X className="w-3 h-3" />}
                            {p.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {u.id !== myId && (
                  <button
                    type="button"
                    disabled={deletingId === u.id}
                    onClick={() => remove(u)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-bold inline-flex items-center gap-1 border border-red-200"
                  >
                    {deletingId === u.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
