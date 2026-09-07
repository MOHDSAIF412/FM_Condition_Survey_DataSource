/**
 * One command to push a change out to the live web app and to every installed
 * Android app: `npm run ship "what changed"`.
 *
 * Commits whatever is currently changed, pushes to GitHub, and stops there.
 * Vercel does the rest -- it rebuilds, which regenerates the OTA bundle and
 * manifest, and phones pick the new bundle up on their next launch.
 *
 * No APK rebuild is needed for anything that lives in src/. Only native changes
 * (new plugins, permissions, icons, Android config) still need a new APK.
 */
import { execSync } from 'node:child_process';

const message = process.argv.slice(2).join(' ').trim() || 'Update survey app';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

if (!read('git status --porcelain')) {
  console.log('Nothing to ship - no changes.');
  process.exit(0);
}

console.log(`\nShipping: ${message}\n`);
run('git add -A');
run(`git commit -m ${JSON.stringify(message)}`);
run('git push');

console.log(`
Pushed. Vercel is rebuilding now.

  Web    live in about a minute at
         https://fm-condition-survey-data-source.vercel.app
  Phones pick up the update the next time the app is opened
         (it downloads in the background, then applies on the following launch)

No new APK needed unless you changed native Android config.
`);
