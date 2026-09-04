// Test exceljs workbook creation with image embedding
import ExcelJS from 'exceljs';

async function testExcelJS() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Test Sheet');
  
  sheet.addRow(['ID', 'Name', 'Photo']);
  
  // 1x1 transparent/red PNG base64
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  
  const imageId = workbook.addImage({
    base64: samplePngBase64,
    extension: 'png',
  });
  
  sheet.addImage(imageId, {
    tl: { col: 2, row: 1 },
    ext: { width: 100, height: 80 }
  });
  
  sheet.getRow(2).height = 70;
  
  const buffer = await workbook.xlsx.writeBuffer();
  console.log('Workbook buffer size:', buffer.byteLength);
  if (buffer.byteLength > 1000) {
    console.log('SUCCESS: exceljs image embedding works!');
  }
}

testExcelJS().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
