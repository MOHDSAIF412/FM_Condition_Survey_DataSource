import { describe, test, expect, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));
const saved = [];
vi.mock('../utils/fileSaver.js', () => ({ saveBlob: async (blob) => { saved.push(blob); } }));

const { describeSnags, cacheKey, BATCH_SIZE } = await import('../utils/aiDescriptions');
const { cleanSnags, parseDescriptions, default: handler } = await import('../../api/describe.js');
const { generateSurveyExcel } = await import('../utils/excelGenerator');
const { standardLayout } = await import('../config/reportLayouts');
const ExcelJS = (await import('exceljs')).default;

const memoryStore = () => {
  const m = new Map();
  return { get: (k) => m.get(k) || null, set: (k, v) => m.set(k, v), size: () => m.size };
};
const snag = (id, notes = 'crack in wal near door') => ({ id, assetName: 'Wall', location: 'Lobby', department: 'CIVIL', defectDescription: notes, photos: [] });
const answering = (calls) => async (body) => {
  calls.push(body);
  return { status: 200, data: { descriptions: Object.fromEntries(body.snags.map((s) => [s.id, `Fixed: ${s.notes}`])) } };
};

describe('describeSnags (in the app)', () => {
  test('batches snags and returns one description per snag', async () => {
    const calls = [];
    const items = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => snag(`s${i}`));
    const out = await describeSnags(items, { transport: answering(calls), store: memoryStore(), online: true });
    expect(calls.map((c) => c.snags.length)).toEqual([BATCH_SIZE, 1]);
    expect(out.get('s0')).toBe('Fixed: crack in wal near door');
    expect(out.size).toBe(BATCH_SIZE + 1);
  });

  test('a second report reuses the cached text and sends nothing', async () => {
    const store = memoryStore();
    await describeSnags([snag('a')], { transport: answering([]), store, online: true });
    const calls = [];
    const out = await describeSnags([snag('a')], { transport: answering(calls), store, online: true });
    expect(calls).toHaveLength(0);
    expect(out.get('a')).toBe('Fixed: crack in wal near door');
  });

  test('editing the notes writes a fresh description', () => {
    expect(cacheKey(snag('a', 'one'))).not.toBe(cacheKey(snag('a', 'two')));
  });

  test('offline: no request, cached text only', async () => {
    const calls = [];
    const out = await describeSnags([snag('a')], { transport: answering(calls), store: memoryStore(), online: false });
    expect(calls).toHaveLength(0);
    expect(out.size).toBe(0);
  });

  test('free limit reached: stops after the first refusal and never throws', async () => {
    let n = 0;
    const transport = async () => { n++; return { status: 429, data: { error: 'free_limit_reached' } }; };
    const items = Array.from({ length: BATCH_SIZE * 3 }, (_, i) => snag(`s${i}`));
    const out = await describeSnags(items, { transport, store: memoryStore(), online: true });
    expect(n).toBe(1);
    expect(out.size).toBe(0);
  });

  test('a network error leaves the column blank instead of failing the report', async () => {
    const out = await describeSnags([snag('a')], { transport: async () => { throw new Error('offline'); }, store: memoryStore(), online: true });
    expect(out.size).toBe(0);
  });
});

describe('Excel report', () => {
  const survey = {
    id: 's1', facility: { facilityName: 'Stable Block A' }, signatures: {},
    items: [{ ...snag('i1', 'rusty roof sheet leaking'), estimatedCost: 100, quantity: 1, priority: 2 }]
  };
  const register = async (describe) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await generateSurveyExcel(survey, 'ALL', { layout: standardLayout(), describeSnags: describe }));
    return wb.getWorksheet('Snag Register');
  };

  test('AI Description sits beside the surveyor\'s own text, which is unchanged', async () => {
    const ws = await register(async () => new Map([['i1', 'Corroded roof sheet with active water ingress.']]));
    const header = ws.getRow(3).values.filter(Boolean);
    const at = header.indexOf('Observed Defects & Notes');
    expect(header[at + 1]).toBe('AI Description');
    const row = ws.getRow(5);
    expect(row.getCell(at + 1).value).toBe('rusty roof sheet leaking');
    expect(row.getCell(at + 2).value).toBe('Corroded roof sheet with active water ingress.');
  });

  test('when AI is unavailable the report still builds, with the column blank', async () => {
    const ws = await register(async () => { throw new Error('down'); });
    const header = ws.getRow(3).values.filter(Boolean);
    expect(ws.getRow(5).getCell(header.indexOf('AI Description') + 1).text).toBe('');
  });
});

describe('api/describe (the server)', () => {
  const res = () => {
    const r = { code: 0, body: null, headers: {} };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    return r;
  };

  test('refuses oversized or malformed requests', () => {
    expect(cleanSnags({ snags: [] })).toBeNull();
    expect(cleanSnags({ snags: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}` })) })).toBeNull();
    const [s] = cleanSnags({ snags: [{ id: 'a', photos: ['https://evil.example/x.jpg', 'data:image/jpeg;base64,AAAA'] }] });
    expect(s.photos).toEqual(['data:image/jpeg;base64,AAAA']);
  });

  test('reads the model\'s JSON even inside a code fence, ignoring unknown ids', () => {
    const reply = '```json\n{"descriptions":[{"id":"a","text":" Cracked  wall. "},{"id":"zzz","text":"x"}]}\n```';
    expect(parseDescriptions(reply, ['a'])).toEqual({ a: 'Cracked wall.' });
    expect(parseDescriptions('not json', ['a'])).toEqual({});
  });

  test('without a key it says so and calls nothing', async () => {
    delete process.env.AI_API_KEY;
    const r = res();
    await handler({ method: 'POST', headers: {}, body: {} }, r);
    expect(r.code).toBe(503);
  });

  test('signed-out callers cannot spend the quota', async () => {
    process.env.AI_API_KEY = 'k';
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    const r = res();
    await handler({ method: 'POST', headers: { authorization: 'Bearer bad' }, body: { snags: [{ id: 'a' }] } }, r);
    expect(r.code).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);   // only the sign-in check, never the model
    fetchMock.mockRestore();
  });

  test('signed in: sends notes and photos to the model and returns its text', async () => {
    process.env.AI_API_KEY = 'k';
    const sent = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      sent.push({ url, init });
      if (String(url).includes('/auth/v1/user')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"descriptions":[{"id":"a","text":"Crack in the wall near the door."}]}' } }] }), { status: 200 });
    });
    const r = res();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { snags: [{ id: 'a', notes: 'crack in wal', photos: ['data:image/jpeg;base64,AAAA'] }] } }, r);
    expect(r.code).toBe(200);
    expect(r.body.descriptions).toEqual({ a: 'Crack in the wall near the door.' });
    const model = JSON.parse(sent[1].init.body);
    expect(sent[1].init.headers.Authorization).toBe('Bearer k');
    expect(JSON.stringify(model.messages[1].content)).toContain('crack in wal');
    expect(model.messages[1].content.some((p) => p.type === 'image_url')).toBe(true);
    fetchMock.mockRestore();
  });

  test('the model\'s free limit comes back as 429 so the app stops asking', async () => {
    process.env.AI_API_KEY = 'k';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      new Response('{}', { status: String(url).includes('/auth/v1/user') ? 200 : 429 }));
    const r = res();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { snags: [{ id: 'a' }] } }, r);
    expect(r.code).toBe(429);
    fetchMock.mockRestore();
  });
});
