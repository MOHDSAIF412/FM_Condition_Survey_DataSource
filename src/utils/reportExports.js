// Keep report engines and embedded report logos out of the startup bundle.
export async function generateSurveyPDF(...args) {
  if (hasQhse(args[0])) {
    const module = await import('../qhse/reports');
    return module.generateQhsePDF(args[0]);
  }
  const module = await import('./pdfGenerator');
  return module.generateSurveyPDF(...args);
}
export async function generateSurveyExcel(...args) {
  if (hasQhse(args[0])) {
    const module = await import('../qhse/reports');
    return module.generateQhseExcel(args[0]);
  }
  const module = await import('./excelGenerator');
  return module.generateSurveyExcel(...args);
}
function hasQhse(input) {
  return (Array.isArray(input) ? input : [input]).some(s => s?.facility?.module === 'qhse');
}
