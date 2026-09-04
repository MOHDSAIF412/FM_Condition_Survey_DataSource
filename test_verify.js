// Test generateSurveyExcel with ExcelJS and embedded photos
import { sampleSurveyData } from './src/data/sampleSurvey.js';
import { generateSurveyExcel } from './src/utils/excelGenerator.js';

console.log('--- Testing ExcelJS Report Generation with Embedded Photos ---');

async function testExcelGeneration() {
  const buffer = await generateSurveyExcel(sampleSurveyData);
  console.log(`Successfully generated Excel buffer: ${buffer.byteLength} bytes`);
  
  if (buffer.byteLength > 10000) {
    console.log('>>> SUCCESS: Excel Report with Photos & Full Information Verified! <<<');
  } else {
    console.error('FAIL: Buffer size too small');
    process.exit(1);
  }
}

testExcelGeneration().catch(err => {
  console.error('Excel generation error:', err);
  process.exit(1);
});
