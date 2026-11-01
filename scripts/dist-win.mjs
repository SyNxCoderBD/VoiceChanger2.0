import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const builder = resolve(root, 'node_modules/electron-builder/cli.js');
const result = spawnSync(process.execPath, [builder, '--win', 'portable', '--x64'], {
  cwd: root,
  env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '5' },
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;