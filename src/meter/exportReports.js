import { checkReportCancelled, yieldToScreen } from '../utils/reportTask';
import { loadSurveyForReading } from '../utils/surveyLoader';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { isMeter, isDeletedMapping, blockingIssues } from './model';

// Reload full records, including cloud photos: dashboard rows are summaries.
export async function exportMeterReports(rows, projectId, format, onProgress = () => {}, signal) {
  if (!['pdf', 'excel'].includes(format)) throw new Error('Select PDF or Excel.');
  const loaded = await loadMeterReports(rows, projectId, onProgress, signal);
  for (const full of loaded) {
    const issues = blockingIssues(full);
    if (issues.length) throw new Error(`${full.facility.meter?.branch || 'Mapping'}: ${issues.join(' ')}`);
  }
  checkReportCancelled(signal); await yieldToScreen();
  onProgress(format === 'pdf' ? 'Building the meter mapping PDF…' : 'Building the meter mapping Excel workbook…');
  await (format === 'pdf' ? generateSurveyPDF : generateSurveyExcel)(loaded, 'ALL', { signal });
}
export async function loadMeterReports(rows, projectId, onProgress = () => {}, signal) {
  if (!projectId || !rows.length) throw new Error('Select a project and at least one mapping.');
  const loaded = [];
  for (const [index, row] of rows.entries()) {
    checkReportCancelled(signal); await yieldToScreen();
    onProgress(`Loading mapping ${index + 1} of ${rows.length} and its photos…`);
    const full = await loadSurveyForReading(row.id);
    if (!full || full.projectId !== projectId || !isMeter(full) || isDeletedMapping(full)) {
      throw new Error('This mapping is unavailable in the selected project. Refresh the mapping list.');
    }
    loaded.push(await hydratePhotos(full, { signal, onProgress: (done, total) => onProgress(`Loading mapping ${index + 1} of ${rows.length} · photos ${done}/${total}…`) }));
  }
  return loaded;
}
