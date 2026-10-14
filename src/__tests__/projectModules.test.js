import { expect, test } from 'vitest';
import { projectsForModule, remapSurveyProject } from '../utils/projectModules';
const projects=[{id:'old',module:'condition'},{id:'new-q',module:'qhse',legacyParentId:'old'},{id:'new-m',module:'meter',legacyParentId:'old'},{id:'standalone',module:'meter'}];
test('projects belong only to their own module',()=>{
 expect(projectsForModule(projects,'condition').map(p=>p.id)).toEqual(['old']);
 expect(projectsForModule(projects,'qhse').map(p=>p.id)).toEqual(['new-q']);
 expect(projectsForModule(projects,'meter').map(p=>p.id)).toEqual(['new-m','standalone']);
});
test('pending legacy device records move to the right parent without losing edits or photo objects',()=>{
 const record={id:'draft',projectId:'old',pendingSync:true,facility:{module:'meter'},items:[{photos:[{id:'photo',caption:'Keep'}]}]};
 const mapped=remapSurveyProject(record,projects);
 expect(mapped.projectId).toBe('new-m');expect(mapped.pendingSync).toBe(true);expect(mapped.items).toBe(record.items);
 expect(remapSurveyProject(mapped,projects)).toBe(mapped);
 const condition={...record,facility:{}};expect(remapSurveyProject(condition,projects)).toBe(condition);
});
