import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const configuredBuildId = process.env.NISAAB360_BUILD_ID?.trim();
const buildId = configuredBuildId || Date.now().toString();
const nextBin = resolve('node_modules', 'next', 'dist', 'bin', 'next');

process.stdout.write(`Building Nisaab360 version ${buildId}\n`);

const child = spawn(process.execPath, [nextBin, 'build', '--webpack'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
});

child.on('error', (error) => {
  console.error('Could not start the Next.js build:', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Next.js build stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
