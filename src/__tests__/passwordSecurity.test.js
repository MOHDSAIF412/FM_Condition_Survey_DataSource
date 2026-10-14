import { test, expect, vi } from 'vitest';
import { assertSafePassword } from '../../supabase/functions/_shared/passwordSecurity';
import { readFileSync } from 'node:fs';
test('password screening sends only a five-character hash prefix and rejects compromised matches', async () => {
  const password='Example test password';
  const bytes=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(password));
  const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const fetcher=vi.fn(async()=>({ok:true,text:async()=>`${hash.slice(5)}:23\r\n${'0'.repeat(35)}:0`}));
  await expect(assertSafePassword(password,fetcher)).rejects.toThrow('data breach');
  expect(fetcher.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0,5)}`);
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain(password);
});
test('password screening accepts clean passwords and fails closed when unavailable', async () => {
  await assertSafePassword('A strong test passphrase',async()=>({ok:true,text:async()=>`${'0'.repeat(35)}:0`}));
  await expect(assertSafePassword('short',vi.fn())).rejects.toThrow('12 characters');
  await expect(assertSafePassword('A strong test passphrase',async()=>{throw Error('Network');})).rejects.toThrow('unavailable');
});
test('administrator function never bootstraps anonymously and checks permissions using the caller token', () => {
  const source=readFileSync('supabase/functions/admin-users/index.ts','utf8');
  expect(source).toContain('const bootstrapMode = false');
  expect(source).not.toContain('(count || 0) === 0');
  expect(source).toContain("Authorization: req.headers.get('Authorization')");
  expect(source).toContain("client.rpc('fm_can', { p_permission: 'manage_users' })");
  expect(source).toContain('await assertSafePassword(password)');
});
