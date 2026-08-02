#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const ports = ['8143', '18151', '18152', '18153', '18154'];

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

if (process.platform === 'win32') {
  console.log('[recovery] resetting WSL state...');
  run('wsl.exe', ['--shutdown']);
}

const wslRepoRoot = toWslPath(repoRoot);
const bashScript = [
  'set -e',
  'for p in 8143 18151 18152 18153 18154; do',
  '  pids=$(fuser -n tcp "$p" 2>/dev/null || true)',
  '  for pid in $pids; do',
  '    kill -9 "$pid" 2>/dev/null || true',
  '  done',
  'done',
  `cd '${wslRepoRoot}'`,
  'export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser',
  'npm start',
].join('\n');

console.log('[recovery] launching Open Spatial Lab in Ubuntu...');
run('wsl.exe', ['-d', 'Ubuntu', 'bash', '-s'], {
  input: bashScript,
});
