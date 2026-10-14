import BackButton from './BackButton';
import ConfirmDelete from './ConfirmDelete';
import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderPlus,
  ChevronRight,
  Loader2,
  Briefcase,
  MapPin,
  AlertCircle,
  FolderKanban,
  Layers,
  ClipboardList,
  RefreshCw
} from 'lucide-react';


/**
 * The first screen: choose a project, or start one.
 *
 * Nothing project-specific is reachable until one is chosen, which is what
 * keeps a facility from ever being recorded under the wrong project.
 */
export default function ProjectDashboard({
  projects = [],
  deletedProjects = [], onDeleteProject, onRestoreProject,
  moduleName = 'Condition Survey', countLabel = 'facilities', onBack,
  loading = false,
  online = true,
  onOpenProject,
  onCreateProject,
  onRefresh,
  openCreateSignal = 0
}) {
  const [showForm, setShowForm] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const changeProject = async (project, restore) => {
    setChanging(true); setError('');
    try { await (restore ? onRestoreProject : onDeleteProject)(project); } catch (e) { setError(e.message); } finally { setChanging(false); }
  };

  // "Create New Project" on the dashboard lands here with the form already open.
  useEffect(() => {
    if (openCreateSignal && onCreateProject) setShowForm(true);
  }, [openCreateSignal]);
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
    <div className="space-y-7 pb-10">
      {pendingDelete && <ConfirmDelete title="Delete project?" onCancel={() => setPendingDelete(null)} onConfirm={() => { const p = pendingDelete; setPendingDelete(null); changeProject(p, false); }}>This removes the project from this module. Reports and photos are retained and can be recovered by restoring the project from Deleted projects. Condition Survey projects must have no live facilities before deletion.</ConfirmDelete>}
      {onBack && <BackButton onClick={onBack}>Choose module</BackButton>}
      {/* Brand navy header: the module you are in, what to do here, and the
          two numbers that matter. */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ocs-600 via-ocs-700 to-ocs-900 p-5 sm:p-8 text-white shadow-raised">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-flame-500/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -bottom-24 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <div className="p-3 sm:p-3.5 bg-white/10 ring-1 ring-white/15 rounded-2xl shrink-0">
              <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{moduleName}</h2>
              <p className="text-white/70 text-sm sm:text-base mt-1">
                Choose a project to work in, or start a new one.
              </p>
            </div>
          </div>

          {onCreateProject && <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setError(''); }}
            className="w-full sm:w-auto justify-center px-5 py-3 rounded-xl bg-flame-500 hover:bg-flame-400 active:scale-[0.98] text-white font-semibold text-[15px] shadow-raised inline-flex items-center gap-2 shrink-0 transition-[background-color,transform] duration-150"
          >
            <FolderPlus className="w-4 h-4" />
            {showForm ? 'Cancel' : 'Create Project'}
          </button>}
        </div>

        <div className="relative grid grid-cols-2 gap-3 mt-5 sm:mt-6 max-w-md">
          {[[FolderKanban, 'Projects', totals.projects], [Layers, countLabel, totals.facilities]].map(([Icon, label, value]) =>
            <div key={label} className="rounded-2xl bg-white/[0.08] ring-1 ring-white/10 px-4 py-3 flex items-center gap-3">
              <Icon className="w-5 h-5 text-white/60 shrink-0" />
              <span className="min-w-0">
                <span className="stat-value block text-2xl font-bold leading-none">{value}</span>
                <span className="block text-xs font-medium text-white/60 mt-1 capitalize">{label}</span>
              </span>
            </div>)}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card space-y-5"
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
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-ocs-500 text-base font-semibold"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client</label>
              <input
                type="text"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-ocs-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-ocs-500 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-ocs-500 text-sm"
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
            className="px-6 py-3 rounded-xl bg-ocs-600 hover:bg-ocs-700 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center gap-2 shadow-card"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      )}

      <div className="flex items-center justify-between border-b border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2.5 pb-3 border-b-2 border-ocs-600 -mb-px">
          <ClipboardList className="w-5 h-5 text-ocs-600" />
          {showDeleted ? `Deleted projects (${deletedProjects.length})` : `All Projects (${projects.length})`}
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          className="text-sm font-semibold text-ocs-600 hover:text-ocs-700 inline-flex items-center gap-1.5 pb-2.5"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {onDeleteProject && <button type="button" className="min-h-11 text-sm font-semibold text-ocs-600" onClick={() => setShowDeleted(v => !v)}>{showDeleted ? 'Show projects' : `Deleted projects (${deletedProjects.length})`}</button>}
      {error && !showForm && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {showDeleted && <div className="grid lg:grid-cols-2 gap-4">{deletedProjects.map(p => <article key={p.id} className="rounded-xl border bg-white p-5"><h4 className="font-bold text-slate-900">{p.name}</h4><p className="text-sm text-slate-500 mt-2">{p.projectNumber}</p>{onRestoreProject && <button type="button" disabled={changing} onClick={() => changeProject(p, true)} className="min-h-11 mt-3 text-sm font-semibold text-ocs-600">Restore project</button>}</article>)}{!deletedProjects.length && <p className="text-slate-500">No deleted projects.</p>}</div>}

      {!showDeleted && (loading ? (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {projects.map((p) => {
            return (
              <article key={p.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden transition-[box-shadow,border-color] duration-200 hover:shadow-raised hover:border-ocs-200"><button
                key={p.id}
                type="button"
                onClick={() => onOpenProject(p)}
                className="group w-full text-left active:bg-slate-50 transition-colors duration-150"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide bg-ocs-50 text-ocs-600">
                        {p.projectNumber}
                      </span>
                      <h4 className="font-bold text-slate-900 text-lg sm:text-xl tracking-tight mt-2 leading-snug truncate">
                        {p.name}
                      </h4>
                    </div>
                    <span className="w-9 h-9 rounded-full bg-slate-50 text-ocs-600 flex items-center justify-center shrink-0 group-hover:bg-ocs-600 group-hover:text-white transition-colors">
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-sm text-slate-500 flex-wrap">
                    {p.client && (
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" /> {p.client}
                      </span>
                    )}
                    {p.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" /> {p.location}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-slate-700">
                    <Layers className="w-4 h-4 text-ocs-500" />
                    <span className="text-sm font-semibold">
                      {p.facilityCount === undefined
                        ? <span className="capitalize">{countLabel}</span>
                        : `${p.facilityCount} ${countLabel}`}
                    </span>
                  </div>
                </div>
              </button>{onDeleteProject && <div className="border-t px-6 py-2"><button type="button" disabled={changing} onClick={() => setPendingDelete(p)} className="min-h-11 text-sm font-semibold text-red-700 disabled:opacity-50">Delete project</button></div>}</article>
            );
          })}
        </div>
      ))}
    </div>
  );
}
