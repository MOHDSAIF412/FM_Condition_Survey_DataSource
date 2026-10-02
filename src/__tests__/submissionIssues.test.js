import { test, expect } from 'vitest';
import { normaliseFormsConfig } from '../config/formConfig';
import { submissionIssues } from '../config/rulesEngine';

const config=normaliseFormsConfig({fields:[
  { id:'inspection-note', key:'inspectionNote', scope:'snag', sectionId:'snag_details', label:'Inspection note', type:'text', required:true },
  { id:'hidden-note', key:'hiddenNote', scope:'snag', sectionId:'snag_details', label:'Hidden note', type:'text', required:true,hidden:true }
]});
test('validation identifies the exact facility and snag controls in form order',()=>{
  expect(submissionIssues(config,{facility:{},items:[{id:'i1'}]})).toEqual([
    {scope:'facility',key:'facilityName',label:'Enter the facility name'},
    {scope:'snag',itemId:'i1',key:'inspectionNote',label:'Snag #1: Inspection note'}
  ]);
});
test('fixing a required field removes its error without changing hidden answers',()=>{
  const survey={facility:{facilityName:'Test'},items:[{id:'i1',customValues:{inspectionNote:'Completed',hiddenNote:'Kept'}}]};
  expect(submissionIssues(config,survey)).toEqual([]);
  expect(survey.items[0].customValues.hiddenNote).toBe('Kept');
});
