import { test, expect, vi, beforeEach } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import ota from '../../api/ota';
import { selectDeviceAccount } from '../utils/deviceAccount';
import { saveSurveyOffline, getSurveyOffline, loadCurrentSurveyOffline, listAllSurveysOffline } from '../utils/storage';
const store = new Map();
vi.stubGlobal('localStorage', { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,String(v)) });
vi.stubGlobal('indexedDB', indexedDB); vi.stubGlobal('BroadcastChannel', undefined);
beforeEach(() => vi.restoreAllMocks());
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }; }
test('OTA ignores attacker host headers for both manifest lookup and download URLs', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok:true, json:async()=>({version:'1.0.123',path:'/ota/bundle-1.0.123.zip'}) });
  const res = response();
  await ota({ method:'POST', headers:{host:'attacker.example','x-forwarded-host':'127.0.0.1:9999','x-forwarded-proto':'http'},body:{} },res);
  expect(fetcher.mock.calls[0][0]).toBe('https://fm-condition-survey-data-source.vercel.app/ota/manifest.json');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({url:'https://fm-condition-survey-data-source.vercel.app/ota/bundle-1.0.123.zip'}));
});
test.each(['//attacker.example/evil.zip','/ota/../evil.zip','/ota/bundle-1.0.999.zip'])('OTA refuses untrusted manifest path %s', async path => {
  vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({version:'1.0.123',path})});
  const res=response(); await ota({method:'GET',headers:{},body:{}},res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({error:'no_new_version_available'}));
});
test('account switching isolates active inspections, lists, direct opens and unsent work', async () => {
  store.set('fm_last_account','alice'); selectDeviceAccount('alice');
  await saveSurveyOffline({id:'private-alice',pendingSync:true,facility:{facilityName:'Private site'},items:[{id:'i'}]});
  selectDeviceAccount('bob');
  expect(await loadCurrentSurveyOffline()).toBeNull(); expect(await getSurveyOffline('private-alice')).toBeNull();
  expect(await listAllSurveysOffline()).toEqual([]);
  await saveSurveyOffline({id:'private-bob',facility:{facilityName:'Bob site'},items:[]});
  selectDeviceAccount('alice');
  expect((await loadCurrentSurveyOffline()).id).toBe('private-alice');
  expect((await getSurveyOffline('private-alice')).pendingSync).toBe(true);
  expect(await getSurveyOffline('private-bob')).toBeNull();
});
test('fallback localStorage cannot expose an earlier account draft', async () => {
  selectDeviceAccount('alice'); store.set('fm_current_survey',JSON.stringify({id:'private-fallback'}));
  selectDeviceAccount('charlie'); expect(await loadCurrentSurveyOffline()).toBeNull();
  expect(store.get('fm_current_survey')).toContain('private-fallback');
});
