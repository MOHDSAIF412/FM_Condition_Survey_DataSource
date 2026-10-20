import { test, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { indexedDB } from 'fake-indexeddb';
import { createProjectMeterTemplate, readProjectMeterImport, planProjectMeterImport } from '../meter/projectImport';
import { createMeterMapping } from '../meter/model';
import { saveSurveyBatchOffline, getSurveyOffline, saveSurveyOffline } from '../utils/storage';
const project = { id: 'meter-project', name: 'Al Dafra' };
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
async function fixture() {
  const b = new ExcelJS.Workbook(); const s = b.addWorksheet('Main Tracker');
  s.addRow(['Title']); s.addRow(['Property','Tenants','KWH METER NUMBER','Mapping No.','Region','METER STATUS','kWH Reading (17/04/2026)']);
  s.addRow(['ADCS-1','Shop A','0001','Kiosk-1','Al Dhafra','Active','10']);
  s.addRow([' adcs-1 ','Shop B','No meter','Kiosk-2','Al Dhafra','No meter','NA']);
  s.addRow(['ADCS-2','Shop C','0002',1,'Al Dhafra','Not Active','20']);
  s.addRow(['ADCS-2',null,null,2,'Al Dhafra']);
  const id = b.addImage({base64:image,extension:'png'});s.addImage(id,'H3:H3');
  return b;
}
test('project upload groups property names once, imports photos and skips empty placeholder rows',async()=>{
  const b=await fixture(); const input=await readProjectMeterImport(await b.xlsx.writeBuffer(),project);
  expect(input.errors).toEqual([]);expect(input.groups).toHaveLength(2);expect(input.count).toBe(3);expect(input.skipped).toBe(1);expect(input.photoCount).toBe(1);
  const plan=await planProjectMeterImport(input,project,[]);
  expect(plan.created).toBe(2);expect(plan.added).toBe(3);expect(plan.photosAdded).toBe(1);
  expect(plan.records[0].items[0].customValues.mappingNo).toBe('Kiosk-1');expect(plan.records[0].items[0].photos).toHaveLength(1);
  expect(plan.records[0].items[1].photos).toEqual([]);
  expect(plan.records[1].items[0].customValues.meterStatus).toBe('Inactive');
  const repeated=await planProjectMeterImport(input,project,plan.records);
  expect(repeated.records).toEqual([]);expect(repeated.skipped).toBe(3);expect(repeated.photosAdded).toBe(0);
});
test('reuses existing properties, preserves their meters and refuses ambiguous or locked matches',async()=>{
  const input=await readProjectMeterImport(await(await fixture()).xlsx.writeBuffer(),project);
  const old=createMeterMapping(project.id);old.facility.meter.branch='Adcs-1';
  const plan=await planProjectMeterImport(input,project,[old]);expect(plan.reused).toBe(1);expect(plan.created).toBe(1);expect(plan.records[0].id).toBe(old.id);
  await expect(planProjectMeterImport(input,project,[old,{...old,id:'duplicate'}])).rejects.toThrow('more than one');
  await expect(planProjectMeterImport(input,project,[{...old,reviewStatus:'approved'}])).rejects.toThrow('reopen');
});
test('new project template round trips with property columns',async()=>{
  const b=new ExcelJS.Workbook();await b.xlsx.load(await(await createProjectMeterTemplate(project)).arrayBuffer());
  expect(b.getWorksheet('Meters').getRow(1).values.slice(1,4)).toEqual(['Property name','Region','kWh reading date']);
});
test('in-cell image metadata resolves by relationships, not media file ordering',async()=>{
  const b=await fixture();const z=await JSZip.loadAsync(await b.xlsx.writeBuffer());
  z.file('xl/metadata.xml','<metadata><metadataTypes><metadataType name="XLRICHVALUE"/></metadataTypes><futureMetadata name="XLRICHVALUE"><bk><extLst><ext><rvb i="0"/></ext></extLst></bk></futureMetadata><valueMetadata><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>');
  z.file('xl/richData/rdrichvaluestructure.xml','<rvStructures><s t="_localImage"><k n="_rvRel:LocalImageIdentifier"/></s></rvStructures>');
  z.file('xl/richData/rdrichvalue.xml','<rvData><rv s="0"><v>0</v></rv></rvData>');
  z.file('xl/richData/richValueRel.xml','<richValueRels><rel r:id="rId19"/></richValueRels>');
  z.file('xl/richData/_rels/richValueRel.xml.rels','<Relationships><Relationship Id="rId19" Target="../media/in-cell.png"/></Relationships>');
  z.file('xl/media/in-cell.png',image,{base64:true});
  let sheet=await z.file('xl/worksheets/sheet1.xml').async('string');sheet=sheet.replace('</row>','<c r="H1" t="e" vm="1"><v>#VALUE!</v></c></row>');
  // Put the metadata cell on an otherwise unnamed photo row.
  sheet=sheet.replace('r="H1"','r="H6"');z.file('xl/worksheets/sheet1.xml',sheet);
  const input=await readProjectMeterImport(await z.generateAsync({type:'uint8array'}),project);
  expect(input.photoCount).toBe(2);expect(input.count).toBe(4);
  expect(input.groups[1].meters[1].photos).toHaveLength(1);
});
test('batch save is atomic and refuses a stale property without saving any of the new properties',async()=>{
  const data=new Map();vi.stubGlobal('localStorage',{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))});vi.stubGlobal('indexedDB',indexedDB);vi.stubGlobal('BroadcastChannel',undefined);
  const a={...createMeterMapping(project.id),id:'batch-a'};const saved=await saveSurveyOffline(a);
  const fresh={...createMeterMapping(project.id),id:'batch-new'};
  await expect(saveSurveyBatchOffline([{...saved,revision:0},fresh])).rejects.toThrow('another tab');
  expect(await getSurveyOffline(fresh.id)).toBeNull();
  const batch=await saveSurveyBatchOffline([saved,fresh]);expect(batch).toHaveLength(2);expect((await getSurveyOffline(fresh.id)).pendingSync).toBe(true);
  vi.unstubAllGlobals();
});
