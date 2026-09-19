import React, { useState } from 'react';
import { Loader2, Building2, Clock, ShieldCheck, RotateCcw } from 'lucide-react';
import { useConfigDraft } from './useConfigDraft';
import { Banner, DraftHeader, PublishDialog, HistoryDialog } from './ConfigDialogs';
import { defaultSettings, normaliseSettings, describeSettingsChanges } from '../config/appSettings';
import { PRIORITY_LEVELS } from '../types/survey';

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white';
// The wording each priority starts with, for "reset to default" -- PRIORITY_LEVELS
// itself follows the published settings.
const BUILT_IN = defaultSettings();

/**
 * Settings: organisation-wide values. Every default is the app as it was, so
 * nothing changes until a version is published.
 */
export default function SettingsPage({ onPublished }) {
  const d = useConfigDraft('settings', {
    defaults: defaultSettings, normalise: normaliseSettings, describe: describeSettingsChanges, onPublished
  });
  const [showPublish, setShowPublish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  if (d.loading) {
    return <div className="p-10 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin inline" /> Loading settings…</div>;
  }
  if (!d.working) return <Banner kind="error">{d.error || 'Could not load the settings.'}</Banner>;
  const s = d.working;

  return (
    <div className="space-y-4 pb-24 max-w-4xl">
      <DraftHeader title="Settings" liveLabel="built-in settings" d={d}
        onHistory={() => setShowHistory(true)} onPublishClick={() => setShowPublish(true)} />

      {d.notice && <Banner kind="ok">{d.notice}</Banner>}
      {d.error && <Banner kind="error">{d.error}</Banner>}

      <Card icon={Building2} title="Organisation" sub="Printed on reports.">
        <label htmlFor="set-org" className="block text-xs font-semibold text-slate-700 mb-1">Organisation name</label>
        <input id="set-org" className={input} value={s.organisationName} maxLength={80}
          onChange={(e) => d.update((c) => { c.organisationName = e.target.value; })} />
        <p className="text-[11px] text-slate-500 mt-1">
          Report footer, when a layout sets none: “CONFIDENTIAL • {s.organisationName.trim() || BUILT_IN.organisationName} Condition Survey”
        </p>
      </Card>

      <Card icon={Clock} title="Priority target timeframes"
        sub="Shown on each snag, on the Score & CapEx tab and in the PDF's priority schedule. Priority numbers stay 1–4.">
        <div className="space-y-2">
          {Object.values(PRIORITY_LEVELS).map((p) => {
            const value = s.priorityTimeframes[p.level] ?? '';
            const isDefault = value === BUILT_IN.priorityTimeframes[p.level];
            return (
              <div key={p.level} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <label htmlFor={`set-p${p.level}`} className="text-sm font-semibold text-slate-700 sm:w-48 shrink-0">{p.label}</label>
                <input id={`set-p${p.level}`} className={`${input} flex-1 min-w-0`} value={value} maxLength={60}
                  onChange={(e) => d.update((c) => { c.priorityTimeframes[p.level] = e.target.value; })} />
                <button type="button" disabled={isDefault} title="Back to the built-in wording" aria-label={`Reset ${p.label} timeframe`}
                  onClick={() => d.update((c) => { c.priorityTimeframes[p.level] = BUILT_IN.priorityTimeframes[p.level]; })}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">A blank timeframe goes back to the built-in wording when saved.</p>
      </Card>

      <Card icon={ShieldCheck} title="Report checks">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-ocs-600" checked={s.reportEvidenceCheck}
            onChange={(e) => d.update((c) => { c.reportEvidenceCheck = e.target.checked; })} />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Warn before a report goes out with gaps</span>
            <span className="block text-[11px] text-slate-500">
              Before generating a PDF or Excel report, list urgent snags with no photo, missing descriptions, photos that could
              not be loaded and facilities still in draft, and ask whether to go ahead.
            </span>
          </span>
        </label>
      </Card>

      {showPublish && (
        <PublishDialog
          title={`Publish settings, version ${d.nextVersion}`}
          subtitle="Takes effect on the web portal straight away, and on phones the next time they are online. Survey data is not changed."
          changes={d.changes}
          busy={d.busy === 'publish'}
          onCancel={() => setShowPublish(false)}
          onPublish={async (notes) => { if (await d.publish(notes)) setShowPublish(false); }}
        />
      )}
      {showHistory && (
        <HistoryDialog
          title="Settings history"
          versions={d.versions}
          describe={describeSettingsChanges}
          defaults={defaultSettings}
          emptyText="Nothing published yet. The app uses its built-in settings."
          busy={d.busy === 'rollback'}
          onRollback={async (v) => { if (await d.rollback(v)) setShowHistory(false); }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function Card({ icon: Icon, title, sub, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 min-w-0">
      <div className="flex items-start gap-2 mb-3">
        <Icon className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
