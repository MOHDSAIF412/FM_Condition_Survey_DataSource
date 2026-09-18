import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, CheckCircle2, Clock3, ArrowUpRight, ArrowDownRight, Plus, BarChart3, CalendarDays,
  ChevronRight, LayoutList, Users, FileText, Workflow, ClipboardCheck, MoreHorizontal, Building2,
  UserPlus, UploadCloud, Send, RotateCcw, Trash2, Pencil, ShieldCheck, CircleCheck, CircleDashed,
  Camera, FolderKanban, FolderPlus, Loader2, Lock, Sun, Moon, Zap, Activity as ActivityIcon, Settings2,
  Info, AlertTriangle
} from 'lucide-react';
import { facilityCode } from '../types/survey';
import {
  dashboardStats, recentSurveys, configurationStatus, loadPriorityCounts, cachedPriorityCounts,
  loadRecentActivity, cachedActivity, timeAgo, greeting, dailySeries
} from './portalData';
import { useEscapeKey } from '../utils/useEscapeKey';
import { can } from '../utils/auth';

const card = 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,37,87,0.06)]';
const clickable = 'cursor-pointer transition-shadow hover:shadow-md hover:border-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';

const PRIORITY_BARS = [
  { p: 1, label: 'P1 Urgent', color: '#ef4444' },
  { p: 2, label: 'P2 Essential', color: '#f97316' },
  { p: 3, label: 'P3 Desirable', color: '#eab308' },
  { p: 4, label: 'P4 Long term', color: '#94a3b8' }
];

/**
 * Web portal home. Every number is real, and every tile, chart and row opens
 * the list or screen behind it.
 */
export default function PortalHome({
  currentUser, surveys = [], projects = [], formsConfig, formsVersion, templates = [],
  loading, onCreateProject, onViewReports, onOpenSurvey, onOpenProject, onOpenList, onNavigate
}) {
  // What this user may manage decides which actions and panels appear.
  const isAdmin = can(currentUser, 'manage_config');
  const mayUsers = can(currentUser, 'manage_users');
  const mayTemplates = can(currentUser, 'manage_templates');
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
  const knownSurveys = useMemo(() => new Set(surveys.map((s) => s.id)), [surveys]);
  const recent = useMemo(() => recentSurveys(surveys, 6), [surveys]);
  const config = useMemo(() => configurationStatus(formsConfig, templates), [formsConfig, templates]);
  const series = useMemo(() => ({
    total: dailySeries(surveys, (s) => s.createdAt || s.updatedAt, { now: now.getTime() }),
    completed: dailySeries(surveys.filter((s) => s.status === 'submitted'), (s) => s.submittedAt, { now: now.getTime() }),
    drafts: dailySeries(surveys.filter((s) => s.status !== 'submitted'), (s) => s.updatedAt || s.createdAt, { now: now.getTime() })
  }), [surveys, now]);

  const firstName = (currentUser?.full_name || currentUser?.email || '').split(/[ @.]/)[0];
  const name = firstName ? firstName[0].toUpperCase() + firstName.slice(1) : '';
  const hour = now.getHours();
  const GreetIcon = hour >= 6 && hour < 18 ? Sun : Moon;
  const initialLoad = loading && !surveys.length;

  return (
    <div className="w-full space-y-4 pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white via-sky-50/70 to-sky-100/60 border border-slate-200/80 px-5 sm:px-7 py-5">
        <Skyline className="hidden md:block absolute right-[30%] bottom-0 h-full w-[360px] opacity-90 pointer-events-none" />
        <div className="relative flex flex-col xl:flex-row xl:items-center gap-4">
          <div className="flex-1 min-w-0 flex items-start gap-3">
            <GreetIcon className={`w-7 h-7 mt-1 shrink-0 ${GreetIcon === Sun ? 'text-amber-400' : 'text-ocs-400'}`} />
            <div>
              <p className="text-slate-700 font-semibold">{greeting(now)},</p>
              <h1 className="text-3xl font-extrabold text-ocs-800 tracking-tight">{name || 'Welcome'} <span aria-hidden="true">👋</span></h1>
              <p className="text-slate-500 text-sm mt-1">Here&rsquo;s an overview of your FM Condition Survey system.</p>
            </div>
          </div>
          <div className="flex items-stretch gap-3 flex-wrap">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
              <CalendarDays className="w-5 h-5 text-ocs-500" />
              <div className="leading-tight">
                <p className="text-sm font-bold text-slate-800">{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="text-xs text-slate-500">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
            {onCreateProject && (
              <button type="button" onClick={onCreateProject}
                className="px-5 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 text-white text-sm font-bold inline-flex items-center gap-2 shadow-md">
                <FolderPlus className="w-4 h-4" /> Create New Project
              </button>
            )}
            <button type="button" onClick={onViewReports}
              className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center gap-2 shadow-sm">
              <BarChart3 className="w-4 h-4 text-ocs-600" /> View Reports
            </button>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Kpi icon={ClipboardList} tone="ocs" color="#3b5697" label="Total Surveys" value={stats.total} loading={initialLoad}
          trend={stats.totalTrend} series={series.total} note={`${stats.createdLast30} started in the last 30 days`}
          onClick={() => onOpenList('all')} />
        <Kpi icon={CheckCircle2} tone="emerald" color="#10b981" label="Completed" value={stats.completed} loading={initialLoad}
          trend={stats.completedTrend} series={series.completed} note={`${stats.completedLast30} submitted in the last 30 days`}
          onClick={() => onOpenList('submitted')} />
        <Kpi icon={Clock3} tone="amber" color="#f59e0b" label="In Progress (Draft)" value={stats.drafts} loading={initialLoad}
          series={series.drafts} note={`${stats.draftsWithSnags} with snags recorded`}
          onClick={() => onOpenList('draft')} />
      </div>

      {/* Charts + quick actions */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-[1.25fr_1.25fr_1fr]">
        <div className={`${card} p-5`}>
          <Title title="Survey Status" sub="Overview of survey completion progress" />
          <div className="flex flex-col sm:flex-row items-center gap-6 mt-3">
            <Donut total={stats.total} onClick={() => onOpenList('all')} segments={[
              { value: stats.completed, color: '#10b981', key: 'submitted' },
              { value: stats.drafts, color: '#f59e0b', key: 'draft' }
            ]} onSegment={onOpenList} />
            <div className="flex-1 w-full">
              <ul className="divide-y divide-slate-100">
                {[
                  { ...stats.statusBreakdown[0], color: 'bg-emerald-500' },
                  { ...stats.statusBreakdown[1], color: 'bg-amber-500' }
                ].map((s) => (
                  <li key={s.key}>
                    <button type="button" onClick={() => onOpenList(s.key)}
                      className="w-full flex items-center gap-3 py-3 text-sm rounded-lg hover:bg-slate-50 px-2 -mx-2">
                      <span className={`w-3 h-3 rounded-full ${s.color}`} />
                      <span className="flex-1 text-left text-slate-700">{s.label}</span>
                      <span className="font-bold text-slate-900 w-10 text-right tabular-nums">{s.count}</span>
                      <span className="text-slate-400 w-14 text-right">({s.percent}%)</span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex gap-2 items-start text-[11px] text-slate-500 bg-sky-50/70 border border-sky-100 rounded-xl px-3 py-2">
                <Info className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                Overdue and In Review statuses arrive with Workflows (due dates and a review step).
              </p>
            </div>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <Title title="Snags by Priority" sub="The app’s severity scale, across all facilities — click a bar to see the facilities" />
          <Bars data={PRIORITY_BARS.map((b) => ({ ...b, value: priorities?.[b.p] ?? 0 }))} empty={!priorities}
            onBar={(p) => onOpenList({ priority: p })} />
        </div>

        <div className={`${card} p-5 lg:col-span-2 2xl:col-span-1`}>
          <IconTitle icon={Zap} gradient title="Quick Actions" sub="Take action, get things done" />
          <ul className="divide-y divide-slate-100 mt-2">
            {onCreateProject && <QuickAction icon={FolderPlus} label="Create New Project" onClick={onCreateProject} />}
            {isAdmin && <QuickAction icon={LayoutList} label="Manage Forms" onClick={() => onNavigate({ admin: 'forms' })} />}
            {mayUsers && <QuickAction icon={Users} label="Manage Users" onClick={() => onNavigate({ admin: 'users' })} />}
            <QuickAction icon={FileText} label="Generate Report" onClick={onViewReports} />
            {mayTemplates && <QuickAction icon={ClipboardCheck} label="Inspection Templates" onClick={() => onNavigate({ admin: 'templates' })} />}
            <QuickAction icon={Building2} label="All Facilities" onClick={() => onOpenList('all')} />
            {isAdmin
              ? <QuickAction icon={Workflow} label="Configure Workflows" disabled note="Stage 6" />
              : <QuickAction icon={FolderKanban} label="All Projects" onClick={() => onNavigate({ view: 'projects' })} />}
          </ul>
        </div>
      </div>

      {/* Tables */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-[1.25fr_1.25fr_1fr]">
        <div className={`${card} p-5 min-w-0`}>
          <div className="flex items-center mb-3">
            <IconTitle icon={ClipboardList} title="Recent Surveys" />
            <button type="button" onClick={() => onOpenList('all')} className="ml-auto text-xs font-semibold text-ocs-600 hover:text-ocs-700 inline-flex items-center gap-1">
              View All <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <RecentTable rows={recent} projects={projects} onOpenSurvey={onOpenSurvey} onOpenProject={onOpenProject} loading={initialLoad} />
        </div>

        <div className={`${card} p-5 min-w-0`}>
          <div className="flex items-center mb-3">
            <IconTitle icon={ActivityIcon} title="Recent Activity" />
            {isAdmin && (
              <button type="button" onClick={() => onNavigate({ admin: 'audit' })} className="ml-auto text-xs font-semibold text-ocs-600 hover:text-ocs-700 inline-flex items-center gap-1">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Activity rows={activity} loading={activityLoading && !activity.length} now={now}
            knownSurveys={knownSurveys} onOpenSurvey={onOpenSurvey} onNavigate={onNavigate} isAdmin={isAdmin} />
        </div>

        {isAdmin ? (
          <div className={`${card} p-5 lg:col-span-2 2xl:col-span-1`}>
            <IconTitle icon={Settings2} title="Configuration Status"
              sub={formsVersion ? `Live form version ${formsVersion}` : 'Using the built-in form (nothing published yet)'} />
            <ul className="divide-y divide-slate-100 mt-2">
              <ConfigRow label="Forms" value={config ? `${config.forms} active` : '—'} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Sections" value={config ? `${config.sections} active` : '—'} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Fields" value={config ? `${config.fields} active` : '—'} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Dropdown Options" value={config ? `${config.options} custom` : '—'} onClick={() => onNavigate({ admin: 'forms' })} />
              <ConfigRow label="Inspection Templates" value={config ? `${config.templates} active` : '—'} onClick={() => onNavigate({ admin: 'templates' })} />
              <ConfigRow label="Report Templates" pending="Stage 4" />
              <ConfigRow label="Workflows" pending="Stage 6" />
            </ul>
          </div>
        ) : (
          <div className={`${card} p-5 lg:col-span-2 2xl:col-span-1`}>
            <IconTitle icon={ClipboardCheck} title="Evidence Check" sub="Worth finishing before reports go to the client" />
            <ul className="divide-y divide-slate-100 mt-2 text-sm">
              <EvidenceRow icon={Clock3} tone="text-amber-500" label="Drafts not yet submitted" value={stats.drafts} onClick={() => onOpenList('draft')} />
              <EvidenceRow icon={Camera} tone="text-rose-500" label="Completed facilities with no photos" value={stats.noPhotoFacilities} onClick={() => onOpenList({ evidence: 'noPhotos' })} />
              <EvidenceRow icon={AlertTriangle} tone="text-rose-600" label="Urgent (P1) snags" value={priorities?.[1] ?? '—'} onClick={() => onOpenList({ priority: 1 })} />
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const TONES = {
  ocs: 'bg-ocs-50 text-ocs-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600'
};

function Title({ title, sub }) {
  return (
    <div>
      <h2 className="font-bold text-slate-900 text-lg leading-tight">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function IconTitle({ icon: Icon, title, sub, gradient }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${gradient ? 'bg-gradient-to-br from-ocs-500 to-ocs-700 text-white shadow-md' : 'bg-ocs-50 text-ocs-600'}`}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-bold text-slate-900 text-lg leading-tight">{title}</h2>
        {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function Sparkline({ values, color }) {
  const W = 120;
  const H = 44;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? W / (values.length - 1) : W;
  const pts = values.map((v, i) => [i * step, H - 4 - (v / max) * (H - 10)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `spark-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-28 h-11 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({ icon: Icon, tone, color, label, value, trend, note, loading, series, onClick }) {
  const hasTrend = trend !== null && trend !== undefined;
  const up = hasTrend && trend >= 0;
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}. Open the list`}
      className={`${card} ${clickable} p-5 flex items-center gap-4 text-left w-full`}>
      <span className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${TONES[tone]}`}><Icon className="w-7 h-7" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-300 inline" /> : value}
          </span>
          {hasTrend && (
            <span className={`text-xs font-bold inline-flex items-center ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
              {up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}{up ? '+' : '-'}{Math.abs(trend)}%
            </span>
          )}
        </p>
        {note && <p className="text-xs text-slate-500 mt-1 truncate">{note}</p>}
      </div>
      {series && <Sparkline values={series} color={color} />}
    </button>
  );
}

function Donut({ total, segments, onSegment, onClick }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((n, s) => n + s.value, 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" className="w-48 h-48 shrink-0" role="img" aria-label={`${total} total surveys`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="#e2e8f0" strokeWidth="30" />
      {sum > 0 && segments.map((s) => {
        const len = (s.value / sum) * c;
        const el = (
          <circle key={s.key} cx="100" cy="100" r={r} fill="none" stroke={s.color} strokeWidth="30"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)"
            className="cursor-pointer hover:opacity-80" onClick={() => onSegment(s.key)}>
            <title>{s.value}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      <g className="cursor-pointer" onClick={onClick}>
        <circle cx="100" cy="100" r="54" fill="white" />
        <text x="100" y="100" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 32, fontWeight: 800 }}>{total}</text>
        <text x="100" y="122" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 12 }}>Total Surveys</text>
      </g>
    </svg>
  );
}

function niceTop(max) {
  if (max <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

function Bars({ data, empty, onBar }) {
  const top = niceTop(Math.max(1, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const H = 190;
  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <div className="relative w-9 shrink-0" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 text-[10px] text-slate-400 -translate-y-1/2" style={{ top: H - (t / top) * H }}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1 border-l border-b border-slate-200" style={{ height: H }}>
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ top: H - (t / top) * H }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around px-3">
            {data.map((d) => (
              <button key={d.p} type="button" onClick={() => onBar(d.p)} title={`${d.label}: ${d.value} — open the facilities with these snags`}
                className="group flex flex-col items-center justify-end h-full w-1/5 focus:outline-none">
                <span className="text-xs font-bold text-slate-700 mb-1">{empty ? '—' : d.value}</span>
                <span className="block w-full max-w-[64px] rounded-t-lg group-hover:opacity-80 transition-opacity"
                  style={{ height: `${empty ? 0 : (d.value / top) * (H - 20)}px`, background: `linear-gradient(to top, ${d.color}, ${d.color}cc)`, minHeight: d.value ? 3 : 2 }} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-2">
        <div className="w-9 shrink-0" />
        <div className="flex-1 flex justify-around px-3">
          {data.map((d) => <span key={d.p} className="w-1/5 text-center text-[11px] font-medium text-slate-600 leading-tight">{d.label}</span>)}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, disabled, note }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={disabled}
        className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left group hover:bg-slate-50 disabled:hover:bg-transparent disabled:cursor-not-allowed">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${disabled ? 'bg-slate-50 text-slate-300' : 'bg-ocs-50 text-ocs-600'}`}><Icon className="w-4 h-4" /></span>
        <span className={`flex-1 text-sm font-medium ${disabled ? 'text-slate-400' : 'text-slate-700 group-hover:text-ocs-600'}`}>{label}</span>
        {disabled ? <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Lock className="w-3 h-3" />{note}</span>
          : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
    </li>
  );
}

function ConfigRow({ label, value, onClick, pending }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={!onClick}
        className="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg text-left group hover:bg-slate-50 disabled:hover:bg-transparent disabled:cursor-default">
        {pending ? <CircleDashed className="w-[18px] h-[18px] text-slate-300" /> : <CircleCheck className="w-[18px] h-[18px] text-emerald-500" />}
        <span className="flex-1 text-sm text-slate-700">{label}</span>
        <span className={`text-xs font-semibold ${pending ? 'text-slate-400' : 'text-emerald-600'}`}>{pending ? `Not set up · ${pending}` : value}</span>
        <ChevronRight className={`w-4 h-4 ${onClick ? 'text-slate-400' : 'text-slate-200'}`} />
      </button>
    </li>
  );
}

function EvidenceRow({ icon: Icon, tone, label, value, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 text-left">
        <Icon className={`w-4 h-4 ${tone}`} /><span className="flex-1">{label}</span><b className="tabular-nums">{value}</b>
        <ChevronRight className="w-4 h-4 text-slate-400" />
      </button>
    </li>
  );
}

function RecentTable({ rows, projects, onOpenSurvey, onOpenProject, loading }) {
  const [menuFor, setMenuFor] = useState(null);
  useEscapeKey(() => setMenuFor(null), !!menuFor);
  if (loading) return <p className="py-8 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>;
  if (!rows.length) return <p className="py-8 text-center text-slate-500 text-sm">No surveys yet.</p>;
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold text-slate-500 border-b border-slate-100">
            <th className="py-2 px-2">Survey ID</th>
            <th className="py-2 px-2">Project</th>
            <th className="py-2 px-2">Facility</th>
            <th className="py-2 px-2">Status</th>
            <th className="py-2 px-2">Date</th>
            <th className="py-2 px-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const p = projects.find((x) => x.id === s.projectId);
            const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber) || '—';
            const date = s.submittedAt || s.updatedAt || s.createdAt;
            const done = s.status === 'submitted';
            return (
              <tr key={s.id} onClick={() => onOpenSurvey(s.id)}
                className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-sky-50/50">
                <td className="py-2.5 px-2 font-bold text-slate-800 whitespace-nowrap">{code}</td>
                <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">{p?.projectNumber || '—'}</td>
                <td className="py-2.5 px-2 text-slate-700 max-w-[180px] truncate">{s.facilityName || 'Unnamed facility'}</td>
                <td className="py-2.5 px-2">
                  <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {done ? 'Completed' : 'Draft'}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">{date ? new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                <td className="py-2.5 px-2 text-right relative" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label={`Actions for ${s.facilityName || code}`} aria-expanded={menuFor === s.id}
                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuFor === s.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div role="menu" className="absolute right-2 top-9 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-left">
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
    return {
      ...look, detail: [code, d.facility_name || 'Unnamed facility'].filter(Boolean).join(' · '),
      open: row.action === 'DELETED' ? null : { survey: row.record_id }
    };
  }
  if (row.table_name === 'app_config_versions') {
    const published = /-> published/.test(row.summary || '');
    return {
      icon: published ? UploadCloud : LayoutList, cls: published ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600',
      title: published ? 'Form published' : 'Form configuration changed', detail: row.summary, open: { admin: 'versions' }
    };
  }
  if (row.table_name === 'fm_survey_users') {
    return {
      icon: row.action === 'INSERT' ? UserPlus : ShieldCheck, cls: 'bg-sky-50 text-sky-600',
      title: row.action === 'INSERT' ? 'User added' : row.action === 'DELETE' ? 'User removed' : 'User access updated',
      detail: row.summary?.replace(/^user /, '').replace(/ (insert|update|delete)$/, ''), open: { admin: 'users' }
    };
  }
  if (row.table_name === 'inspection_templates') {
    return { icon: ClipboardCheck, cls: 'bg-teal-50 text-teal-600', title: 'Inspection template updated', detail: row.new_data?.name, open: { admin: 'templates' } };
  }
  return { icon: FileText, cls: 'bg-slate-100 text-slate-600', title: row.summary || 'Change', detail: '', open: { admin: 'audit' } };
}

function Activity({ rows, loading, now, knownSurveys, onOpenSurvey, onNavigate, isAdmin }) {
  if (loading) return <p className="py-8 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>;
  if (!rows.length) {
    return (
      <div className="py-6 flex flex-col items-center text-center">
        <span className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-50 to-ocs-50 flex items-center justify-center">
          <span className="w-14 h-16 rounded-xl bg-white border-2 border-ocs-200 shadow-sm flex items-center justify-center">
            <ClipboardCheck className="w-7 h-7 text-ocs-500" />
          </span>
        </span>
        <p className="text-sm text-slate-500 mt-4 max-w-[240px]">Activity will appear here as surveys are created and submitted.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const a = describeActivity(r);
        const Icon = a.icon;
        // A facility deleted since has nothing to open; admin links need an admin.
        const canOpen = a.open && (a.open.survey ? knownSurveys.has(a.open.survey) : isAdmin);
        const go = () => {
          if (!canOpen) return;
          if (a.open.survey) onOpenSurvey(a.open.survey); else onNavigate(a.open);
        };
        return (
          <li key={r.id}>
            <button type="button" onClick={go} disabled={!canOpen}
              className="w-full flex items-start gap-3 p-2 -mx-2 rounded-lg text-left hover:bg-slate-50 disabled:hover:bg-transparent disabled:cursor-default">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${a.cls}`}><Icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 truncate">{a.title}</span>
                <span className="block text-xs text-slate-500 truncate">{a.detail}{r.changed_by_email ? ` · ${r.changed_by_email.split('@')[0]}` : ''}</span>
              </span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{timeAgo(r.changed_at, now.getTime())}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Decorative city skyline for the greeting banner, drawn inline so no image file is needed. */
function Skyline({ className }) {
  return (
    <svg viewBox="0 0 360 150" className={className} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="sky-bld" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c3cfe6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e3e9f4" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="sky-bld2" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#94a8d0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#c3cfe6" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="40" y="70" width="46" height="80" fill="url(#sky-bld)" />
      <rect x="95" y="30" width="62" height="120" fill="url(#sky-bld2)" />
      <polygon points="165,150 165,18 225,40 225,150" fill="url(#sky-bld)" />
      <rect x="232" y="55" width="50" height="95" fill="url(#sky-bld2)" />
      <rect x="290" y="85" width="40" height="65" fill="url(#sky-bld)" />
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={i} x1="98" x2="154" y1={40 + i * 11} y2={40 + i * 11} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" />
      ))}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`b${i}`} x1="168" x2="222" y1={34 + i * 11} y2={48 + i * 11} stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1" />
      ))}
    </svg>
  );
}
