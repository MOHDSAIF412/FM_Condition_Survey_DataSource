import React, { useState } from 'react';
import {
  FolderPlus,
  Building2,
  ChevronRight,
  Loader2,
  Briefcase,
  MapPin,
  AlertCircle
} from 'lucide-react';

/**
 * The first screen: choose a project, or start one.
 *
 * Nothing project-specific is reachable until one is chosen, which is what
 * keeps a facility from ever being recorded under the wrong project.
 */
export default function ProjectDashboard({
  projects = [],
  loading = false,
  online = true,
  onOpenProject,
  onCreateProject,
  onRefresh
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', client: '', location: '', notes: '' });

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Enter a project name.');
      return;
    }

    setSaving(true);
    try {
      await onCreateProject(form);
      setForm({ name: '', client: '', location: '', notes: '' });
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Could not create the project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start space-x-4 min-w-0">
            <div className="p-3 bg-white/10 rounded-xl shrink-0">
              <Briefcase className="w-8 h-8 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold">Projects</h2>
              <p className="text-sky-200/80 text-xs mt-0.5">
                Choose a project to work in, or create a new one.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setError(''); }}
            className="px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.98] text-white font-bold text-sm shadow-card inline-flex items-center gap-2 shrink-0 transition-[background-color,transform] duration-150"
          >
            <FolderPlus className="w-4 h-4" />
            {showForm ? 'Cancel' : 'Create Project'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            New Project
          </h3>

          {!online && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                A project number can only be issued by the server, so this needs a
                connection. Facilities and snags still work offline once the project exists.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client</label>
              <input
                type="text"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            The project number is issued automatically and cannot be duplicated.
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            All Projects ({projects.length})
          </h3>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-semibold text-ocs-600 hover:text-ocs-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm inline-flex items-center gap-2 w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading projects…
          </div>
        ) : !projects.length ? (
          <div className="p-8 text-center">
            <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="font-bold text-slate-700 text-sm">No projects yet</h4>
            <p className="text-xs text-slate-500 mt-1">
              Create a project to begin. Facilities and surveys live inside it.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(p)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-ocs-100 text-ocs-700 text-[11px] font-bold border border-ocs-200">
                        {p.projectNumber}
                      </span>
                      <span className="font-bold text-slate-900 text-sm truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                      {p.client && <span>{p.client}</span>}
                      {p.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {p.location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {p.facilityCount === undefined
                          ? 'Facilities'
                          : `${p.facilityCount} ${p.facilityCount === 1 ? 'facility' : 'facilities'}`}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
