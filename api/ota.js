/**
 * Over-the-air update check endpoint.
 *
 * The updater plugin on the phone POSTs its current bundle version here. We
 * compare it against the manifest written by scripts/build-ota.mjs during the
 * last deploy and either hand back a download URL or say "you're current".
 *
 * Self-hosted on purpose: the bundle and this endpoint live on the same Vercel
 * deployment as the web app, so shipping a web update ships the app update.
 * No third-party update service and nothing to pay for.
 *
 * A static JSON file cannot serve this because the plugin sends POST, and
 * Vercel's static hosting only answers GET/HEAD.
 */

const NO_UPDATE = {
  message: 'No new version available',
  error: 'no_new_version_available'
};

export default async function handler(req, res) {
  // The plugin POSTs; allow GET too so the endpoint can be opened in a browser
  // to check what version is currently being served.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  let manifest;
  try {
    const r = await fetch(`${origin}/ota/manifest.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    manifest = await r.json();
  } catch (err) {
    // No manifest deployed yet, or it could not be read. Never fail the app
    // over this -- it just keeps running the bundle it already has.
    console.error('[ota] manifest unavailable:', err.message);
    return res.status(200).json(NO_UPDATE);
  }

  if (!manifest || !manifest.version || !manifest.path) {
    return res.status(200).json(NO_UPDATE);
  }

  // Body may arrive parsed or raw depending on content-type.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const current = (body && (body.version_name || body.version)) || '';

  if (current && current === manifest.version) {
    return res.status(200).json({ ...NO_UPDATE, version: manifest.version });
  }

  return res.status(200).json({
    version: manifest.version,
    url: `${origin}${manifest.path}`,
    old: current || undefined
  });
}
