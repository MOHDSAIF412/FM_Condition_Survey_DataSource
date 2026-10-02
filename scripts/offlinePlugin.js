import fs from 'node:fs';
import { createHash } from 'node:crypto';

export function offlinePlugin() {
  return {
    name: 'fm-offline-shell', apply: 'build', enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => /\.(js|css|html|png|svg|woff2)$/.test(name));
      const assets = [...files.map((name) => `/${name}`), '/manifest.json', '/ocs-logo.png', '/ocs-logo-white.png', '/ocs_logo.png', '/icons/icon-192.png', '/icons/icon-512.png'];
      const version = createHash('sha256').update(files.map((name) => bundle[name].code || bundle[name].source).join('')).digest('hex').slice(0,16);
      const source = fs.readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}
