// Keep the web deployment and the packaged mobile shell on the same policy.
export const contentSecurityPolicy = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co", "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fm-condition-survey-data-source.vercel.app https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.pwnedpasswords.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-src 'none'", "worker-src 'self' blob:"
].join('; ');

export function securityPolicyPlugin() {
  return { name: 'fm-security-policy', apply: 'build', configResolved(config) {
    if (config.mode !== 'uitest') validateCloudConfig(config.env);
  }, transformIndexHtml: {
    order: 'post', handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy }, injectTo: 'head' }]
  } };
}

export function validateCloudConfig(env) {
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) throw new Error('Production requires the Supabase HTTPS URL and public client key.');
  if (key.startsWith('sb_publishable_')) return;
  try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon') return; } catch { /* fail closed */ }
  throw new Error('Only a public Supabase client key may be shipped. Secret and service-role keys are refused.');
}
