import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { dataUrlToBlob } from '../utils/dataUrl';
import { contentSecurityPolicy } from '../../scripts/securityHeaders';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), limit: vi.fn(), upload: vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({ isCloudConfigured: true, PHOTO_BUCKET: 'survey-photos', supabase: {
  rpc: mock.rpc,
  from: () => ({ select: () => ({ eq: () => ({ limit: mock.limit }) }) }),
  storage: { from: () => ({ upload: mock.upload }) }
} }));
const { pushSurvey } = await import('../utils/cloudSync');
const { latestSyncProblem } = await import('../utils/diagnostics');

// What the deployed Content Security Policy does to fetch('data:...').
const cspFetch = vi.fn(async (url) => {
  if (String(url).startsWith('data:')) throw new TypeError('Failed to fetch');
  throw new Error(`unexpected fetch ${url}`);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', cspFetch);
  mock.limit.mockResolvedValue({ data: [{ revision: 3 }], error: null });
  mock.rpc.mockResolvedValue({ data: { pushed: true, cloudRevision: 4 }, error: null });
  mock.upload.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

test('decodes base64 and percent-encoded data URLs without fetch', async () => {
  const jpeg = dataUrlToBlob('data:image/jpeg;base64,/9j/4A==');
  expect(jpeg.type).toBe('image/jpeg');
  expect([...new Uint8Array(await jpeg.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  const svg = dataUrlToBlob("data:image/svg+xml;utf8,%3Csvg%20xmlns='x'%2F%3E");
  expect(svg.type).toBe('image/svg+xml');
  expect(await svg.text()).toBe("<svg xmlns='x'/>");
  expect(cspFetch).not.toHaveBeenCalled();
  expect(() => dataUrlToBlob('https://example.com/a.jpg')).toThrow();
});

test('photos upload while the security policy refuses fetch of data: URLs', async () => {
  const survey = { id: 's1', cloudRevision: 3, facility: { facilityName: 'Block A' },
    items: [{ id: 'i1', photos: [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,/9j/4A==' }] }] };
  const result = await pushSurvey(survey);
  expect(result).toMatchObject({ pushed: true, failedPhotoIds: [], syncedPhotoIds: ['p1'] });
  expect(mock.upload).toHaveBeenCalledTimes(1);
  expect(mock.upload.mock.calls[0][1].type).toBe('image/jpeg');
});

test('a refused photo is remembered so the warning can name it', async () => {
  mock.upload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
  const survey = { id: 's2', cloudRevision: 3, facility: { facilityName: 'Block B' },
    items: [{ id: 'i1', photos: [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,/9j/4A==' }] }] };
  expect(await pushSurvey(survey)).toMatchObject({ failedPhotoIds: ['p1'] });
  expect(latestSyncProblem().message).toBe('Photo upload: new row violates row-level security policy');
});

// The policy keeps data: out of connect-src, so no app code may fetch one.
test('no source file fetches a data URL', () => {
  expect(contentSecurityPolicy).not.toMatch(/connect-src[^;]*\bdata:/);
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== '__tests__') walk(path); }
    else if (/\.(js|jsx)$/.test(name)) files.push(path);
  });
  walk(join(__dirname, '..'));
  const offenders = files.filter((f) => /fetch\(\s*(`data:|dataUrl\b|['"]data:)/.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});
