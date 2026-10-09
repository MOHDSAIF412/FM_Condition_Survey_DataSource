import { test, expect } from 'vitest';
import { createQhse, createFinding, createPhotoEvidence, reviewChecks, actionSummary, photoRemark, findingDetails, inspectionIssues } from '../qhse/model';

function record() { return createQhse('p', 1, {name:'QA project',location:'QA address'}); }
test('required review issues point to fields and preserve editable templates', () => {
  const s = record(); s.facility.address = ''; s.items = [createFinding()];
  const checks = reviewChecks(s);
  expect(checks).toContainEqual(expect.objectContaining({blocking:true,fieldId:'address',section:'details'}));
  expect(checks).toContainEqual(expect.objectContaining({blocking:true,fieldId:'severity',itemId:s.items[0].id}));
  s.facility.qhse.layout.hidden = ['inspection:address','finding:severity'];
  expect(reviewChecks(s).filter(c => c.blocking).map(c => c.fieldId)).not.toContain('address');
  expect(reviewChecks(s).filter(c => c.blocking).map(c => c.fieldId)).not.toContain('severity');
});
test('photo remarks and signatures are recommendations rather than new legacy submission blockers', () => {
  const s=record(); s.items=[createPhotoEvidence([{id:'p1',caption:''}])];
  expect(reviewChecks(s)).toContainEqual(expect.objectContaining({fieldId:'photo-p1',itemId:s.items[0].id}));
  expect(reviewChecks(s).filter(c=>c.blocking)).toEqual([]);
  expect(reviewChecks(s).some(c=>c.signature)).toBe(true);
});
test('custom required numeric values are accepted by export and review validation', () => {
  const s=record(); s.items=[createFinding()];
  s.facility.qhse.layout={hidden:['finding:location','finding:type','finding:description','finding:severity'],custom:[{id:'n',scope:'finding',custom:true,required:true,label:'Reading',type:'number'}]};
  s.items[0].customValues.n=42;
  expect(inspectionIssues(s)).toEqual([]);
  expect(reviewChecks(s).filter(c=>c.blocking && c.fieldId==='n')).toEqual([]);
});
test('action overview excludes photo-only entries, closed actions and due-today actions from overdue', () => {
  const items=[
    {customValues:{findingStatus:'Open',severity:'Critical -2',dueDate:'2026-10-08'}},
    {customValues:{findingStatus:'Open',dueDate:'2026-10-09'}},
    {customValues:{findingStatus:'Closed',severity:'Critical -2',dueDate:'2026-10-01'}},
    {customValues:{qhseEvidenceOnly:true,severity:'Critical -2',dueDate:'2026-10-01'}}
  ];
  expect(actionSummary(items,'2026-10-09')).toEqual({open:2,overdue:1,critical:1});
});
test('corrective actions and closure evidence survive JSON and appear in report content', () => {
  const s=record(); const i=createFinding();
  i.customValues={...i.customValues,actionOwner:'QA owner',dueDate:'2026-10-10',closureRemarks:'Guard replaced',closedOn:'2026-10-09',closurePhotoIds:['after']};
  i.photos=[{id:'after',caption:'New guard'}]; s.items=[i];
  const restored=JSON.parse(JSON.stringify(s));
  expect(findingDetails(restored,restored.items[0])).toContainEqual(['Action owner','QA owner']);
  expect(photoRemark(restored.items[0],restored.items[0].photos[0])).toBe('Closure evidence: New guard');
  expect(photoRemark(restored.items[0],{id:'before',caption:'Old guard'})).toBe('Old guard');
});
