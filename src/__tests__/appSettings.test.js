import { describe, test, expect, vi, afterEach } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));

const { defaultSettings, normaliseSettings, describeSettingsChanges, applySettings, defaultReportFooter } = await import('../config/appSettings');
const { PRIORITY_LEVELS } = await import('../types/survey');
const { confirmReportReady } = await import('../utils/reportCompleteness');

afterEach(() => applySettings(defaultSettings()));

describe('settings', () => {
  test('the defaults are the app as it was', () => {
    applySettings(defaultSettings());
    expect(defaultReportFooter()).toBe('CONFIDENTIAL • OCS Facilities Management Condition Survey');
    expect(PRIORITY_LEVELS[1].timeframe).toBe('Immediate / within 1-3 months');
    expect(PRIORITY_LEVELS[4].timeframe).toBe('5+ years');
  });

  test('blank or missing values fall back to the defaults', () => {
    const s = normaliseSettings({ organisationName: '  ', priorityTimeframes: { 2: '' } });
    expect(s).toEqual(defaultSettings());
  });

  test('published timeframes and name take effect where the app reads them', () => {
    applySettings({ organisationName: 'Acme FM', priorityTimeframes: { 1: 'Within 48 hours' } });
    expect(PRIORITY_LEVELS[1].timeframe).toBe('Within 48 hours');
    expect(PRIORITY_LEVELS[2].timeframe).toBe('Within 1-2 years');
    expect(defaultReportFooter()).toBe('CONFIDENTIAL • Acme FM Condition Survey');
  });

  test('turning the evidence check off skips the question', () => {
    const facility = { status: 'draft', items: [] };
    const ask = vi.fn(() => false);
    expect(confirmReportReady(facility, ask)).toBe(false);
    applySettings({ reportEvidenceCheck: false });
    expect(confirmReportReady(facility, ask)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  test('changes are listed in plain words', () => {
    expect(describeSettingsChanges(defaultSettings(), { ...defaultSettings(), priorityTimeframes: { ...defaultSettings().priorityTimeframes, 1: 'Within 48 hours' }, reportEvidenceCheck: false }))
      .toEqual(['Priority 1 timeframe: "Immediate / within 1-3 months" → "Within 48 hours"', 'Evidence check before reports: off']);
  });
});
