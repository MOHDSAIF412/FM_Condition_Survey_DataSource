import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardList, ChevronDown, Check } from 'lucide-react';
import { DEPARTMENTS, facilityTypeOf } from '../types/survey';
import { templatesForType, suggestedTemplate } from '../utils/templates';

/** One line describing what a template holds, e.g. "14 items · HVAC · Electrical · 3 × P1". */
function summary(template) {
  if (!template) return '';
  const depts = [...new Set(template.items.map((i) => (DEPARTMENTS[i.department]?.name || i.department).split('&')[0].trim()))];
  const urgent = template.items.filter((i) => i.priority === 1).length;
  return [
    `${template.items.length} item${template.items.length === 1 ? '' : 's'}`,
    depts.slice(0, 4).join(' · ') + (depts.length > 4 ? ` +${depts.length - 4}` : ''),
    urgent ? `${urgent} × P1` : ''
  ].filter(Boolean).join(' · ');
}

function TemplateSelect({ id, options, facilityType, value, onChange, emptyLabel }) {
  const type = facilityTypeOf({ facilityType });
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
    >
      <option value="">{emptyLabel}</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}{t.facilityType && type && t.facilityType === facilityType ? ` — recommended for ${type.name}` : ''} ({t.items.length})
        </option>
      ))}
    </select>
  );
}

/**
 * Picking a template while creating a facility. The choice is only applied
 * when the surveyor presses Create Facility, so changing it costs nothing.
 *
 * When exactly one template is made for the chosen facility type it is
 * preselected -- until the surveyor picks something themselves, after which
 * their choice is left alone.
 */
export function CreateTemplatePicker({ templates = [], facilityType = '', value, onChange }) {
  const [touched, setTouched] = useState(false);
  const options = useMemo(() => templatesForType(templates, facilityType), [templates, facilityType]);

  useEffect(() => {
    if (touched) return;
    onChange(suggestedTemplate(templates, facilityType)?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityType, templates, touched]);

  // A template for another type is no longer valid once the type changes.
  useEffect(() => {
    if (value && !options.some((t) => t.id === value)) onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, value]);

  if (!options.length) return null;
  const chosen = options.find((t) => t.id === value);

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 space-y-2">
      <label htmlFor="create-template" className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <ClipboardList className="w-4 h-4 text-sky-600" /> Start from an inspection template
      </label>
      <TemplateSelect
        id="create-template"
        options={options}
        facilityType={facilityType}
        value={value}
        onChange={(v) => { setTouched(true); onChange(v); }}
        emptyLabel="No template — start with an empty snag list"
      />
      <p className="text-[11px] text-slate-600">
        {chosen
          ? <>Adds {summary(chosen)} as snags when you create the facility. Every snag stays editable, and you can delete the ones that do not apply.</>
          : 'You can also load a template later from the Survey Items tab.'}
      </p>
    </div>
  );
}

/**
 * Loading a template into a facility that already exists. Only adds snags:
 * nothing already written is changed, and defects already on the list are
 * skipped, so loading the same template twice is harmless.
 */
export function ApplyTemplatePanel({ templates = [], facilityType = '', appliedTemplateName = '', onApply }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState('');
  const options = useMemo(() => templatesForType(templates, facilityType), [templates, facilityType]);

  // Follows the facility type (the panel is mounted before a type is chosen)
  // until the surveyor picks one themselves.
  useEffect(() => {
    if (touched && options.some((t) => t.id === value)) return;
    setValue(suggestedTemplate(templates, facilityType)?.id || options[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  if (!options.length) return null;
  const chosen = options.find((t) => t.id === value);

  const apply = () => {
    if (!chosen) return;
    const res = onApply(chosen);
    if (!res) return;
    setResult(res.added
      ? `Added ${res.added} snag${res.added === 1 ? '' : 's'} from "${chosen.name}"${res.skipped ? ` — ${res.skipped} already on the list were skipped` : ''}.`
      : `Nothing added — every item in "${chosen.name}" is already on the list.`);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-ocs-600 text-white flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4" />
          </span>
          <span className="text-left min-w-0">
            <span className="block text-sm font-bold text-slate-800">Inspection Templates</span>
            <span className="block text-[11px] text-slate-500 truncate">
              {appliedTemplateName ? `Started from "${appliedTemplateName}"` : 'Load a standard checklist into this facility'}
            </span>
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-3">
          <label htmlFor="apply-template" className="sr-only">Template to load</label>
          <TemplateSelect
            id="apply-template"
            options={options}
            facilityType={facilityType}
            value={value}
            onChange={(v) => { setTouched(true); setValue(v); setResult(''); }}
            emptyLabel="Choose a template…"
          />
          {chosen && <p className="text-[11px] text-slate-600">{summary(chosen)}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={!chosen}
              onClick={apply}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Add checklist snags
            </button>
            <span className="text-[11px] text-slate-500">Existing snags are never changed.</span>
          </div>
          {result && <p role="status" className="text-xs font-semibold text-emerald-700">{result}</p>}
        </div>
      )}
    </div>
  );
}
