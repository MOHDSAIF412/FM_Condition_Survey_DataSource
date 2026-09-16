import React, { useMemo } from 'react';
import { Star, LayoutList } from 'lucide-react';
import { useFormsConfig } from '../config/FormsConfigContext';
import { sectionsForScope, fieldsForSection, activeOptions, systemField, valuesForScope } from '../config/formConfig';
import { evaluateRules, fieldState } from '../config/rulesEngine';

/**
 * Fields an administrator added in the Admin Dashboard, drawn from the
 * published configuration.
 *
 * Values are stored under `facility.custom` or `item.customValues`, keyed by
 * the field's key. Hiding, archiving or a rule never clears a stored value --
 * it only stops the field being shown.
 */

const VARIANTS = {
  facility: {
    label: 'block text-xs font-semibold text-slate-700 mb-1',
    input: 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white'
  },
  snag: {
    label: 'block text-[12px] font-bold uppercase text-slate-600 mb-1',
    input: 'w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white'
  }
};

/** Rule results for one facility or snag, recomputed only when its values change. */
function useRuleState(scope, record) {
  const { config, platform } = useFormsConfig();
  const values = valuesForScope(scope, record);
  const key = JSON.stringify(values);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ruleResult = useMemo(() => evaluateRules(config.rules, scope, values), [config, scope, key]);
  return { config, platform, ruleResult };
}

/**
 * How a built-in field should appear: its configured name, and whether it is
 * shown. Screens that draw built-in fields themselves call this.
 */
export function useSystemFields(scope, record) {
  const { config, platform, ruleResult } = useRuleState(scope, record);
  return useMemo(() => {
    const get = (key, fallbackLabel) => {
      const f = systemField(config, scope, key);
      if (!f) return { label: fallbackLabel, visible: true, required: false };
      const { visible, required } = fieldState(f, ruleResult, platform);
      return { label: f.label || fallbackLabel, visible, required };
    };
    const sectionLabel = (id, fallback) => config.sections.find((s) => s.id === id)?.label || fallback;
    const hasVisibleCustom = (sectionId) => fieldsForSection(config, sectionId)
      .some((f) => !f.system && fieldState(f, ruleResult, platform).visible);
    return { get, sectionLabel, hasVisibleCustom };
  }, [config, platform, ruleResult, scope]);
}

function FieldInput({ field, value, onChange, id, cls, required }) {
  const common = { id, 'aria-required': required || undefined, className: cls.input };
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={2} placeholder={field.placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return (
        <input {...common} type="number" inputMode="decimal" placeholder={field.placeholder} value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      );
    case 'date':
      return <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'dropdown': {
      const opts = activeOptions(field);
      // A value whose option was archived later still shows, so nothing silently changes.
      const archived = value && !opts.some((o) => o.value === value)
        ? (field.options || []).find((o) => o.value === value) || { value, label: String(value) }
        : null;
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {opts.map((o) => <option key={o.id} value={o.value}>{o.label}</option>)}
          {archived && <option value={archived.value}>{archived.label} (no longer offered)</option>}
        </select>
      );
    }
    case 'multiselect': {
      const selected = Array.isArray(value) ? value : [];
      const opts = activeOptions(field);
      const extra = selected.filter((v) => !opts.some((o) => o.value === v))
        .map((v) => ({ id: `old_${v}`, value: v, label: `${(field.options || []).find((o) => o.value === v)?.label || v} (no longer offered)` }));
      return (
        <div id={id} role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {[...opts, ...extra].map((o) => {
            const on = selected.includes(o.value);
            return (
              <button key={o.id} type="button" aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input id={id} type="checkbox" className="w-4 h-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.placeholder || 'Yes'}
        </label>
      );
    case 'yesno':
      return (
        <div id={id} role="radiogroup" aria-label={field.label} className="inline-flex rounded-xl border border-slate-300 overflow-hidden">
          {[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={value === v}
              onClick={() => onChange(value === v ? '' : v)}
              className={`px-4 py-2 text-sm font-bold ${value === v ? (v === 'yes' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
      );
    case 'rating':
      return (
        <div id={id} role="radiogroup" aria-label={field.label} className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`}
              onClick={() => onChange(value === n ? '' : n)} className="p-1">
              <Star className={`w-6 h-6 ${Number(value) >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
      );
    default:
      return <input {...common} type="text" placeholder={field.placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Custom fields of one section, in their configured order. */
export function CustomFieldList({ scope, sectionId, record, onChangeValue, idPrefix, variant = scope, className = '' }) {
  const { config, platform, ruleResult } = useRuleState(scope, record);
  const cls = VARIANTS[variant] || VARIANTS.facility;
  const stored = (scope === 'facility' ? record?.custom : record?.customValues) || {};

  const fields = fieldsForSection(config, sectionId)
    .filter((f) => !f.system)
    .map((f) => ({ field: f, ...fieldState(f, ruleResult, platform) }))
    .filter((x) => x.visible);

  if (!fields.length) return null;

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      {fields.map(({ field, required }) => {
        const id = `${idPrefix}-${field.key}`;
        const wide = field.type === 'textarea' || field.type === 'multiselect';
        const groupLike = ['multiselect', 'yesno', 'rating', 'checkbox'].includes(field.type);
        return (
          <div key={field.id} className={wide ? 'sm:col-span-2' : ''}>
            {groupLike
              ? <span className={cls.label}>{field.label}{required && <span className="text-rose-600"> *</span>}</span>
              : <label htmlFor={id} className={cls.label}>{field.label}{required && <span className="text-rose-600"> *</span>}</label>}
            <FieldInput field={field} value={stored[field.key]} onChange={(v) => onChangeValue(field.key, v)}
              id={id} cls={cls} required={required} />
            {field.helpText && <p className="text-[11px] text-slate-500 mt-1">{field.helpText}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Sections an administrator added (not the built-in ones), each as its own block. */
export function CustomSections({ scope, record, onChangeValue, idPrefix, variant = scope, renderSection }) {
  const { config, platform, ruleResult } = useRuleState(scope, record);
  // Only sections with at least one field showing, so no empty card appears.
  const sections = sectionsForScope(config, scope)
    .filter((s) => !s.system)
    .filter((s) => fieldsForSection(config, s.id).some((f) => !f.system && fieldState(f, ruleResult, platform).visible));
  if (!sections.length) return null;
  return sections.map((section) => {
    const body = (
      <CustomFieldList scope={scope} sectionId={section.id} record={record}
        onChangeValue={onChangeValue} idPrefix={`${idPrefix}-${section.id}`} variant={variant} />
    );
    return <React.Fragment key={section.id}>{renderSection(section, body)}</React.Fragment>;
  });
}

/** Default wrapper for a custom section on the facility screen. */
export function FacilitySectionCard({ section, children }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <LayoutList className="w-4 h-4 text-sky-600" />
        {section.label}
      </h3>
      {children}
    </div>
  );
}
