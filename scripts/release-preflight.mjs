import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const names=['APP_IMAGE','MIGRATOR_IMAGE','WORKER_IMAGE','BACKUP_IMAGE','POSTGRES_IMAGE','PGBOUNCER_IMAGE','VALKEY_IMAGE','CADDY_IMAGE'];
try {
  if(!/^[A-Za-z0-9._-]{7,80}$/.test(process.env.RELEASE_REVISION || ''))throw Error('Set RELEASE_REVISION to the reviewed source revision');
  for(const name of names)if(!/^\S+@sha256:[a-f0-9]{64}$/.test(process.env[name] || ''))throw Error(`${name} must be an immutable image digest reference`);
  const result=spawnSync('docker',['compose','-f','docker-compose.yml','-f','deployment/compose.release.yml','config','--quiet'],{stdio:'inherit'});
  if(result.error || result.status!==0)throw Error('Release Compose validation failed');
  mkdirSync('deployment/releases',{recursive:true});
  writeFileSync(`deployment/releases/${process.env.RELEASE_REVISION}.json`,JSON.stringify({revision:process.env.RELEASE_REVISION,platform:'linux/arm64',validatedAt:new Date().toISOString(),images:Object.fromEntries(names.map(name=>[name,process.env[name]])),migration:'scripts/migrate-production.mjs --apply'},null,2));
  console.log('Release configuration validated; image identities recorded. No deployment performed.');
} catch(error){console.error(error.message);process.exitCode=1;}
