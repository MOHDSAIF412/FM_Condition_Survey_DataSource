import { expect, test, vi } from 'vitest';
import { mergeSurveyLists } from '../utils/surveySelection';
const cloud = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({ supabase: cloud, isCloudConfigured: true, PHOTO_BUCKET: 'photos' }));
import { listSurveys } from '../utils/cloudSync';

test('QHSE summary counts actual findings across pages and excludes photo-only entries', async () => {
  const items = Array.from({length:1002}, (_,n) => ({survey_id:'q',custom_values:{qhseEvidenceOnly:n%2===0}}));
  cloud.from.mockImplementation(table => {
    let columns;
    const chain = {
      select: value => { columns=value; return chain; },
      order: async () => ({data:[{id:'q',facility:{module:'qhse'},status:'submitted'}]}),
      in: () => chain,
      range: async (start,end) => ({data: (table==='survey_photos' ? [{survey_id:'q'},{survey_id:'q'}] : items).slice(start,end+1)})
    };
    return chain;
  });
  vi.stubGlobal('localStorage',{setItem:vi.fn()});
  const [summary] = await listSurveys();
  expect(summary).toMatchObject({itemCount:1002,findingCount:501,photoCount:2});
  vi.unstubAllGlobals();
});

test('local QHSE changes keep the dashboard finding and photo totals current before uploading', () => {
  const local = {id:'q',pendingSync:true,facility:{module:'qhse'},items:[{id:'finding',photos:[{id:'p1'}]},{id:'evidence',customValues:{qhseEvidenceOnly:true},photos:[{id:'p2'},{id:'p3'}]}]};
  const [merged] = mergeSurveyLists([{id:'q',itemCount:10,findingCount:8,photoCount:20}], [local]);
  expect(merged).toMatchObject({itemCount:2,findingCount:1,photoCount:3});
});
