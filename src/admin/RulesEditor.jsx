import React, { useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Archive, ArchiveRestore, Copy, GitBranch, FlaskConical, Power, X
} from 'lucide-react';
import { SCOPES, sectionsForScope, fieldsForSection } from '../config/formConfig';
import {
  OPERATORS, ACTIONS, evaluateRules, fieldState, valueOptions, operatorsFor, describeRule
} from '../config/rulesEngine';

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white';
const newId = () => `rule_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Conditional Rules: IF / THEN rules for the facility and snag forms.
 *
 * Rules are part of the form configuration, so they are edited in the same
 * draft as the fields and go live with the same Publish -- a rule can never
 * reach phones pointing at a field that was not published with it. The rules
 * engine (config/rulesEngine) already applies them on the web portal, in the
 * phone app and when a facility is submitted.
 *
 * Rules only show, hide, require or un-require fields. They never change or
 * clear anything a surveyor recorded.
 */
export default function RulesEditor({ config, scope, showArchived, update }) {
  const [tester, setTester] = useState(false);

  // Fields in on-screen order, for the pickers.
  const fields = useMemo(() => sectionsForScope(config, scope)
    .flatMap((s) => fieldsForSection(config, s.id).map((f) => ({ ...f, sectionLabel: s.label }))), [config, scope]);

  const all = config.rules.filter((r) => r.scope === scope);
  const shown = all.filter((r) => showArchived || !r.archived);
  const live = all.filter((r) => !r.archived);

  const change = (id, fn) => update((c) => { const r = c.rules.find((x) => x.id === id); if (r) fn(r); });

  const addRule = (from) => {
    const firstChoice = fields.find((f) => valueOptions(config, scope, f.key)) || fields[0];
    const target = fields.find((f) => !f.lockVisible) || fields[0];
    const rule = from
      ? { ...JSON.parse(JSON.stringify(from)), id: newId(), name: `${from.name || 'Rule'} (copy)`, archived: false }
      : {
        id: newId(),
        name: '',
        scope,
        enabled: true,
        archived: false,
        match: 'all',
        conditions: [{ fieldKey: firstChoice?.key || '', op: 'equals', value: '' }],
        actions: [{ type: 'require', fieldKey: target?.key || '' }]
      };
    update((c) => { c.rules.push(rule); });
  };

  // Order matters (the later rule wins), so moves are within this scope's live list.
  const move = (rule, dir) => update((c) => {
    const mine = c.rules.filter((r) => r.scope === scope && !r.archived);
    const i = mine.findIndex((r) => r.id === rule.id);
    const other = mine[i + dir];
    if (!other) return;
    const a = c.rules.findIndex((r) => r.id === rule.id);
    const b = c.rules.findIndex((r) => r.id === other.id);
    [c.rules[a], c.rules[b]] = [c.rules[b], c.rules[a]];
  });

  return (
    <div className="space-y-3">
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs text-sky-900 space-y-1">
        <p className="font-bold flex items-center gap-1.5"><GitBranch className="w-4 h-4" /> How rules work</p>
        <p>
          IF the conditions match, THEN fields are shown, hidden, made required or made optional — on the web portal and
          the phone app, as the surveyor fills in the {SCOPES[scope].label.toLowerCase()}. Required fields are checked when the facility is
          submitted, never while saving, so no one loses work with no signal.
        </p>
        <p>Rules run top to bottom; if two rules change the same field, the lower one wins. Rules never change or clear a recorded answer.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => addRule(null)} disabled={!fields.length}
          className="px-3 py-2 rounded-lg bg-ocs-600 hover:bg-ocs-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
          <Plus className="w-4 h-4" /> Add {SCOPES[scope].label.toLowerCase()} rule
        </button>
        <button type="button" onClick={() => setTester((v) => !v)} aria-pressed={tester} disabled={!live.length}
          className={`px-3 py-2 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 ${tester ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
          <FlaskConical className="w-4 h-4" /> Try the rules
        </button>
        <span className="text-xs text-slate-500 ml-auto">{live.length} rule{live.length === 1 ? '' : 's'} for the {SCOPES[scope].label.toLowerCase()} form</span>
      </div>

      <div className={tester ? 'grid gap-4 xl:grid-cols-[1fr_360px]' : ''}>
        <div className="space-y-3 min-w-0">
          {!shown.length && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No {SCOPES[scope].label.toLowerCase()} rules yet. Example: IF Priority is Priority 1 (Urgent) THEN make Photos required.
            </div>
          )}
          {shown.map((rule) => {
            const liveIdx = live.findIndex((r) => r.id === rule.id);
            return (
              <RuleCard
                key={rule.id}
                rule={rule}
                config={config}
                fields={fields}
                canUp={liveIdx > 0}
                canDown={liveIdx >= 0 && liveIdx < live.length - 1}
                onMove={(d) => move(rule, d)}
                onChange={(fn) => change(rule.id, fn)}
                onCopy={() => addRule(rule)}
              />
            );
          })}
        </div>
        {tester && <RuleTester config={config} scope={scope} fields={fields} onClose={() => setTester(false)} />}
      </div>
    </div>
  );
}

function RuleCard({ rule, config, fields, canUp, canDown, onMove, onChange, onCopy }) {
  const scope = rule.scope;
  const actionable = (type) => fields.filter((f) => (type === 'show' || type === 'hide' ? !f.lockVisible : true));
  const off = rule.archived || !rule.enabled;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm ${rule.archived ? 'border-dashed border-slate-300 opacity-70' : 'border-slate-200'}`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <GitBranch className="w-4 h-4 text-sky-600 shrink-0" />
        <input className={`${input} py-1.5 font-semibold flex-1 min-w-[160px]`} value={rule.name} maxLength={80}
          placeholder="Rule name, e.g. Urgent snags need a photo" aria-label="Rule name" disabled={rule.archived}
          onChange={(e) => onChange((r) => { r.name = e.target.value; })} />
        <div className="flex items-center gap-1">
          {!rule.archived && (
            <>
              <IconBtn label="Move rule up" disabled={!canUp} onClick={() => onMove(-1)} icon={ChevronUp} />
              <IconBtn label="Move rule down" disabled={!canDown} onClick={() => onMove(1)} icon={ChevronDown} />
              <button type="button" onClick={() => onChange((r) => { r.enabled = !r.enabled; })} aria-pressed={rule.enabled}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 border ${rule.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                <Power className="w-3.5 h-3.5" /> {rule.enabled ? 'On' : 'Off'}
              </button>
            </>
          )}
          <IconBtn label="Copy rule" onClick={onCopy} icon={Copy} />
          <IconBtn label={rule.archived ? 'Restore rule' : 'Archive rule'} onClick={() => onChange((r) => { r.archived = !r.archived; })}
            icon={rule.archived ? ArchiveRestore : Archive} />
        </div>
      </div>

      <fieldset disabled={rule.archived} className="p-4 space-y-4 min-w-0">
        <p className={`text-xs font-semibold ${off ? 'text-slate-400' : 'text-slate-600'}`}>
          {rule.archived ? 'Archived: ' : !rule.enabled ? 'Off: ' : ''}{describeRule(rule, config)}
        </p>

        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-white text-[11px] font-bold">IF</span>
            {rule.conditions.length > 1 && (
              <select className={`${input} w-auto py-1 text-xs`} aria-label="How conditions combine" value={rule.match}
                onChange={(e) => onChange((r) => { r.match = e.target.value; })}>
                <option value="all">all of these are true</option>
                <option value="any">any of these is true</option>
              </select>
            )}
          </div>
          <ul className="space-y-2">
            {rule.conditions.map((c, i) => (
              <ConditionRow key={i} condition={c} config={config} scope={scope} fields={fields}
                canRemove={rule.conditions.length > 1}
                onChange={(fn) => onChange((r) => fn(r.conditions[i]))}
                onRemove={() => onChange((r) => { r.conditions.splice(i, 1); })} />
            ))}
          </ul>
          <button type="button" onClick={() => onChange((r) => { r.conditions.push({ fieldKey: fields[0]?.key || '', op: 'equals', value: '' }); })}
            className="mt-2 text-xs font-bold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add condition
          </button>
        </div>

        <div>
          <span className="px-2 py-0.5 rounded-md bg-flame-500 text-white text-[11px] font-bold">THEN</span>
          <ul className="space-y-2 mt-2">
            {rule.actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <select className={`${input} sm:w-44`} aria-label="Action" value={a.type}
                  onChange={(e) => onChange((r) => {
                    r.actions[i].type = e.target.value;
                    // The app always shows some fields; hiding them is not offered.
                    if (!actionable(e.target.value).some((f) => f.key === r.actions[i].fieldKey)) {
                      r.actions[i].fieldKey = actionable(e.target.value)[0]?.key || '';
                    }
                  })}>
                  {Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <FieldSelect fields={actionable(a.type)} value={a.fieldKey} label="Field the action applies to"
                  onChange={(v) => onChange((r) => { r.actions[i].fieldKey = v; })} />
                <IconBtn label="Remove action" disabled={rule.actions.length <= 1} icon={Trash2}
                  onClick={() => onChange((r) => { r.actions.splice(i, 1); })} />
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => onChange((r) => { r.actions.push({ type: 'show', fieldKey: actionable('show')[0]?.key || '' }); })}
            className="mt-2 text-xs font-bold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add action
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function ConditionRow({ condition: c, config, scope, fields, canRemove, onChange, onRemove }) {
  const ops = operatorsFor(config, scope, c.fieldKey);
  const opts = valueOptions(config, scope, c.fieldKey);
  const needsValue = OPERATORS[c.op]?.needsValue;
  const multi = c.op === 'any_of';
  const selected = Array.isArray(c.value) ? c.value.map(String) : String(c.value ?? '').split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <li className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
      <FieldSelect fields={fields} value={c.fieldKey} label="Field to check"
        onChange={(v) => onChange((cond) => {
          cond.fieldKey = v;
          const allowed = operatorsFor(config, scope, v);
          if (!allowed.includes(cond.op)) cond.op = allowed[0];
          cond.value = '';
        })} />
      <select className={`${input} sm:w-44`} aria-label="Comparison" value={c.op}
        onChange={(e) => onChange((cond) => { cond.op = e.target.value; if (e.target.value === 'any_of' || c.op === 'any_of') cond.value = ''; })}>
        {ops.map((k) => <option key={k} value={k}>{OPERATORS[k].label}</option>)}
      </select>
      {needsValue && (
        opts && multi ? (
          <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 p-1.5 rounded-lg border border-slate-300 bg-white" role="group" aria-label="Values">
            {opts.map((o) => {
              const on = selected.includes(String(o.value));
              return (
                <button key={o.value} type="button" aria-pressed={on}
                  onClick={() => onChange((cond) => {
                    const next = on ? selected.filter((v) => v !== String(o.value)) : [...selected, String(o.value)];
                    cond.value = next;
                  })}
                  className={`px-2 py-1 rounded-md text-xs font-semibold border ${on ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : opts ? (
          <select className={`${input} flex-1 min-w-0`} aria-label="Value" value={String(c.value ?? '')}
            onChange={(e) => onChange((cond) => { cond.value = e.target.value; })}>
            <option value="">Choose…</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input className={`${input} flex-1 min-w-0`} aria-label="Value" value={String(c.value ?? '')} maxLength={120}
            inputMode={['greater_than', 'less_than'].includes(c.op) ? 'decimal' : undefined}
            placeholder={multi ? 'Values, separated by commas' : 'Value'}
            onChange={(e) => onChange((cond) => { cond.value = e.target.value; })} />
        )
      )}
      <IconBtn label="Remove condition" disabled={!canRemove} onClick={onRemove} icon={Trash2} />
    </li>
  );
}

function FieldSelect({ fields, value, label, onChange }) {
  const groups = [];
  for (const f of fields) {
    const g = groups.find((x) => x.label === f.sectionLabel);
    if (g) g.fields.push(f); else groups.push({ label: f.sectionLabel, fields: [f] });
  }
  const known = fields.some((f) => f.key === value);
  return (
    <select className={`${input} sm:w-56`} aria-label={label} value={known ? value : ''} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value="">{value ? 'Field no longer available' : 'Choose a field…'}</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Fill in sample answers and see which rules fire and what the surveyor would
 * get. Uses the draft, the same engine as the app, and saves nothing.
 */
function RuleTester({ config, scope, fields, onClose }) {
  const [values, setValues] = useState({});
  const rules = config.rules.filter((r) => r.scope === scope && !r.archived);
  const checked = [...new Set(rules.flatMap((r) => r.conditions.map((c) => c.fieldKey)))]
    .map((k) => fields.find((f) => f.key === k)).filter(Boolean);
  const touched = [...new Set(rules.flatMap((r) => r.actions.map((a) => a.fieldKey)))]
    .map((k) => fields.find((f) => f.key === k)).filter(Boolean);

  const testValues = { ...values };
  if (scope === 'snag') testValues.photos = values.photos === 'yes' ? [{}] : [];
  const result = evaluateRules(config.rules, scope, testValues);

  return (
    <aside className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 self-start xl:sticky xl:top-4 min-w-0" aria-label="Try the rules">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-sky-600" />
        <p className="text-sm font-bold text-slate-800 flex-1">Try the rules</p>
        <IconBtn label="Close" onClick={onClose} icon={X} />
      </div>
      <p className="text-[11px] text-slate-500">Sample answers for the fields your rules check. Uses this draft; nothing is saved.</p>
      <div className="space-y-2">
        {checked.map((f) => {
          const opts = f.key === 'photos' ? [{ value: 'yes', label: 'Has a photo' }] : valueOptions(config, scope, f.key);
          const v = values[f.key] ?? '';
          return (
            <div key={f.key}>
              <label className="block text-[11px] font-semibold text-slate-600 mb-0.5" htmlFor={`try-${f.key}`}>{f.label}</label>
              {opts ? (
                <select id={`try-${f.key}`} className={input} value={String(v)}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: f.type === 'checkbox' ? e.target.value === 'true' : e.target.value }))}>
                  <option value="">{f.key === 'photos' ? 'No photo' : '(empty)'}</option>
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={`try-${f.key}`} className={input} value={v}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: ['number', 'rating'].includes(f.type) && e.target.value !== '' ? Number(e.target.value) : e.target.value }))} />
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-200 pt-3">
        <p className="text-xs font-bold text-slate-700 mb-1.5">
          {result.fired.length ? `${result.fired.length} rule${result.fired.length === 1 ? '' : 's'} apply` : 'No rule applies'}
        </p>
        <ul className="space-y-1">
          {touched.map((f) => {
            const st = fieldState(f, result, 'web');
            return (
              <li key={f.key} className="text-xs flex items-center gap-2">
                <span className="flex-1 truncate text-slate-700">{f.label}</span>
                <span className={`px-1.5 py-0.5 rounded font-bold ${st.visible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{st.visible ? 'Shown' : 'Hidden'}</span>
                {st.visible && <span className={`px-1.5 py-0.5 rounded font-bold ${st.required ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{st.required ? 'Required' : 'Optional'}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function IconBtn({ label, onClick, icon: Icon, disabled }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent">
      <Icon className="w-4 h-4" />
    </button>
  );
}
