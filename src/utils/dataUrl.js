/**
 * Turns a data URL into a Blob without fetch().
 *
 * ROOT CAUSE of "Sync has failed repeatedly" (2026-10-16): the Content Security
 * Policy added on 2026-10-15 limits connect-src to Supabase and a few APIs.
 * The browser treats fetching a data: URL as a connection, so it refused every
 * one with "TypeError: Failed to fetch". Every photo upload failed before it
 * reached Supabase, the facility stayed "Waiting to sync", and the 30-second
 * retry repeated the same failure. Decoding the bytes here needs no
 * connection, so the policy can stay strict.
 */
export function dataUrlToBlob(dataUrl) {
  const text = String(dataUrl || '');
  const comma = text.indexOf(',');
  if (!text.startsWith('data:') || comma < 0) throw new Error('Not a data URL');
  const meta = text.slice(5, comma).split(';');
  const type = (meta[0] || 'text/plain').toLowerCase();
  const body = text.slice(comma + 1);
  if (meta.includes('base64')) {
    const binary = atob(body.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  return new Blob([decodeURIComponent(body)], { type });
}
