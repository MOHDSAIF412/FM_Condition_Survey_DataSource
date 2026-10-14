import { createHash } from 'node:crypto';
const origin='https://fm-condition-survey-data-source.vercel.app';
const get = async path => {
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000),cache:'no-store'});
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
};
const page=await get('/?health='+Date.now());
for (const header of ['content-security-policy','x-frame-options','x-content-type-options','strict-transport-security']) {
  if (!page.headers.get(header)) throw new Error(`Missing security header: ${header}`);
}
const manifest=await (await get('/ota/manifest.json?health='+Date.now())).json();
if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.path!==`/ota/bundle-${manifest.version}.zip` || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid update manifest');
const bundle=Buffer.from(await(await get(manifest.path)).arrayBuffer());
if(createHash('sha256').update(bundle).digest('hex')!==manifest.sha256)throw new Error('Update bundle checksum mismatch');
console.log(`Live app and update ${manifest.version} passed header, availability and integrity checks.`);
