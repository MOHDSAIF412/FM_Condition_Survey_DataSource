/**
 * Application settings (config kind 'settings'): organisation-wide values an
 * administrator can change without a new app version.
 *
 * Every default reproduces the app exactly as it was before settings existed,
 * so nothing changes until a version is published. Same draft / publish /
 * history / rollback as the forms and report layouts, and cached on the
 * device so phones use the last published settings with no signal.
 */
import { PRIORITY_LEVELS } from '../types/survey';

const BUILT_IN_TIMEFRAMES = Object.fromEntries(
  Object.values(PRIORITY_LEVELS).map((p) => [p.level, p.timeframe])
);

export function defaultSettings() {
  return {
    organisationName: 'OCS Facilities Management',
    priorityTimeframes: { ...BUILT_IN_TIMEFRAMES },
    reportEvidenceCheck: true
  };
}

const text = (v, max) => String(v ?? '').slice(0, max);

export function normaliseSettings(raw) {
  const d = defaultSettings();
  const r = raw || {};
  const timeframes = {};
  for (const level of Object.keys(d.priorityTimeframes)) {
    const v = text(r.priorityTimeframes?.[level], 60).trim();
    timeframes[level] = v || d.priorityTimeframes[level];
  }
  return {
    organisationName: text(r.organisationName, 80).trim() || d.organisationName,
    priorityTimeframes: timeframes,
    reportEvidenceCheck: typeof r.reportEvidenceCheck === 'boolean' ? r.reportEvidenceCheck : d.reportEvidenceCheck
  };
}

/** Nothing can be invalid after normalising; kept for the shared save path. */
export function validateSettings() {
  return [];
}

export function describeSettingsChanges(before, after) {
  const b = normaliseSettings(before);
  const a = normaliseSettings(after);
  const out = [];
  if (b.organisationName !== a.organisationName) out.push(`Organisation name: "${b.organisationName}" → "${a.organisationName}"`);
  for (const level of Object.keys(a.priorityTimeframes)) {
    if (b.priorityTimeframes[level] !== a.priorityTimeframes[level]) {
      out.push(`Priority ${level} timeframe: "${b.priorityTimeframes[level]}" → "${a.priorityTimeframes[level]}"`);
    }
  }
  if (b.reportEvidenceCheck !== a.reportEvidenceCheck) {
    out.push(`Evidence check before reports: ${a.reportEvidenceCheck ? 'on' : 'off'}`);
  }
  return out;
}

let current = defaultSettings();

/**
 * Makes settings take effect. Priority timeframes are read from
 * PRIORITY_LEVELS all over the app (snag cards, CapEx view, PDF), so they are
 * updated in place there rather than threading settings through every screen.
 */
export function applySettings(settings) {
  current = normaliseSettings(settings);
  for (const [level, timeframe] of Object.entries(current.priorityTimeframes)) {
    if (PRIORITY_LEVELS[level]) PRIORITY_LEVELS[level].timeframe = timeframe;
  }
  return current;
}

export const getSettings = () => current;

/** The report footer used when a layout sets none. Unchanged by default. */
export const defaultReportFooter = () => `CONFIDENTIAL • ${current.organisationName} Condition Survey`;
