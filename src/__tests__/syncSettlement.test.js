import { test, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { settleUpload } from '../utils/syncSettlement';

vi.stubGlobal('indexedDB', indexedDB);
vi.stubGlobal('BroadcastChannel', undefined);
const cache = new Map();
vi.stubGlobal('localStorage', { getItem:(k)=>cache.get(k)||null, setItem:(k,v)=>cache.set(k,v) });
const { saveSurveyOffline, getSurveyOffline, markSurveySynced, loadCurrentSurveyOffline, saveSurveyRecovery, listSurveyRecoveries } = await import('../utils/storage');
const original = { id:'stored', cloudRevision:4, facility:{facilityName:'Test'}, items:[{id:'i1',defectDescription:'Original', photos:[{id:'p1',dataUrl:'data:image/jpeg;base64,YQ==',syncStatus:'local'}]}] };
const receipt = { pushed:true, cloudRevision:5, syncedPhotoIds:['p1'], failedPhotoIds:[], photoPaths:{p1:'stored/i1/p1.jpg'} };

test('new edits made during an upload remain pending in IndexedDB', async () => {
  await saveSurveyOffline(original);
  const edited = {...original, generalNotes:'New note while uploading'};
  await saveSurveyOffline(edited);
  expect(await markSurveySynced(original.id,original,receipt)).toBe(false);
  const stored=await getSurveyOffline(original.id);
  expect(stored).toMatchObject({generalNotes:'New note while uploading',pendingSync:true,cloudRevision:5});
});
test('restart retains failed photos and retries against the acknowledged revision', async () => {
  const upload={...original,id:'failed-photo'};
  await saveSurveyOffline(upload);
  await markSurveySynced(upload.id,upload,{...receipt,syncedPhotoIds:[],failedPhotoIds:['p1']});
  const restarted=await loadCurrentSurveyOffline();
  expect(restarted).toMatchObject({id:'failed-photo',cloudRevision:5,pendingSync:true});
  expect(restarted.items[0].photos[0]).toMatchObject({syncStatus:'failed',dataUrl:original.items[0].photos[0].dataUrl});
  await markSurveySynced(upload.id,restarted,{...receipt,cloudRevision:6});
  expect(await getSurveyOffline(upload.id)).toMatchObject({pendingSync:false,cloudRevision:6});
});
test('new deletions made during upload are not cleared by the older receipt', () => {
  const next=settleUpload({...original,deletedItemIds:['old','new']},{...original,deletedItemIds:['old']},receipt);
  expect(next.deletedItemIds).toEqual(['new']);
  expect(next.pendingSync).toBe(true);
});
test('facility switch does not apply a receipt to the newly opened facility', () => {
  const other={...original,id:'other'};
  expect(settleUpload(other,original,receipt)).toBe(other);
});
test('custom fields named like sync metadata are still user edits', () => {
  const uploaded = { ...original, facility: { ...original.facility, custom: { revision:'first' } } };
  const current = { ...uploaded, facility: { ...uploaded.facility, custom: { revision:'second' } } };
  expect(settleUpload(current,uploaded,receipt).pendingSync).toBe(true);
});
test('recovery backup survives loading the server copy and never enters the sync queue', async () => {
  const key=await saveSurveyRecovery({...original,recoveryUserId:'account-a'});
  await saveSurveyOffline({...original,generalNotes:'Server copy'},{pendingSync:false});
  const backup=(await listSurveyRecoveries()).find((r)=>r.key===key);
  expect(backup.survey).toMatchObject({id:'stored',recoveryUserId:'account-a'});
  expect(backup.survey.generalNotes).toBeUndefined();
});
