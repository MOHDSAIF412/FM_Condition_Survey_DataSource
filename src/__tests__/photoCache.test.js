import { expect, test } from 'vitest';
import { createPhotoCache } from '../utils/photoCache';
test('deduplicates downloads and reuses cached bytes', async () => {
 const cache=createPhotoCache(); let calls=0;
 const load=async()=>{calls++;return 'image';};
 const one=cache.get('account-a/photo',load), two=cache.get('account-a/photo',load);
 expect(one).toBe(two); await one;
 expect(await cache.get('account-a/photo',load)).toBe('image'); expect(calls).toBe(1);
 await cache.get('account-b/photo',load); expect(calls).toBe(2);
});
test('limits memory and retries failures', async () => {
 const cache=createPhotoCache({maxBytes:8}); let calls=0;
 const load=async()=>{calls++;return 'abcd';};
 await cache.get('a',load);await cache.get('b',load);await cache.get('a',load);
 expect(calls).toBe(3);
 await expect(cache.get('error',()=>Promise.reject(Error('offline')))).rejects.toThrow('offline');
 expect(await cache.get('error',()=>Promise.resolve('ok'))).toBe('ok');
});
test('limits simultaneous downloads even across independently rendered cards', async () => {
 const cache=createPhotoCache({concurrency:2}); let active=0,peak=0;
 const requests=Array.from({length:12},(_,i)=>cache.get(String(i),async()=>{
  active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return 'image';
 }));
 await Promise.all(requests);expect(peak).toBe(2);
});
