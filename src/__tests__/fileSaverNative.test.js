import { test, expect, vi } from 'vitest';
const native = vi.hoisted(() => ({ platform: 'ios', write: vi.fn(async () => ({ uri: 'file:///report.pdf' })), share: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => native.platform } }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Documents: 'DOCUMENTS', External: 'EXTERNAL' }, Filesystem: { writeFile: native.write } }));
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }));
import { saveBlob } from '../utils/fileSaver';

test.each([['ios', 'DOCUMENTS'], ['android', 'EXTERNAL']])('reports save and share using the supported %s directory', async (platform, directory) => {
  native.platform = platform;
  native.write.mockClear(); native.share.mockClear();
  vi.stubGlobal('FileReader', class {
    readAsDataURL() { this.result = 'data:application/pdf;base64,cGRm'; queueMicrotask(() => this.onload()); }
  });
  try {
    expect(await saveBlob(new Blob(['pdf']), 'report.pdf')).toBe('file:///report.pdf');
    expect(native.write).toHaveBeenCalledWith({ path: 'report.pdf', data: 'cGRm', directory, recursive: true });
    expect(native.share).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///report.pdf' }));
  } finally { vi.unstubAllGlobals(); }
});
