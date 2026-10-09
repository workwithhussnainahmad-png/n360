import { spawnSync } from 'node:child_process';
// Explicit local build tool. Never pushes images or starts application services.
const revision=process.argv[2];
if(!/^[A-Za-z0-9._-]{7,80}$/.test(revision || ''))throw Error('Usage: node scripts/build-release.mjs <reviewed-source-revision>');
const targets=[['app','runner'],['migrate','migrator'],['workers','push-receipt-worker']];
for(const [name,target] of targets){
  const publicArgs=target==='runner' ? ['--build-arg',`NEXT_PUBLIC_APP_DOMAIN=${process.env.NEXT_PUBLIC_APP_DOMAIN || 'nisaab360.app'}`,'--build-arg',`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ''}`] : [];
  const result=spawnSync('docker',['buildx','build','--platform','linux/arm64','--load','--target',target,'--build-arg',`NISAAB360_BUILD_ID=${revision}`,...publicArgs,'--label',`org.opencontainers.image.revision=${revision}`,'-t',`nisaab360-${name}:${revision}`,'.'],{stdio:'inherit'});
  if(result.error || result.status!==0)process.exit(result.status || 1);
}
const backup=spawnSync('docker',['buildx','build','--platform','linux/arm64','--load','--label',`org.opencontainers.image.revision=${revision}`,'-t',`nisaab360-backup:${revision}`,'backup'],{stdio:'inherit'});
if(backup.error || backup.status!==0)process.exit(backup.status || 1);
console.log('Local ARM64 artifacts built. Record registry digests after your authorized publish step.');
