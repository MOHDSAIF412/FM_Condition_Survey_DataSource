/**
 * Packages the built web app as an over-the-air (OTA) bundle.
 *
 * Run after `vite build`. It zips everything in dist/ (index.html at the zip
 * root, which is what the updater plugin requires) and writes:
 *
 *   dist/ota/bundle-<version>.zip   the bundle the phone downloads
 *   dist/ota/manifest.json          what version is current, and where it lives
 *
 * Both land inside dist/, so Vercel serves them as static files on the same
 * deployment as the web app. api/ota.js reads the manifest and tells the app
 * whether it is behind.
 *
 * The version is minutes-since-2020 so it always increases between deploys and
 * is still valid semver. Nothing needs to be bumped by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OTA_DIR = path.join(DIST, 'ota');

const EPOCH_2020 = Date.UTC(2020, 0, 1);
const version = `1.0.${Math.floor((Date.now() - EPOCH_2020) / 60000)}`;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[ota] dist/index.html not found - run `vite build` first.');
  process.exit(1);
}

// Start clean so an old bundle is never zipped into the new one.
fs.rmSync(OTA_DIR, { recursive: true, force: true });

function collect(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (rel === 'ota') continue; // never package the bundle inside itself
      out.push(...collect(abs, rel));
    } else {
      out.push({ abs, rel });
    }
  }
  return out;
}

const files = collect(DIST);
const zip = new JSZip();
for (const f of files) zip.file(f.rel, fs.readFileSync(f.abs));

const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 }
});

fs.mkdirSync(OTA_DIR, { recursive: true });
const zipName = `bundle-${version}.zip`;
fs.writeFileSync(path.join(OTA_DIR, zipName), buf);

const manifest = {
  version,
  path: `/ota/${zipName}`,
  sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  builtAt: new Date().toISOString(),
  fileCount: files.length,
  bytes: buf.length
};
fs.writeFileSync(path.join(OTA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(
  `[ota] ${zipName}  ${(buf.length / 1024 / 1024).toFixed(2)} MB  ` +
  `${files.length} files  version ${version}`
);
