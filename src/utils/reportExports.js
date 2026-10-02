// Keep report engines and embedded report logos out of the startup bundle.
export async function generateSurveyPDF(...args) {
  const module = await import('./pdfGenerator');
  return module.generateSurveyPDF(...args);
}
export async function generateSurveyExcel(...args) {
  const module = await import('./excelGenerator');
  return module.generateSurveyExcel(...args);
}
