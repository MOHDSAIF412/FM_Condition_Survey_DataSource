import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { uploadShape, sameUserContent, isOwnUpload, stableStringify } from '../utils/syncHeal';

// A tiny stand-in for the database: one facility row with a revision.
const db = vi.hoisted(() => ({ revision: 3, rpc: null, upload: null }));
vi.mock('../utils/supabaseClient', () => ({ isCloudConfigured: true, PHOTO_BUCKET: 'survey-photos', supabase: {
  rpc: (...args) => db.rpc(...args),
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [{ revision: db.revision }], error: null }) }) }) }),
  storage: { from: () => ({ upload: (...args) => db.upload(...args) }) }
} }));
const { pushSurvey, pushSurveySafely } = await import('../utils/cloudSync');

const store = new Map();
beforeEach(() => {
  db.revision = 3;
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  });
  db.upload = vi.fn(async () => ({ error: null }));
  // The commit applies, then the server moves on a revision.
  db.rpc = vi.fn(async (_name, { p_expected_revision }) => {
    if (p_expected_revision !== db.revision) return { data: { conflict: true, serverRevision: db.revision }, error: null };
    db.revision += 1;
    return { data: { pushed: true, cloudRevision: db.revision, facilityNumber: 7 }, error: null };
  });
});
afterEach(() => vi.unstubAllGlobals());

const photo = { id: 'p1', dataUrl: 'data:image/jpeg;base64,YQ==', caption: 'Leak' };
function deviceCopy() {
  return {
    id: 'fac-1', cloudRevision: 3, title: 'Facility Condition Assessment', status: 'draft',
    facility: { facilityName: 'Adec', gps: { lat: 24.4, lng: 54.4 } }, signatures: {}, generalNotes: '',
    items: [{ id: 'i1', assetName: 'AHU', department: 'HVAC', location: 'Roof', priority: 2,
      defectDescription: 'Water leak', estimatedCost: '1500', quantity: 1, unit: 'Unit', photos: [photo] }]
  };
}
/** What fetchServerContent returns for the facility as the server now holds it. */
function serverCopyOf(survey, changes = {}) {
  return {
    id: survey.id, cloudRevision: db.revision, title: survey.title, status: survey.status, submittedAt: null,
    // jsonb hands keys back in its own order.
    facility: { gps: { lng: 54.4, lat: 24.4 }, facilityName: survey.facility.facilityName, facilityNumber: 7, facilityCode: 'FAC-007' },
    signatures: {}, generalNotes: '',
    items: survey.items.map((it) => ({ ...it, estimatedCost: Number(it.estimatedCost),
      photos: it.photos.map((p) => ({ id: p.id, caption: p.caption, name: '', storagePath: `fac-1/${it.id}/${p.id}.jpg` })) })),
    ...changes
  };
}

test('reproduces the stuck state: an upload whose receipt is lost is refused forever', async () => {
  const device = deviceCopy();
  // The commit lands (3 -> 4) but the app reloads before writing down revision 4.
  expect((await pushSurvey(device)).pushed).toBe(true);
  expect(db.revision).toBe(4);
  // Every later attempt from the unchanged device copy is called a conflict.
  for (let i = 0; i < 3; i++) expect(await pushSurvey(device)).toMatchObject({ conflict: true, reason: 'stale' });
});

test('the safe push recognises its own earlier upload and continues from the newer revision', async () => {
  const device = deviceCopy();
  await pushSurvey(device);                       // receipt lost
  const server = serverCopyOf(device);
  const result = await pushSurveySafely(device, { fetchServer: async () => server });
  expect(result).toMatchObject({ pushed: true, cloudRevision: 5, healedFromRevision: 3 });
  expect(db.rpc.mock.calls.at(-1)[1].p_expected_revision).toBe(4);
});

test('edits made after the lost upload still go up, using the note written before that commit', async () => {
  const device = deviceCopy();
  await pushSurvey(device);                       // receipt lost; the note survives the reload
  const server = serverCopyOf(device);
  const later = { ...device, items: [...device.items, { id: 'i2', location: 'Lobby', defectDescription: 'Cracked tile', photos: [] }] };
  const result = await pushSurveySafely(later, { fetchServer: async () => server });
  expect(result.pushed).toBe(true);
  expect(db.rpc.mock.calls.at(-1)[1].p_items.map((r) => r.id)).toEqual(['i1', 'i2']);
});

test('a snag added on another device is still a conflict and nothing is uploaded', async () => {
  const device = deviceCopy();
  db.revision = 4;                                  // someone else committed
  const server = serverCopyOf(device, {});
  server.items = [...server.items, { id: 'other', location: 'Gate', defectDescription: 'Rust', photos: [] }];
  const calls = db.rpc.mock.calls.length;
  expect(await pushSurveySafely(device, { fetchServer: async () => server })).toMatchObject({ conflict: true });
  expect(db.rpc.mock.calls.length).toBe(calls);
  expect(db.upload).not.toHaveBeenCalled();
});

test('a snag edited on another device is still a conflict', async () => {
  const device = deviceCopy();
  db.revision = 4;
  const server = serverCopyOf(device);
  server.items[0] = { ...server.items[0], estimatedCost: 9000 };
  expect(await pushSurveySafely(device, { fetchServer: async () => server })).toMatchObject({ conflict: true });
});

test('an unrelated attempt note does not excuse another device\'s change', async () => {
  const device = deviceCopy();
  await pushSurvey(device);                         // note for revision 3 content
  const server = serverCopyOf(device);
  server.generalNotes = 'Changed on the laptop';
  const later = { ...device, generalNotes: 'Phone notes' };
  expect(await pushSurveySafely(later, { fetchServer: async () => server })).toMatchObject({ conflict: true });
});

test('a server read failure leaves the conflict in place', async () => {
  const device = deviceCopy();
  db.revision = 4;
  const result = await pushSurveySafely(device, { fetchServer: async () => { throw new Error('offline'); } });
  expect(result).toMatchObject({ conflict: true });
});

test('photos: one this device never uploaded may be missing on the server; one it uploaded may not', () => {
  const device = uploadShape(deviceCopy());
  const server = uploadShape(serverCopyOf(deviceCopy()));
  server.items[0].photos = [];
  expect(sameUserContent(device, server)).toBe(true);          // p1 has no storage path yet
  device.items[0].photos[0].onServer = true;
  expect(sameUserContent(device, server)).toBe(false);         // removed elsewhere
  const extra = uploadShape(serverCopyOf(deviceCopy()));
  extra.items[0].photos.push({ id: 'p9', caption: '', name: '', onServer: true });
  expect(sameUserContent(uploadShape(deviceCopy()), extra)).toBe(false); // added elsewhere
});

test('an up-to-date device is never treated as healed', () => {
  const device = { ...deviceCopy(), cloudRevision: 4 };
  expect(isOwnUpload(device, serverCopyOf(device), null)).toBe(false);
});

test('stable JSON ignores key order and undefined', () => {
  expect(stableStringify({ b: 1, a: { d: 2, c: undefined } })).toBe(stableStringify({ a: { d: 2 }, b: 1 }));
});
