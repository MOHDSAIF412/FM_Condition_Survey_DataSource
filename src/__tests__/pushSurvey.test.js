import { beforeEach, test, expect, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc:vi.fn(), limit:vi.fn(), upload:vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({ isCloudConfigured:true, PHOTO_BUCKET:'survey-photos', supabase:{
  rpc:mock.rpc,
  from:()=>({select:()=>({eq:()=>({limit:mock.limit})})}),
  storage:{from:()=>({upload:mock.upload})}
}}));
const { pushSurvey } = await import('../utils/cloudSync');
const survey={id:'test',cloudRevision:3,facility:{facilityName:'Test'},items:[{id:'i1',photos:[{id:'p1',dataUrl:'data:image/jpeg;base64,YQ=='}]}]};
beforeEach(()=>{
  vi.clearAllMocks();
  mock.limit.mockResolvedValue({data:[{revision:3}],error:null});
  mock.rpc.mockResolvedValue({data:{pushed:true,cloudRevision:4,facilityNumber:7},error:null});
  mock.upload.mockResolvedValue({error:null});
});
test('stale device is refused before uploading photos or committing rows', async()=>{
  mock.limit.mockResolvedValue({data:[{revision:4}],error:null});
  expect(await pushSurvey(survey)).toMatchObject({conflict:true,serverRevision:4});
  expect(mock.upload).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});
test('interrupted photo upload still commits snag data and reports the photo pending', async()=>{
  mock.upload.mockResolvedValue({error:{message:'Connection lost'}});
  const result=await pushSurvey(survey);
  expect(result).toMatchObject({pushed:true,failedPhotoIds:['p1'],syncedPhotoIds:[],cloudRevision:4});
  expect(mock.rpc.mock.calls[0][1]).toMatchObject({p_expected_revision:3,p_photos:[],p_items:[{id:'i1'}]});
});
test('successful upload returns confirmed storage paths for restart-safe retries', async()=>{
  const result=await pushSurvey(survey);
  expect(result).toMatchObject({pushed:true,syncedPhotoIds:['p1'],photoPaths:{p1:'test/i1/p1.jpg'}});
  expect(mock.rpc.mock.calls[0][1].p_expected_revision).toBe(3);
});
test('missing migration fails visibly without falling back to direct writes', async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
  await expect(pushSurvey(survey)).rejects.toThrow('Safe sync needs a database update');
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});
test('a race after preflight is still returned as a conflict by the atomic commit', async()=>{
  mock.rpc.mockResolvedValue({data:{conflict:true,serverRevision:4},error:null});
  expect(await pushSurvey(survey)).toEqual({conflict:true,serverRevision:4});
});
