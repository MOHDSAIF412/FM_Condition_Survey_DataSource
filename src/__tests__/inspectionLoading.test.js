import { beforeEach, expect, test, vi } from 'vitest';
const io = vi.hoisted(() => ({ reads: [], download: vi.fn(), results: {}, hold: null }));
vi.mock('../utils/supabaseClient', () => ({ isCloudConfigured: true, PHOTO_BUCKET: 'photos', supabase: {
 from: table => {
  const query = { select: () => query, eq: () => query, limit: () => query, order: () => query,
   then: (resolve, reject) => { io.reads.push(table); return (io.hold ? io.hold.then(() => io.results[table]) : Promise.resolve(io.results[table])).then(resolve, reject); } };
  return query;
 }, storage: { from: () => ({ download: io.download }) }
} }));
vi.mock('../utils/deviceAccount', () => ({ deviceStorageScope: () => ({ accountId: 'qa' }) }));
import { pullSurvey } from '../utils/cloudSync';
beforeEach(() => {
 io.reads=[]; io.download.mockReset(); io.hold=null;
 io.results={condition_surveys:{data:[{id:'inspection',revision:8}]},survey_items:{data:[{id:'finding',survey_id:'inspection'}]},survey_photos:{data:[{id:'photo',item_id:'finding',storage_path:'qa/photo.jpg',caption:'Important evidence'}]}};
});
test('opening requests all three tables together and never waits for photo bytes', async () => {
 let release; io.hold=new Promise(resolve=>{release=resolve;});
 const opening=pullSurvey('inspection',{}, {includePhotoBytes:false});
 await Promise.resolve(); await Promise.resolve();
 expect(io.reads).toEqual(['condition_surveys','survey_items','survey_photos']);
 release(); const result=await opening;
 expect(io.download).not.toHaveBeenCalled();
 expect(result.cloudRevision).toBe(8);
 expect(result.items[0].photos[0]).toMatchObject({id:'photo',storagePath:'qa/photo.jpg',caption:'Important evidence',dataUrl:null});
});
test('known device photo bytes survive metadata-only opening', async () => {
 const result=await pullSurvey('inspection',{photo:'data:image/png;base64,cached'}, {includePhotoBytes:false});
 expect(result.items[0].photos[0].dataUrl).toContain('cached');
 expect(io.download).not.toHaveBeenCalled();
});
test('missing records return null, while query errors remain visible', async () => {
 io.results.condition_surveys={data:[]};
 expect(await pullSurvey('missing',{}, {includePhotoBytes:false})).toBeNull();
 io.results.condition_surveys={error:new Error('access refused')};
 await expect(pullSurvey('denied')).rejects.toThrow('access refused');
});
