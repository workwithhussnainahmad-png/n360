import fs from 'node:fs';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {workload} from './lib/workload.mjs';
import {createReport} from './lib/report.mjs';

process.chdir('/home/admin/n360-k6');
const [stamp,type='load',value='1500',accountMode='distinct',latencyMode='strict',profileMode='none']=process.argv.slice(2);
if(!['none','profile'].includes(profileMode)||profileMode==='profile'&&type!=='stress')throw Error('Invalid profile mode');
if(!['strict','observe'].includes(latencyMode))throw Error('Invalid latency mode');
if(!['distinct','reuse'].includes(accountMode))throw Error('Invalid account mode');
if(!/^cloud-\d{4}-[\dTZ-]+$/.test(stamp)||!['load','spike','stress'].includes(type))throw Error('Invalid run');
const vus=Number(value),env={TARGET_VUS:value,MAX_VUS:value,SPIKE_VUS:value,THINK_SEC:String({load:1.5,stress:0.5,spike:0.3}[type]),STAGE_SCALE:'1',DURATION:'5m'};
const plan=workload(type,env),folder=`test-results/${stamp}`;
env.ALLOW_ACCOUNT_REUSE=String(accountMode==='reuse');
env.DISABLE_LATENCY_THRESHOLDS=String(latencyMode==='observe');
const prepared=JSON.parse(fs.readFileSync('k6/tokens.json','utf8')).tokens.filter(t=>t.roleHint==='STUDENT');
const distinctAccounts=new Set(prepared.map(t=>JSON.parse(Buffer.from(t.accessToken.split('.')[1],'base64url').toString()).userId)).size;
if(!distinctAccounts||distinctAccounts!==prepared.length)throw Error('Student token pool must contain distinct accounts.');
if(accountMode==='distinct'&&distinctAccounts<vus)throw Error('Not enough distinct accounts.');
const accounts={mode:accountMode,preparedAccounts:distinctAccounts,activeDistinctAccounts:Math.min(vus,distinctAccounts),reusedVuSlots:Math.max(0,vus-distinctAccounts),assignment:'round-robin',sharedAccounts:vus>distinctAccounts};
console.log(`Workload: ${vus} VUs, ${accounts.activeDistinctAccounts} distinct students, ${accounts.reusedVuSlots} VUs sharing accounts.`);
fs.mkdirSync(folder,{recursive:true});
const report=createReport(plan);
const manifest={startedAt:new Date().toISOString(),target:'https://student.nisaab360.app',originIp:'3.108.59.3',generator:os.hostname(),cpus:os.cpus().length,memory:os.totalmem(),workload:plan,k6Version:spawnSync('k6',['version'],{encoding:'utf8'}).stdout.trim(),status:'running',sourceHashes:{}};
manifest.accounts=accounts;
manifest.profiling={requested:profileMode==='profile',durationSeconds:30,peakOffsetSeconds:20};
manifest.acceptance={latencyThresholdsEnabled:latencyMode==='strict',errorThresholdsEnabled:true};
console.log(`Latency limits: ${latencyMode==='strict'?'enabled':'disabled (measurement only; a pass does not certify latency)'}. Error checks remain enabled.`);
for(const file of ['config.js','lib/tokens.js','lib/diagnostics.js','lib/diagnostic-policy.mjs','lib/workload.mjs',`scripts/${type}.js`])manifest.sourceHashes[file]=createHash('sha256').update(fs.readFileSync('k6/'+file)).digest('hex');
const save=()=>fs.writeFileSync(folder+'/manifest.json',JSON.stringify(manifest,null,2));
save();
fs.writeFileSync(folder+'/k6-config.json',JSON.stringify({hosts:{'student.nisaab360.app':'3.108.59.3'}}));
const out=fs.createWriteStream(folder+'/stdout.log'),err=fs.openSync(folder+'/stderr.log','w');
const args=['run','--quiet','--no-usage-report','--include-system-env-vars=false','--address','127.0.0.1:0','--config',folder+'/k6-config.json','--out','json=-','--summary-export',folder+'/summary.json','-e','BASE_URL=https://student.nisaab360.app','-e','TEST_ROLE=STUDENT','-e','PERF_DIAGNOSTICS=true',...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),`k6/scripts/${type}.js`];
const child=spawn('k6',args,{env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:['ignore','pipe',err]});
let interrupted=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{interrupted=true;child.kill('SIGINT');});
const lines=createInterface({input:child.stdout});
const workerStarted=Date.now();
let trafficStarted,profileTimer;
const clock=seconds=>{const n=Math.max(0,Math.ceil(seconds));return `${Math.floor(n/60)}m${String(n%60).padStart(2,'0')}s`;};
const progress=()=>{
 const elapsed=(Date.now()-workerStarted)/1000;
 if(trafficStarted===undefined){console.log(`[${type}] Initializing | elapsed ${clock(elapsed)} | scheduled traffic ${clock(plan.totalSeconds)} (countdown starts with traffic)`);return;}
 const trafficElapsed=(Date.now()-trafficStarted)/1000;
 const stage=plan.windows.findIndex(w=>trafficElapsed>=w.startSeconds&&trafficElapsed<w.endSeconds);
 const phase=stage<0?'finishing requests / writing results':`${plan.windows[stage].name}, stage ${stage+1}/${plan.stages.length}, target ${plan.stages[stage].target} VUs`;
 console.log(`[${type}] ${phase} | elapsed ${clock(elapsed)} | ${stage<0?'waiting for completion':`estimated traffic remaining ${clock(plan.totalSeconds-trafficElapsed)}`}`);
};
lines.on('line',line=>{try{const p=JSON.parse(line);if(['Point','Metric'].includes(p.type)){
 // First workload response anchors an approximate countdown, excluding initialization.
 if(trafficStarted===undefined&&p.type==='Point'&&p.metric==='diag_request_ms'){
  const timestamp=Date.parse(p.data.time);
  trafficStarted=Number.isFinite(timestamp)?timestamp:Date.now();progress();
  if(profileMode==='profile')profileTimer=setTimeout(()=>console.log('PROFILE_WINDOW_START'),Math.max(0,(plan.windows.find(w=>w.name==='peak').startSeconds+20)*1000-(Date.now()-trafficStarted)));
 }
 report.ingest(p);return;
}}catch{}out.write(line+'\n');});
progress();const progressTimer=setInterval(progress,10000);
const sample=()=>{
 const row={time:new Date().toISOString()};
 for(const [key,file] of Object.entries({cpu:'/proc/stat',memory:'/proc/meminfo',network:'/proc/net/dev',tcp:'/proc/net/netstat',snmp:'/proc/net/snmp',k6:`/proc/${child.pid}/stat`,k6Status:`/proc/${child.pid}/status`}))try{row[key]=fs.readFileSync(file,'utf8');}catch{}
 fs.appendFileSync(folder+'/generator-metrics.jsonl',JSON.stringify(row)+'\n');
};
sample();const sampler=setInterval(sample,5000);
const deadline=setTimeout(()=>{interrupted=true;child.kill('SIGINT');},25*60*1000);
let code;
try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
finally{clearTimeout(profileTimer);clearInterval(progressTimer);clearInterval(sampler);clearTimeout(deadline);sample();out.end();fs.closeSync(err);fs.writeFileSync(folder+'/diagnostics.json',JSON.stringify(report.finish(),null,2));manifest.finishedAt=new Date().toISOString();manifest.exitCode=code;manifest.status=interrupted?'interrupted':code===0?'passed':code===99?'thresholds-failed':'execution-failed';save();}
console.log(`Results saved: ${folder} (${manifest.status})`);
process.exitCode=code??1;
