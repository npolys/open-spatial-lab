#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(`[recovery] failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function toWslPath(winPath) {
  const normalized = winPath.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) {
    return normalized;
  }
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

// No `wsl.exe --shutdown` here, and no inline fuser-based port kill before `npm start` below —
// both were a broader hammer than the problem needs, now that stopOpenSpatialLab.sh (which
// launchOpenSpatialLab.sh, which `npm start` runs, already calls as its own first step) does a
// properly targeted job: owned-PID kill first, then a port-based fallback that kills anything on
// OSL's 5 configured ports regardless of owner (SIGTERM then SIGKILL, with a readiness wait) —
// the actual fix for a second, independent checkout silently holding a port. `wsl --shutdown`
// resets the *entire* WSL subsystem, which would also kill any unrelated work running in WSL, not
// just this app; it's no longer needed for OSL's own port conflicts specifically.
const wslRepoRoot = toWslPath(repoRoot);
const bashScript = [
  'set -e',
  `cd '${wslRepoRoot}'`,
  'export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser',
  'npm start',
].join('\n');

console.log('[recovery] launching Open Spatial Lab in Ubuntu...');
run('wsl.exe', ['-d', 'Ubuntu', 'bash', '-s'], {
  input: bashScript,
});
