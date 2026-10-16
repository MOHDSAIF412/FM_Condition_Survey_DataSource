/**
 * AI snag descriptions for the Excel report's "AI Description" column.
 *
 * The app sends a few snags at a time -- the surveyor's own notes plus one or
 * two small photos each -- and gets back one short, grammatical,
 * facility-management description per snag. The surveyor's original text is
 * never replaced; the report shows both side by side.
 *
 * Why a server function: the model's API key must never ship inside the web
 * bundle or the APK, where anyone could pull it out. It lives only in Vercel's
 * environment variables, and this endpoint only answers signed-in users so a
 * stranger cannot spend the free quota.
 *
 * Free by default: any OpenAI-compatible endpoint works, and the defaults
 * point at Google Gemini's free tier. Configure in Vercel:
 *   AI_API_KEY   (required)  -- e.g. a Google AI Studio key
 *   AI_BASE_URL  (optional)  -- default Gemini's OpenAI-compatible endpoint
 *   AI_MODEL     (optional)  -- default gemini-2.5-flash-lite
 * With no key set the endpoint answers 503 and reports simply leave the
 * column blank.
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
// Flash-Lite: vision-capable, no "thinking" step so it answers in a few
// seconds, and the largest free daily allowance of the Gemini models.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

export const LIMITS = { snags: 6, photosPerSnag: 2, photoChars: 400_000, textChars: 1500 };

const SYSTEM_PROMPT = [
  'You write snag descriptions for a facilities-management building condition survey report.',
  'For each snag you get the surveyor\'s own notes (which may have spelling or grammar mistakes, or be in another language), its name, location and trade, and up to two photos.',
  'Write one clear, professional description in English for each snag: what the defect is, where it is, and its visible extent or condition.',
  'Rules:',
  '- Keep every fact the surveyor wrote, with spelling and grammar corrected.',
  '- Add only what the photos clearly show. Never guess causes, quantities, measurements, costs or brands that are not visible or written.',
  '- If a photo is unclear or does not show the defect, rely on the notes and do not describe the photo.',
  '- One to three sentences, plain facility-management wording, no headings, no bullet points, no recommendations unless the notes give one.',
  'Reply with JSON only, in exactly this shape: {"descriptions":[{"id":"<snag id>","text":"<description>"}]}'
].join('\n');

const clip = (v, n) => String(v ?? '').slice(0, n).trim();

/** Validates and trims the request so one call cannot grow without bound. */
export function cleanSnags(body) {
  const list = Array.isArray(body?.snags) ? body.snags : null;
  if (!list || !list.length || list.length > LIMITS.snags) return null;
  const out = [];
  for (const s of list) {
    const id = clip(s?.id, 120);
    if (!id) return null;
    const photos = (Array.isArray(s.photos) ? s.photos : [])
      .filter((p) => typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) && p.length <= LIMITS.photoChars)
      .slice(0, LIMITS.photosPerSnag);
    out.push({
      id,
      name: clip(s.name, 200),
      location: clip(s.location, 200),
      trade: clip(s.trade, 100),
      notes: clip(s.notes, LIMITS.textChars),
      photos
    });
  }
  return out;
}

function userContent(snags) {
  const parts = [{ type: 'text', text: `There are ${snags.length} snag(s). Return one description for each id.` }];
  for (const s of snags) {
    parts.push({
      type: 'text',
      text: [
        `Snag id: ${s.id}`,
        `Name: ${s.name || '(none)'}`,
        `Location: ${s.location || '(none)'}`,
        `Trade: ${s.trade || '(none)'}`,
        `Surveyor notes: ${s.notes || '(none written)'}`,
        `Photos attached below: ${s.photos.length}`
      ].join('\n')
    });
    for (const url of s.photos) parts.push({ type: 'image_url', image_url: { url } });
  }
  return parts;
}

/** Pulls {id: text} out of the model's reply, tolerating code fences. */
export function parseDescriptions(content, ids) {
  const raw = String(content || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let data;
  try { data = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try { data = JSON.parse(m[0]); } catch { return {}; }
  }
  const wanted = new Set(ids);
  const out = {};
  for (const d of Array.isArray(data?.descriptions) ? data.descriptions : []) {
    const id = String(d?.id ?? '');
    const text = clip(d?.text, 1200).replace(/\s+/g, ' ');
    if (wanted.has(id) && text) out[id] = text;
  }
  return out;
}

async function signedIn(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = String(req.headers?.authorization || '');
  if (!url || !key || !/^Bearer [\w.-]+$/.test(auth)) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: auth } });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // Opening the endpoint in a browser shows whether it is set up (never the key).
  if (req.method === 'GET') {
    return res.status(200).json({ configured: !!process.env.AI_API_KEY, model: process.env.AI_MODEL || DEFAULT_MODEL });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'not_configured' });
  if (!(await signedIn(req))) return res.status(401).json({ error: 'sign_in_required' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const snags = cleanSnags(body);
  if (!snags) return res.status(400).json({ error: 'bad_request' });

  const base = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  let reply;
  try {
    reply = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent(snags) }
        ]
      })
    });
  } catch (err) {
    console.error('[describe] model unreachable:', err.message);
    return res.status(502).json({ error: 'model_unreachable' });
  }
  if (reply.status === 429) return res.status(429).json({ error: 'free_limit_reached' });
  if (!reply.ok) {
    // The provider's own message (e.g. "API key not valid") tells the user
    // what to fix; it never contains the key itself.
    const detail = await reply.json().then((j) => (Array.isArray(j) ? j[0] : j)?.error?.message).catch(() => '');
    console.error('[describe] model error', reply.status, detail);
    return res.status(502).json({ error: 'model_error', detail: clip(detail || `status ${reply.status}`, 200) });
  }
  const json = await reply.json().catch(() => null);
  const descriptions = parseDescriptions(json?.choices?.[0]?.message?.content, snags.map((s) => s.id));
  return res.status(200).json({ model, descriptions });
}
