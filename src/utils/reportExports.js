// Keep report engines and embedded report logos out of the startup bundle.
export async function generateSurveyPDF(...args) {
  if (has(args[0], 'meter')) {
    const module = await import('../meter/reports');
    return module.generateMeterPDF(args[0]);
  }
  if (has(args[0], 'qhse')) {
    const module = await import('../qhse/reports');
    return module.generateQhsePDF(args[0]);
  }
  const module = await import('./pdfGenerator');
  return module.generateSurveyPDF(...args);
}
export async function generateSurveyExcel(...args) {
  if (has(args[0], 'meter')) {
    const module = await import('../meter/reports');
    return module.generateMeterExcel(args[0]);
  }
  if (has(args[0], 'qhse')) {
    const module = await import('../qhse/reports');
    return module.generateQhseExcel(args[0]);
  }
  const module = await import('./excelGenerator');
  return module.generateSurveyExcel(...args);
}
function has(input, module) {
  return (Array.isArray(input) ? input : [input]).some(s => s?.facility?.module === module);
}
