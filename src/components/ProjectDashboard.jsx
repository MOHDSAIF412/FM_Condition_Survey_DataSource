import React, { useState, useMemo } from 'react';
import {
  FolderPlus,
  Building2,
  ChevronRight,
  Loader2,
  Briefcase,
  MapPin,
  AlertCircle,
  FolderKanban,
  Layers
} from 'lucide-react';

// A small fixed palette cycled by index, so cards read as distinct projects
// at a glance instead of one long list of identical navy tiles.
const ACCENTS = [
  { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200', icon: 'text-sky-600 bg-sky-50' },
  { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'text-emerald-600 bg-emerald-50' },
  { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'text-amber-600 bg-amber-50' },
  { bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 border-violet-200', icon: 'text-violet-600 bg-violet-50' },
  { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 border-rose-200', icon: 'text-rose-600 bg-rose-50' }
];

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

  const totals = useMemo(() => {
    const facilities = projects.reduce((n, p) => n + (p.facilityCount || 0), 0);
    return { projects: projects.length, facilities };
  }, [projects]);

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
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* Hero -- a plain sky gradient, deliberately no photo/illustration */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sky-400 via-sky-300 to-blue-200 rounded-3xl p-6 sm:p-8 shadow-lg">
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <div className="p-3.5 bg-white/25 backdrop-blur-sm rounded-2xl shrink-0">
              <Briefcase className="w-9 h-9 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Projects</h2>
              <p className="text-slate-800/70 text-sm mt-1">
                Choose a project to work in, or start a new one.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setError(''); }}
            className="px-5 py-3 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.98] text-white font-bold text-sm shadow-card inline-flex items-center gap-2 shrink-0 transition-[background-color,transform] duration-150"
          >
            <FolderPlus className="w-4 h-4" />
            {showForm ? 'Cancel' : 'Create Project'}
          </button>
        </div>

        {/* Quick stats -- gives the page something to look at even with one project */}
        <div className="relative grid grid-cols-2 gap-3 mt-6 max-w-md">
          <div className="bg-gradient-to-br from-indigo-500 to-violet-500 rounded-2xl px-4 py-3.5 shadow-md">
            <div className="flex items-center gap-2 text-white/80">
              <FolderKanban className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Projects</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-white">{totals.projects}</p>
          </div>
          <div className="bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl px-4 py-3.5 shadow-md">
            <div className="flex items-center gap-2 text-white/80">
              <Layers className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Facilities</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-white">{totals.facilities}</p>
          </div>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5"
        >
          <h3 className="text-base font-bold text-slate-800">New Project</h3>

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
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-base font-semibold"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client</label>
              <input
                type="text"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
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
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      )}

      <div className="flex items-center justify-between">
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
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm inline-flex items-center gap-2 w-full justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading projects…
        </div>
      ) : !projects.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="font-bold text-slate-700 text-base">No projects yet</h4>
          <p className="text-sm text-slate-500 mt-1">
            Create a project to begin. Facilities and surveys live inside it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, idx) => {
            const accent = ACCENTS[idx % ACCENTS.length];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject(p)}
                className="group text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 overflow-hidden"
              >
                <div className={`h-1.5 ${accent.bar}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`p-2.5 rounded-xl ${accent.icon}`}>
                      <Building2 className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1.5" />
                  </div>

                  <span className={`inline-block mt-3 px-2 py-0.5 rounded-md text-[11px] font-bold border ${accent.chip}`}>
                    {p.projectNumber}
                  </span>
                  <h4 className="font-bold text-slate-900 text-base mt-1.5 leading-snug truncate">
                    {p.name}
                  </h4>

                  <div className="flex items-center gap-3 mt-3 text-[12px] text-slate-500 flex-wrap">
                    {p.client && <span className="font-medium">{p.client}</span>}
                    {p.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {p.location}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-slate-600">
                    <Layers className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">
                      {p.facilityCount === undefined
                        ? 'Facilities'
                        : `${p.facilityCount} ${p.facilityCount === 1 ? 'facility' : 'facilities'}`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
