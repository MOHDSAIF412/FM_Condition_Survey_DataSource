// k-anonymity lookup: only five hash characters leave the app, never the password.
export async function assertSafePassword(password, fetcher = fetch) {
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
  let response;
  try { response = await fetcher(`https://api.pwnedpasswords.com/range/${hash.slice(0,5)}`, { headers:{'Add-Padding':'true'}, signal:AbortSignal.timeout(10000) }); }
  catch { throw new Error('Password safety check is unavailable. Try again shortly.'); }
  if (!response.ok) throw new Error('Password safety check is unavailable. Try again shortly.');
  const lines = (await response.text()).split(/\r?\n/);
  if (lines.some(line => { const [suffix, count] = line.split(':'); return suffix === hash.slice(5) && Number(count) > 0; })) throw new Error('This password has appeared in a data breach. Choose a different password.');
}
