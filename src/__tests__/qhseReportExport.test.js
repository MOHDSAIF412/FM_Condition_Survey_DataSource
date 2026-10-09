import { beforeEach, expect, test, vi } from 'vitest';
import { createQhse, createPhotoEvidence } from '../qhse/model';
const io = vi.hoisted(() => ({ load: vi.fn(), hydrate: vi.fn(), pdf: vi.fn(), excel: vi.fn() }));
vi.mock('../utils/surveyLoader', () => ({ loadSurveyForReading: io.load }));
vi.mock('../utils/cloudSync', () => ({ hydratePhotos: io.hydrate }));
vi.mock('../utils/reportExports', () => ({ generateSurveyPDF: io.pdf, generateSurveyExcel: io.excel }));
import { exportQhseReports } from '../qhse/exportReports';
beforeEach(() => {
  vi.clearAllMocks();
  io.hydrate.mockImplementation(async s => ({ ...s, items: s.items.map(i => ({ ...i, photos: i.photos.map(p => ({ ...p, dataUrl: 'data:image/png;base64,photo' })) })) }));
});
function inspection(id, projectId = 'p') {
  const s = { ...createQhse(projectId, 1, { name: 'Project', location: 'Abu Dhabi' }), id, status: 'submitted' };
  s.items = [createPhotoEvidence(Array.from({length:5}, (_,n) => ({id:`${id}-${n}`,storagePath:`cloud/${n}`,caption:`Remark ${n+1}`})))];
  return s;
}

test.each(['pdf', 'excel'])('dashboard %s export loads full inspections and keeps all photo remarks', async format => {
  const reports = [inspection('one'), inspection('two')];
  io.load.mockImplementation(async id => reports.find(s => s.id === id));
  const progress = vi.fn();
  await exportQhseReports(reports.map(s => ({id:s.id})), 'p', format, progress);
  expect(io.hydrate).toHaveBeenCalledTimes(2);
  const exporter = format === 'pdf' ? io.pdf : io.excel;
  const exported = exporter.mock.calls[0][0];
  expect(exported.map(s => s.id)).toEqual(['one','two']);
  expect(exported[0].items[0].photos.map(p => p.caption)).toEqual(['Remark 1','Remark 2','Remark 3','Remark 4','Remark 5']);
  expect(exported[0].items[0].photos.every(p => p.dataUrl)).toBe(true);
});

test.each(['other-project','deleted','condition'])('cannot export a %s record from a stale selection', async kind => {
  const s = inspection('one');
  if (kind === 'other-project') s.projectId = 'someone-else';
  if (kind === 'deleted') s.facility.qhse.deletedAt = new Date().toISOString();
  if (kind === 'condition') s.facility.module = 'condition';
  io.load.mockResolvedValue(s);
  await expect(exportQhseReports([{id:s.id}], 'p', 'pdf')).rejects.toThrow('unavailable');
  expect(io.pdf).not.toHaveBeenCalled();
});

test('one unavailable inspection prevents a silently incomplete combined report', async () => {
  io.load.mockImplementation(async id => id === 'one' ? inspection('one') : null);
  await expect(exportQhseReports([{id:'one'},{id:'missing'}], 'p', 'excel')).rejects.toThrow('unavailable');
  expect(io.excel).not.toHaveBeenCalled();
});
