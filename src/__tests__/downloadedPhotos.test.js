import { expect, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readDownloadedPhoto, storeDownloadedPhoto } from '../utils/downloadedPhotos';
test('photo cache persists independently and cannot cross account database boundaries',async()=>{
 globalThis.indexedDB=new IDBFactory();
 const a={database:'qa-photos-a'},b={database:'qa-photos-b'};
 expect(await readDownloadedPhoto(a,'photo.jpg')).toBeNull();
 await storeDownloadedPhoto(a,'photo.jpg','data:image/png;base64,cached');
 expect(await readDownloadedPhoto(a,'photo.jpg')).toContain('cached');
 expect(await readDownloadedPhoto(b,'photo.jpg')).toBeNull();
 delete globalThis.indexedDB;
});
test('disabled IndexedDB leaves network photos usable',async()=>{
 delete globalThis.indexedDB;
 expect(await readDownloadedPhoto({database:'disabled'},'photo.jpg')).toBeNull();
 await expect(storeDownloadedPhoto({database:'disabled'},'photo.jpg','image')).resolves.toBeUndefined();
});
