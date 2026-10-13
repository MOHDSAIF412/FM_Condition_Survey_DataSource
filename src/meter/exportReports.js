import { loadSurveyForReading } from '../utils/surveyLoader';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { isMeter, isDeletedMapping, blockingIssues } from './model';

// Reload full records, including cloud photos: dashboard rows are summaries.
export async function exportMeterReports(rows, projectId, format, onProgress = () => {}) {
  if (!['pdf', 'excel'].includes(format)) throw new Error('Select PDF or Excel.');
  const loaded = await loadMeterReports(rows, projectId, onProgress);
  for (const full of loaded) {
    const issues = blockingIssues(full);
    if (issues.length) throw new Error(`${full.facility.meter?.branch || 'Mapping'}: ${issues.join(' ')}`);
  }
  onProgress(format === 'pdf' ? 'Building the meter mapping PDF…' : 'Building the meter mapping Excel workbook…');
  await (format === 'pdf' ? generateSurveyPDF : generateSurveyExcel)(loaded);
}
export async function loadMeterReports(rows, projectId, onProgress = () => {}) {
  if (!projectId || !rows.length) throw new Error('Select a project and at least one mapping.');
  const loaded = [];
  for (const [index, row] of rows.entries()) {
    onProgress(`Loading mapping ${index + 1} of ${rows.length} and its photos…`);
    const full = await loadSurveyForReading(row.id);
    if (!full || full.projectId !== projectId || !isMeter(full) || isDeletedMapping(full)) {
      throw new Error('This mapping is unavailable in the selected project. Refresh the mapping list.');
    }
    loaded.push(await hydratePhotos(full));
  }
  return loaded;
}
