import { spawnSync } from 'node:child_process';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run verify:release.');
for (const args of [
  ['audit','--audit-level=moderate'],
  ['exec','--','vitest','run','--maxWorkers=2','--testTimeout=30000','--hookTimeout=30000']
]) {
  // Tests must never inherit production database access from the deployment.
  const result = spawnSync(process.execPath,[npm,...args], { stdio:'inherit', env:{...process.env,VITE_SUPABASE_URL:'',VITE_SUPABASE_ANON_KEY:''} });
  if (result.status !== 0) process.exit(result.status || 1);
}
