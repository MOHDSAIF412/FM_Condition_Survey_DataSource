import { moduleOf } from './modules';
export const projectModule = project => project?.module || 'condition';
export const projectsForModule = (projects, module) => (projects || []).filter(p => projectModule(p) === module);
export function remapSurveyProject(record, projects) {
 if (!record?.projectId) return record;
 const target = (projects || []).find(p => p.legacyParentId === record.projectId && projectModule(p) === moduleOf(record));
 return target ? { ...record, projectId: target.id } : record;
}
export const canArchiveProjectWithRecords = project => ['qhse','meter'].includes(projectModule(project));
