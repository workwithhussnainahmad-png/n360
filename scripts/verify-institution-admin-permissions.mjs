import { spawn } from 'node:child_process';
// Shared matrix verifies institution owner/admin boundaries and payment account permissions.
const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/verify-role-boundaries.ts'], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
