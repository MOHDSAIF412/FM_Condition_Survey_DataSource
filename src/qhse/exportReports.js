import { loadSurveyForReading } from '../utils/surveyLoader';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { isQhse, inspectionIssues } from './model';
import { isDeletedInspection } from './lifecycle';

// Reload full records, including cloud photos: dashboard rows are summaries.
export async function exportQhseReports(rows, projectId, format, onProgress = () => {}) {
  if (!['pdf', 'excel'].includes(format)) throw new Error('Select PDF or Excel.');
  const loaded = await loadQhseReports(rows, projectId, onProgress);
  for (const full of loaded) {
    const issues = inspectionIssues(full);
    if (issues.length) throw new Error(`${full.facility.qhse.reportNumber || 'Inspection'}: ${issues.join(' ')}`);
  }
  onProgress(format === 'pdf' ? 'Building the QHSE PDF…' : 'Building the QHSE Excel workbook…');
  await (format === 'pdf' ? generateSurveyPDF : generateSurveyExcel)(loaded);
}
export async function loadQhseReports(rows, projectId, onProgress = () => {}) {
  if (!projectId || !rows.length) throw new Error('Select a project and at least one inspection.');
  const loaded = [];
  for (const [index, row] of rows.entries()) {
    onProgress(`Loading inspection ${index + 1} of ${rows.length} and its photos…`);
    const full = await loadSurveyForReading(row.id);
    if (!full || full.projectId !== projectId || !isQhse(full) || isDeletedInspection(full)) {
      throw new Error('This inspection is unavailable in the selected project. Refresh the inspection list.');
    }
    loaded.push(await hydratePhotos(full));
  }
  return loaded;
}
