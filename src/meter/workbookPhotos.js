import JSZip from 'jszip';
import { SaxesParser } from 'saxes';

function xml(text) {
  const stack = [], root = { children: [] };
  const parser = new SaxesParser();
  parser.on('doctype', () => { throw new Error('Workbook XML document types are not supported.'); });
  parser.on('opentag', tag => {
    const node = { name: tag.name.split(':').at(-1), attrs: tag.attributes, children: [], text: '' };
    (stack.at(-1) || root).children.push(node); stack.push(node);
  });
  parser.on('text', text => { if (stack.length) stack.at(-1).text += text; });
  parser.on('closetag', () => stack.pop()); parser.write(text).close();
  return root.children[0];
}
const children = (node, name) => node?.children.filter(n => n.name === name) || [];
const child = (node, name) => children(node, name)[0];
function part(base, target) {
  const url = new URL(target, `https://workbook.invalid/${base}`);
  if (url.origin !== 'https://workbook.invalid') throw new Error('External workbook photo links are not imported.');
  return decodeURIComponent(url.pathname.slice(1));
}
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function photo(bytes, extension, name, sourceCell) {
  const mime = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' }[extension.toLowerCase()];
  if (!mime) throw new Error(`Unsupported embedded photo format: ${extension}. Use JPEG, PNG or WebP.`);
  if (bytes.length > 10 * 1024 * 1024) throw new Error(`${name}: embedded photo exceeds 10 MB.`);
  return { name, dataUrl: `data:${mime};base64,${base64(bytes)}`, size: bytes.length, sourceCell };
}

// Excel's Place in Cell photos use cell vm -> valueMetadata -> XLRICHVALUE
// future metadata -> rich value -> LocalImageIdentifier -> image relationship.
export async function extractWorkbookPhotos(buffer, book) {
  const zip = await JSZip.loadAsync(buffer), result = new Map();
  const readXml = async path => zip.file(path) ? xml(await zip.file(path).async('string')) : null;
  const add = (name, row, image) => {
    if (!result.has(name)) result.set(name, new Map());
    const rows = result.get(name); if (!rows.has(row)) rows.set(row, []); rows.get(row).push(image);
  };
  for (const sheet of book.worksheets) for (const image of sheet.getImages()) {
    const media = book.getImage(Number(image.imageId));
    const row = image.range.tl.nativeRow + 1;
    if (media?.buffer) add(sheet.name, row, photo(new Uint8Array(media.buffer), media.extension, `Meter-photo-${row}.${media.extension}`, `anchor:${row}:${image.imageId}`));
  }
  if (!zip.file('xl/metadata.xml')) return result;
  const metadata = await readXml('xl/metadata.xml');
  const types = children(child(metadata, 'metadataTypes'), 'metadataType');
  const blocks = children(child(metadata, 'valueMetadata'), 'bk');
  const future = new Map(children(metadata, 'futureMetadata').map(n => [n.attrs.name, children(n, 'bk')]));
  const values = children(await readXml('xl/richData/rdrichvalue.xml'), 'rv');
  const structures = children(await readXml('xl/richData/rdrichvaluestructure.xml'), 's');
  const imageRels = children(await readXml('xl/richData/richValueRel.xml'), 'rel');
  const targets = new Map(children(await readXml('xl/richData/_rels/richValueRel.xml.rels'), 'Relationship').filter(r => r.attrs.TargetMode !== 'External').map(r => [r.attrs.Id, part('xl/richData/richValueRel.xml', r.attrs.Target)]));
  const sheets = children(child(await readXml('xl/workbook.xml'), 'sheets'), 'sheet');
  const sheetTargets = new Map(children(await readXml('xl/_rels/workbook.xml.rels'), 'Relationship').map(r => [r.attrs.Id, part('xl/workbook.xml', r.attrs.Target)]));
  for (const sheet of sheets) {
    const path = sheetTargets.get(sheet.attrs['r:id']); if (!path || !zip.file(path)) continue;
    const cells = [];
    const parser = new SaxesParser();
    parser.on('opentag', tag => { if (tag.name.split(':').at(-1) === 'c' && tag.attributes.vm) cells.push(tag.attributes); });
    parser.write(await zip.file(path).async('string')).close();
    for (const cell of cells) {
      const rc = children(blocks[Number(cell.vm) - 1], 'rc').find(n => types[Number(n.attrs.t) - 1]?.attrs.name === 'XLRICHVALUE');
      if (!rc) continue;
      const futureBlock = future.get('XLRICHVALUE')?.[Number(rc.attrs.v)];
      const ext = child(child(futureBlock, 'extLst'), 'ext');
      const value = values[Number(child(ext, 'rvb')?.attrs.i)];
      const structure = structures[Number(value?.attrs.s)];
      if (structure?.attrs.t !== '_localImage') continue;
      const keyIndex = children(structure, 'k').findIndex(k => k.attrs.n === '_rvRel:LocalImageIdentifier');
      const rel = imageRels[Number(children(value, 'v')[keyIndex]?.text)];
      const imagePath = targets.get(rel?.attrs['r:id']);
      if (!imagePath?.startsWith('xl/media/') || !zip.file(imagePath)) throw new Error(`${sheet.attrs.name} ${cell.r}: embedded photo cannot be resolved.`);
      const extension = imagePath.split('.').at(-1);
      add(sheet.attrs.name, Number(cell.r.match(/\d+$/)?.[0]), photo(await zip.file(imagePath).async('uint8array'), extension, `Meter-${cell.r}.${extension}`, cell.r));
    }
  }
  return result;
}
