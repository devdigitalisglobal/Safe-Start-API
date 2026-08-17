import { spawnSync } from 'node:child_process';

/** Install Puppeteer's managed Chrome when missing (needed for dashboard PDF export). */
if (process.env.VERCEL) {
  process.exit(0);
}
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['puppeteer', 'browsers', 'install', 'chrome'],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (result.status !== 0) {
  console.warn(
    '[safe-start-api] Puppeteer Chrome install skipped or failed. PDF export may require system Chrome or `npx puppeteer browsers install chrome`.'
  );
}
