import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, CheckCircle2, Clock3, AlertTriangle, ArrowUp, ArrowDown, Plus, BarChart3, CalendarDays,
  ChevronRight, LayoutList, Users, FileText, Workflow, ClipboardCheck, MoreHorizontal, Building2,
  UserPlus, UploadCloud, Send, RotateCcw, Trash2, Pencil, ShieldCheck, CircleCheck, CircleDashed,
  Camera, FolderKanban, X, Loader2, Lock
} from 'lucide-react';
import { facilityCode } from '../types/survey';
import {
  dashboardStats, recentSurveys, configurationStatus, loadPriorityCounts, cachedPriorityCounts,
  loadRecentActivity, cachedActivity, timeAgo, greeting
} from './portalData';
import { useEscapeKey } from '../utils/useEscapeKey';

const card = 'bg-white rounded-2xl border border-slate-200 shadow-sm';

const PRIORITY_BARS = [
  { p: 1, label: 'P1 Urgent', color: '#dc2626' },
  { p: 2, label: 'P2 Essential', color: '#f97316' },
  { p: 3, label: 'P3 Desirable', color: '#f59e0b' },
  { p: 4, label: 'P4 Long term', color: '#64748b' }
];

/**
 * Web portal home. Every number is real: survey states are the two the app
 * records (Completed = submitted, Draft = in progress) and the chart shows
 * snag priority, the app's own severity scale.
 */
export default function PortalHome({
  currentUser, surveys = [], projects = [], formsConfig, formsVersion, templates = [],
  loading, onCreateSurvey, onViewReports, onOpenSurvey, onOpenProject, onNavigate
}) {
  const isAdmin = currentUser?.role === 'admin';
  const [now, setNow] = useState(() => new Date());
  const [priorities, setPriorities] = useState(() => cachedPriorityCounts());
  const [activity, setActivity] = useState(() => cachedActivity());
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const surveyIds = useMemo(() => surveys.filter((s) => !s.localOnly).map((s) => s.id), [surveys]);
  const idsKey = surveyIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (surveyIds.length) {
      loadPriorityCounts(surveyIds).then((c) => { if (!cancelled && c) setPriorities(c); }).catch(() => {});
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    loadRecentActivity(6)
      .then((rows) => { if (!cancelled) setActivity(rows); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [idsKey]);

  const stats = useMemo(() => dashboardStats(surveys, now.getTime()), [surveys, now]);
  const recent = useMemo(() => recentSurveys(surveys, 5), [surveys]);
  const config = useMemo(() => configurationStatus(formsConfig, templates), [formsConfig, templates]);
  const urgent = priorities?.[1] ?? null;

  const firstName = (currentUser?.full_name || currentUser?.email || '').split(/[ @.]/)[0];
  const name = firstName ? firstName[0].toUpperCase() + firstName.slice(1) : '';

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Greeting */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight">{greeting(now)}{name ? `, ${name}` : ''}</h1>
          <p className="text-slate-500 text-sm mt-1">Here&rsquo;s an overview of your FM Condition Survey system.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 pr-2 text-slate-600">
            <CalendarDays className="w-5 h-5 text-slate-400" />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-700">{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <p className="text-xs text-slate-500">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <button type="button" onClick={onCreateSurvey}
            className="px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 text-white text-sm font-bold inline-flex items-center gap-2 shadow-md">
            <Plus className="w-4 h-4" /> Create New Survey
          </button>
          <button type="button" onClick={onViewReports}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> View Reports
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ClipboardList} tone="ocs" label="Total Surveys" value={stats.total} loading={loading && !surveys.length}
          trend={stats.totalTrend} note={stats.totalTrend === null ? `${stats.createdLast30} started in the last 30 days` : 'started vs. previous 30 days'} />
        <Kpi icon={CheckCircle2} tone="emerald" label="Completed" value={stats.completed} loading={loading && !surveys.length}
          trend={stats.completedTrend} note={stats.completedTrend === null ? `${stats.completedLast30} submitted in the last 30 days` : 'submitted vs. previous 30 days'} />
        <Kpi icon={Clock3} tone="amber" label="In Progress (Draft)" value={stats.drafts} loading={loading && !surveys.length}
          note={`${stats.draftsWithSnags} with snags recorded`} />
        <Kpi icon={AlertTriangle} tone="rose" label="Issues Found" value={stats.snags} loading={loading && !surveys.length}
          note={urgent === null ? `${stats.photos} photos attached` : `${urgent} urgent (P1) · ${stats.photos} photos`} />
      </div>

      {/* Charts + quick actions */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.25fr_1.1fr_0.85fr]">
        <div className={`${card} p-5`}>
          <h2 className="font-bold text-slate-900 text-lg">Survey Status</h2>
          <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
            <Donut total={stats.total} segments={[
              { value: stats.completed, color: '#10b981' },
              { value: stats.drafts, color: '#f59e0b' }
            ]} />
            <ul className="flex-1 w-full space-y-4">
              {[
                { ...stats.statusBreakdown[0], color: 'bg-emerald-500' },
                { ...stats.statusBreakdown[1], color: 'bg-amber-500' }
              ].map((s) => (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span className={`w-3 h-3 rounded-full ${s.color}`} />
                  <span className="flex-1 text-slate-700">{s.label}</span>
                  <span className="font-bold text-slate-900 w-10 text-right">{s.count}</span>
                  <span className="text-slate-400 w-12 text-right">({s.percent}%)</span>
                </li>
              ))}
              <li className="text-[11px] text-slate-400 leading-snug pt-1 border-t border-slate-100">
                Overdue and In Review statuses arrive with Workflows (due dates and a review step).
              </li>
            </ul>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h2 className="font-bold text-slate-900 text-lg">Snags by Priority</h2>
          <p className="text-[11px] text-slate-500">The app&rsquo;s severity scale, across all facilities</p>
          <Bars data={PRIORITY_BARS.map((b) => ({ ...b, value: priorities?.[b.p] ?? 0 }))} empty={!priorities} />
        </div>

        <div className={`${card} p-5 lg:col-span-2 xl:col-span-1`}>
          <h2 className="font-bold text-slate-900 text-lg mb-2">Quick Actions</h2>
          <ul className="divide-y divide-slate-100">
            <QuickAction icon={Plus} label="Create New Survey" onClick={onCreateSurvey} />
            {isAdmin && <QuickAction icon={LayoutList} label="Manage Forms" onClick={() => onNavigate({ admin: 'forms' })} />}
            {isAdmin && <QuickAction icon={Users} label="Manage Users" onClick={() => onNavigate({ admin: 'users' })} />}
            <QuickAction icon={FileText} label="Generate Report" onClick={onViewReports} />
            {isAdmin && <QuickAction icon={ClipboardCheck} label="Inspection Templates" onClick={() => onNavigate({ admin: 'templates' })} />}
            {isAdmin
              ? <QuickAction icon={Workflow} label="Configure Workflows" disabled note="Stage 6" />
              : <QuickAction icon={FolderKanban} label="All Projects" onClick={() => onNavigate({ view: 'projects' })} />}
          </ul>
        </div>
      </div>

      {/* Tables */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.85fr]">
        <div className={`${card} p-5 min-w-0`}>
          <div className="flex items-center mb-3">
            <h2 className="font-bold text-slate-900 text-lg flex-1">Recent Surveys</h2>
            <button type="button" onClick={() => onNavigate({ view: 'projects' })} className="text-xs font-semibold text-ocs-600 hover:text-ocs-700">View All</button>
          </div>
          <RecentTable rows={recent} projects={projects} onOpenSurvey={onOpenSurvey} onOpenProject={onOpenProject} loading={loading && !surveys.length} />
        </div>

        <div className={`${card} p-5 min-w-0`}>
          <div className="flex items-center mb-3">
            <h2 className="font-bold text-slate-900 text-lg flex-1">Recent Activity</h2>
            {isAdmin && <button type="button" onClick={() => onNavigate({ admin: 'audit' })} className="text-xs font-semibold text-ocs-600 hover:text-ocs-700">View All</button>}
          </div>
          <Activity rows={activity} loading={activityLoading && !activity.length} now={now} />
        </div>

        {isAdmin ? (
          <div className={`${card} p-5 lg:col-span-2 xl:col-span-1`}>
            <h2 className="font-bold text-slate-900 text-lg">Configuration Status</h2>
            <p className="text-[11px] text-slate-500 mb-2">{formsVersion ? `Live form version ${formsVersion}` : 'Using the built-in form (nothing published yet)'}</p>
            <ul className="divide-y divide-slate-100">
              <ConfigRow label="Forms" value={config ? `${config.forms} active` : '—'} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Sections" value={config ? `${config.sections} active` : '—'} sub={config?.customSections ? `${config.customSections} custom` : ''} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Fields" value={config ? `${config.fields} active` : '—'} sub={config?.customFields ? `${config.customFields} custom` : ''} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Dropdown Options" value={config ? `${config.options} custom` : '—'} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Inspection Templates" value={config ? `${config.templates} active` : '—'} onClick={() => onNavigate({ admin: 'templates' })} />
              <ConfigRow label="Report Templates" pending="Stage 4" />
              <ConfigRow label="Workflows" pending="Stage 6" />
            </ul>
          </div>
        ) : (
          <div className={`${card} p-5 lg:col-span-2 xl:col-span-1`}>
            <h2 className="font-bold text-slate-900 text-lg">Evidence Check</h2>
            <p className="text-[11px] text-slate-500 mb-3">Things worth finishing before reports go to the client</p>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3"><Clock3 className="w-4 h-4 text-amber-500" /><span className="flex-1">Drafts not yet submitted</span><b>{stats.drafts}</b></li>
              <li className="flex items-center gap-3"><Camera className="w-4 h-4 text-rose-500" /><span className="flex-1">Completed facilities with no photos</span><b>{stats.noPhotoFacilities}</b></li>
              <li className="flex items-center gap-3"><AlertTriangle className="w-4 h-4 text-rose-600" /><span className="flex-1">Urgent (P1) snags</span><b>{urgent ?? '—'}</b></li>
            </ul>
          </div>
        )}
      </div>

      {/* Banner */}
      {isAdmin && (
        <div className={`${card} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 bg-gradient-to-r from-white to-sky-50`}>
          <span className="w-11 h-11 rounded-xl bg-ocs-600 text-white flex items-center justify-center shrink-0"><LayoutList className="w-5 h-5" /></span>
          <div className="flex-1">
            <p className="font-bold text-slate-900">Need to make a change?</p>
            <p className="text-sm text-slate-500">Add fields, sections and dropdown options yourself in the Survey Builder — publish when ready, roll back any time. No code needed.</p>
          </div>
          <button type="button" onClick={() => onNavigate({ admin: 'forms' })}
            className="px-4 py-2.5 rounded-xl bg-ocs-600 hover:bg-ocs-500 text-white text-sm font-bold inline-flex items-center gap-2 shrink-0">
            Open Survey Builder <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const TONES = {
  ocs: 'bg-ocs-50 text-ocs-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600'
};

function Kpi({ icon: Icon, tone, label, value, trend, note, loading }) {
  const up = trend !== null && trend !== undefined && trend >= 0;
  return (
    <div className={`${card} p-5 flex items-start gap-4`}>
      <span className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${TONES[tone]}`}><Icon className="w-6 h-6" /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-300" /> : value}</p>
        {trend !== null && trend !== undefined && (
          <p className={`text-sm font-semibold mt-1 inline-flex items-center gap-1 ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
            {up ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />} {Math.abs(trend)}%
          </p>
        )}
        {note && <p className="text-xs text-slate-500 mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

function Donut({ total, segments }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((n, s) => n + s.value, 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0" role="img" aria-label={`${total} total surveys`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="#e2e8f0" strokeWidth="34" />
      {sum > 0 && segments.map((s, i) => {
        const len = (s.value / sum) * c;
        const el = (
          <circle key={i} cx="100" cy="100" r={r} fill="none" stroke={s.color} strokeWidth="34"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" />
        );
        offset += len;
        return el;
      })}
      <text x="100" y="98" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 30, fontWeight: 700 }}>{total}</text>
      <text x="100" y="120" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 12 }}>Total Surveys</text>
    </svg>
  );
}

function Bars({ data, empty }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = max <= 10 ? 2 : max <= 50 ? 10 : max <= 100 ? 20 : Math.ceil(max / 5 / 50) * 50;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const H = 160;
  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <div className="relative w-8 shrink-0" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 text-[10px] text-slate-400 -translate-y-1/2" style={{ top: H - (t / top) * H }}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1 border-l border-b border-slate-200" style={{ height: H }}>
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ top: H - (t / top) * H }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around px-2">
            {data.map((d) => (
              <div key={d.p} className="flex flex-col items-center justify-end h-full w-1/5">
                <span className="text-xs font-bold text-slate-700 mb-1">{empty ? '—' : d.value}</span>
                <div className="w-full max-w-[52px] rounded-t-md transition-all" title={`${d.label}: ${d.value}`}
                  style={{ height: `${empty ? 0 : (d.value / top) * (H - 18)}px`, background: d.color, minHeight: d.value ? 3 : 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-2">
        <div className="w-8 shrink-0" />
        <div className="flex-1 flex justify-around px-2">
          {data.map((d) => <span key={d.p} className="w-1/5 text-center text-[11px] text-slate-600 leading-tight">{d.label}</span>)}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, disabled, note }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={disabled}
        className="w-full flex items-center gap-3 py-2.5 text-left group disabled:cursor-not-allowed">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${disabled ? 'bg-slate-50 text-slate-300' : 'bg-ocs-50 text-ocs-600'}`}><Icon className="w-4 h-4" /></span>
        <span className={`flex-1 text-sm ${disabled ? 'text-slate-400' : 'text-slate-700 group-hover:text-ocs-600'}`}>{label}</span>
        {disabled ? <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"><Lock className="w-3 h-3" />{note}</span>
          : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
    </li>
  );
}

function ConfigRow({ label, value, sub, onClick, pending }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={!onClick}
        className="w-full flex items-center gap-3 py-2.5 text-left group disabled:cursor-default">
        {pending ? <CircleDashed className="w-5 h-5 text-slate-300" /> : <CircleCheck className="w-5 h-5 text-emerald-500" />}
        <span className="flex-1 text-sm text-slate-700">{label}{sub && <span className="block text-[10px] text-slate-400">{sub}</span>}</span>
        <span className={`text-xs font-semibold ${pending ? 'text-slate-400' : 'text-emerald-600'}`}>{pending ? `Not set up · ${pending}` : value}</span>
        {onClick && <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
    </li>
  );
}

function RecentTable({ rows, projects, onOpenSurvey, onOpenProject, loading }) {
  const [menuFor, setMenuFor] = useState(null);
  useEscapeKey(() => setMenuFor(null), !!menuFor);
  if (loading) return <p className="py-8 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>;
  if (!rows.length) return <p className="py-8 text-center text-slate-500 text-sm">No surveys yet. Create the first one.</p>;
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold text-slate-500 bg-slate-50">
            <th className="py-2.5 px-3 rounded-l-lg">Survey ID</th>
            <th className="py-2.5 px-3">Project</th>
            <th className="py-2.5 px-3">Facility</th>
            <th className="py-2.5 px-3">Status</th>
            <th className="py-2.5 px-3">Date</th>
            <th className="py-2.5 px-3 rounded-r-lg text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const p = projects.find((x) => x.id === s.projectId);
            const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber) || '—';
            const date = s.submittedAt || s.updatedAt || s.createdAt;
            const done = s.status === 'submitted';
            return (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">{code}</td>
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{p?.projectNumber || '—'}</td>
                <td className="py-3 px-3 text-slate-700 max-w-[180px] truncate">
                  <button type="button" onClick={() => onOpenSurvey(s.id)} className="hover:text-ocs-600 hover:underline truncate max-w-full text-left">
                    {s.facilityName || 'Unnamed facility'}
                  </button>
                </td>
                <td className="py-3 px-3">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {done ? 'Completed' : 'Draft'}
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{date ? new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                <td className="py-3 px-3 text-right relative">
                  <button type="button" aria-label={`Actions for ${s.facilityName || code}`} aria-expanded={menuFor === s.id}
                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuFor === s.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div role="menu" className="absolute right-3 top-10 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-left">
                        <button role="menuitem" type="button" onClick={() => { setMenuFor(null); onOpenSurvey(s.id); }}
                          className="w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /> Open facility</button>
                        {p && (
                          <button role="menuitem" type="button" onClick={() => { setMenuFor(null); onOpenProject(p); }}
                            className="w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"><FolderKanban className="w-4 h-4 text-slate-400" /> Open project</button>
                        )}
                      </div>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ACTIVITY_LOOK = {
  CREATED: { icon: Plus, cls: 'bg-ocs-50 text-ocs-600', title: 'New survey created' },
  NAMED: { icon: Pencil, cls: 'bg-sky-50 text-sky-600', title: 'Survey named' },
  SUBMITTED: { icon: Send, cls: 'bg-emerald-50 text-emerald-600', title: 'Survey submitted' },
  REOPENED: { icon: RotateCcw, cls: 'bg-amber-50 text-amber-600', title: 'Survey reopened' },
  DELETED: { icon: Trash2, cls: 'bg-rose-50 text-rose-600', title: 'Survey deleted' }
};

function describeActivity(row) {
  if (row.table_name === 'condition_surveys') {
    const look = ACTIVITY_LOOK[row.action] || ACTIVITY_LOOK.NAMED;
    const d = row.new_data || {};
    const code = d.facility_number ? facilityCode(d.facility_number) : '';
    return { ...look, detail: [code, d.facility_name || 'Unnamed facility'].filter(Boolean).join(' · ') };
  }
  if (row.table_name === 'app_config_versions') {
    const published = /-> published/.test(row.summary || '');
    return {
      icon: published ? UploadCloud : LayoutList, cls: published ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600',
      title: published ? 'Form published' : 'Form configuration changed', detail: row.summary
    };
  }
  if (row.table_name === 'fm_survey_users') {
    return { icon: row.action === 'INSERT' ? UserPlus : ShieldCheck, cls: 'bg-sky-50 text-sky-600',
      title: row.action === 'INSERT' ? 'User added' : row.action === 'DELETE' ? 'User removed' : 'User access updated',
      detail: row.summary?.replace(/^user /, '').replace(/ (insert|update|delete)$/, '') };
  }
  if (row.table_name === 'inspection_templates') {
    return { icon: ClipboardCheck, cls: 'bg-teal-50 text-teal-600', title: 'Inspection template updated', detail: row.new_data?.name };
  }
  return { icon: FileText, cls: 'bg-slate-100 text-slate-600', title: row.summary || 'Change', detail: '' };
}

function Activity({ rows, loading, now }) {
  if (loading) return <p className="py-8 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>;
  if (!rows.length) return <p className="py-8 text-center text-slate-500 text-sm">Activity will appear here as surveys are created and submitted.</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => {
        const a = describeActivity(r);
        const Icon = a.icon;
        return (
          <li key={r.id} className="flex items-start gap-3">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${a.cls}`}><Icon className="w-4 h-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
              <p className="text-xs text-slate-500 truncate">{a.detail}{r.changed_by_email ? ` · ${r.changed_by_email.split('@')[0]}` : ''}</p>
            </div>
            <span className="text-[11px] text-slate-400 whitespace-nowrap">{timeAgo(r.changed_at, now.getTime())}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Choosing the project a new survey belongs to. */
export function ProjectPickerDialog({ projects, onPick, onClose }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="pick-project-title" className="w-full max-w-md bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center">
          <h3 id="pick-project-title" className="font-bold text-slate-900 flex-1">Which project is this survey for?</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="w-full text-left px-3 py-3 rounded-xl hover:bg-slate-50 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-ocs-50 text-ocs-600 flex items-center justify-center"><FolderKanban className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{p.projectNumber} · {p.name}</span>
                  <span className="block text-[11px] text-slate-500">{p.facilityCount || 0} facilities{p.client ? ` · ${p.client}` : ''}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
