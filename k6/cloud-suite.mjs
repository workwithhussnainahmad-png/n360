import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {startMonitors} from './monitor.mjs';
import {createInterface} from 'node:readline';
import {captureProfiles} from './capture-profiles.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const type=process.argv[2]||'load',vus=process.argv[3]||'1500';
const accountMode=process.argv[4]||'distinct';
const latencyMode=process.argv[5]||'strict';
const profileMode=process.argv[6]||'none';
if(!['none','profile'].includes(profileMode)||profileMode==='profile'&&type!=='stress')throw Error('CPU capture requires stress workload');
if(!['strict','observe'].includes(latencyMode))throw Error('Invalid latency mode');
if(!['distinct','reuse'].includes(accountMode))throw Error('Invalid account mode');
if(!['load','spike','stress'].includes(type)||!/^\d+$/.test(vus)||Number(vus)<1||Number(vus)>10000)throw Error('Invalid workload');
const cloudKey=path.join(os.homedir(),'Downloads/n360-k6.pem'),appKey=path.join(os.homedir(),'Downloads/nisaab360/nisaab360-mumbai.pem');
const cloud='admin@13.233.63.56',app='admin@3.108.59.3';
const stamp='cloud-'+new Date().toISOString().replace(/[:.]/g,'-'),folder=path.join(root,'test-results',stamp);
const ssh=key=>['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key];
function run(exe,args,extra={}){const r=spawnSync(exe,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,...extra});if(r.error||r.status!==0)throw Error(`${exe} step failed; no credential output logged`);return r.stdout;}
const lockPath=path.join(root,'.codex/aws-k6/server-suite.lock');fs.mkdirSync(path.dirname(lockPath),{recursive:true});
const lock=fs.openSync(lockPath,'wx');fs.writeSync(lock,String(process.pid));
let stop,child,remoteLocked=false,profileCapture;
try{
 run('ssh',[...ssh(cloudKey),cloud,'mkdir /home/admin/n360-k6/.run-lock']);remoteLocked=true;
 fs.mkdirSync(folder,{recursive:true});
 console.log(`Generator: ${cloud}\nDirect origin: 3.108.59.3\nLocal results: ${folder}`);
 console.log(`Preparing ${type}, peak ${vus} VUs: uploading scripts and refreshing tokens...`);
 for(const [dir,files] of Object.entries({'':['config.js','cloud-worker.mjs'],lib:['tokens.js','diagnostics.js','diagnostic-policy.mjs','workload.mjs','report.mjs'],scripts:['load.js','spike.js','stress.js']})){
  run('scp',['-q','-i',cloudKey,...files.map(f=>path.join(root,'k6',dir,f)),`${cloud}:/home/admin/n360-k6/k6/${dir}/`]);
 }
 const tokens=run('ssh',[...ssh(appKey),app,'cd /opt/nisaab360/n360 && docker compose exec -T app node -'],{input:fs.readFileSync(path.join(root,'k6/export-student-tokens.cjs'))});
 const pool=JSON.parse(tokens).tokens||[];
 if(!pool.length)throw Error('No existing student accounts were exported.');
 if(accountMode==='distinct'&&pool.length<Number(vus))throw Error(`Need ${vus} distinct existing students; export has ${pool.length}.`);
 console.log(`Accounts: ${pool.length} prepared students for ${vus} VUs; mode ${accountMode}. Extra VUs reuse accounts in round-robin order.`);
 run('ssh',[...ssh(cloudKey),cloud,'umask 077; cat > /home/admin/n360-k6/k6/tokens.json'],{input:tokens});
 // Collect origin metrics through existing local SSH access; private keys stay here.
 console.log('Starting monitoring; remote test progress will update every 10 seconds.');
 stop=await startMonitors(root,folder,appKey,app,message=>{console.error(message);child?.kill('SIGINT');});
 child=spawn('ssh',[...ssh(cloudKey),cloud,`cd /home/admin/n360-k6 && node k6/cloud-worker.mjs ${stamp} ${type} ${vus} ${accountMode} ${latencyMode} ${profileMode}`],{windowsHide:true,stdio:['ignore','pipe','inherit']});
 createInterface({input:child.stdout}).on('line',line=>{
  console.log(line);
  if(profileMode==='profile'&&line==='PROFILE_WINDOW_START'&&!profileCapture){
   profileCapture=captureProfiles(root,folder,appKey,app,stamp).catch(error=>console.error(`Profile collection failed: ${error.message}`));
  }
 });
 process.once('SIGINT',()=>child.kill('SIGINT'));
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 console.log('Downloading results...');
 run('scp',['-q','-r','-i',cloudKey,`${cloud}:/home/admin/n360-k6/test-results/${stamp}/.`,folder]);
 console.log(`Downloaded results: ${folder}`);process.exitCode=code??1;
 if(profileMode==='profile'&&!profileCapture)console.error('CPU capture window was not reached; no profiles collected.');
}finally{
 if(profileCapture)await profileCapture;
 if(stop)await stop();
 if(remoteLocked)run('ssh',[...ssh(cloudKey),cloud,'rm -f /home/admin/n360-k6/k6/tokens.json; rmdir /home/admin/n360-k6/.run-lock']);
 fs.closeSync(lock);fs.unlinkSync(lockPath);
}
