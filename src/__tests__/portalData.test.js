import { describe, test, expect, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));

import { dashboardStats, trendPercent, recentSurveys, configurationStatus, timeAgo, greeting } from '../portal/portalData';
import { normaliseFormsConfig } from '../config/formConfig';

const NOW = new Date('2026-09-16T12:00:00Z').getTime();
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

describe('dashboardStats', () => {
  const surveys = [
    { id: 'a', status: 'submitted', createdAt: daysAgo(5), submittedAt: daysAgo(2), itemCount: 3, photoCount: 4 },
    { id: 'b', status: 'submitted', createdAt: daysAgo(10), submittedAt: daysAgo(9), itemCount: 2, photoCount: 0 },
    { id: 'c', status: 'submitted', createdAt: daysAgo(40), submittedAt: daysAgo(35), itemCount: 1, photoCount: 1 },
    { id: 'd', status: 'draft', createdAt: daysAgo(45), itemCount: 0, photoCount: 0 },
    { id: 'e', status: 'draft', createdAt: daysAgo(1), itemCount: 5, photoCount: 2 }
  ];

  test('counts and 30-day trends come from real dates', () => {
    const s = dashboardStats(surveys, NOW);
    expect(s).toMatchObject({
      total: 5, completed: 3, drafts: 2, draftsWithSnags: 1, snags: 11, photos: 7, noPhotoFacilities: 1,
      createdLast30: 3, totalTrend: 50,          // 3 created vs 2 in the 30 days before
      completedLast30: 2, completedTrend: 100    // 2 completed vs 1
    });
    expect(s.statusBreakdown.map((x) => [x.count, x.percent])).toEqual([[3, 60], [2, 40]]);
  });

  test('no trend when there is nothing to compare with', () => {
    expect(trendPercent(4, 0)).toBeNull();
    expect(dashboardStats([], NOW)).toMatchObject({ total: 0, totalTrend: null, completedTrend: null });
    expect(dashboardStats([], NOW).statusBreakdown.map((x) => x.percent)).toEqual([0, 0]);
  });
});

test('recent surveys: newest activity first', () => {
  const list = [
    { id: 'old', updatedAt: daysAgo(9) },
    { id: 'sub', submittedAt: daysAgo(1), updatedAt: daysAgo(3) },
    { id: 'new', updatedAt: daysAgo(0.5) }
  ];
  expect(recentSurveys(list, 2).map((s) => s.id)).toEqual(['new', 'sub']);
});

test('configuration status counts active items only', () => {
  const config = normaliseFormsConfig({
    sections: [{ id: 's1', scope: 'snag', label: 'Extra' }, { id: 's2', scope: 'snag', label: 'Old', archived: true }],
    fields: [
      { id: 'f1', key: 'crit', scope: 'snag', sectionId: 's1', label: 'Crit', type: 'dropdown', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', archived: true }] },
      { id: 'f2', key: 'gone', scope: 'snag', sectionId: 's1', label: 'Gone', type: 'text', archived: true }
    ],
    rules: [{ scope: 'snag', conditions: [], actions: [] }, { scope: 'snag', archived: true }]
  });
  const s = configurationStatus(config, [{ archived: false }, { archived: true }]);
  expect(s).toMatchObject({ forms: 2, customSections: 1, customFields: 1, options: 1, rules: 1, templates: 1 });
});

test('time ago and greeting', () => {
  expect(timeAgo(new Date(NOW - 30 * 1000).toISOString(), NOW)).toBe('just now');
  expect(timeAgo(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW)).toBe('5 minutes ago');
  expect(timeAgo(new Date(NOW - 2 * 3600 * 1000).toISOString(), NOW)).toBe('2 hours ago');
  expect(timeAgo(new Date(NOW - 1 * 86400 * 1000).toISOString(), NOW)).toBe('1 day ago');
  expect(timeAgo(new Date(NOW - 20 * 86400 * 1000).toISOString(), NOW)).toBe('2 weeks ago');
  expect(greeting(new Date(2026, 8, 16, 9))).toBe('Good morning');
  expect(greeting(new Date(2026, 8, 16, 14))).toBe('Good afternoon');
  expect(greeting(new Date(2026, 8, 16, 20))).toBe('Good evening');
});

test('daily series buckets real dates and ignores anything outside the window', async () => {
  const { dailySeries } = await import('../portal/portalData');
  const list = [{ d: daysAgo(1) }, { d: daysAgo(1.5) }, { d: daysAgo(29) }, { d: daysAgo(45) }, { d: null }];
  const series = dailySeries(list, (s) => s.d, { days: 30, buckets: 15, now: NOW });
  expect(series).toHaveLength(15);
  expect(series[14]).toBe(2);
  expect(series[0]).toBe(1);
  expect(series.reduce((a, b) => a + b, 0)).toBe(3);
});
