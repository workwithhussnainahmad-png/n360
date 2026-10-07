/** Assemble saved measurements and a sanitized post-test snapshot; no requests or mutations. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const root='test-results/experiments';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const folders=fs.readdirSync(root);
const find=label=>{
 const folder=folders.filter(name=>name.endsWith('-'+label)).sort().at(-1);
 if(!folder)throw Error('Missing experiment: '+label);
 return path.join(root,folder,'run-1');
};
const final=['load','spike','stress'].map(scenario=>{
 const directory=find('final-production-'+scenario);
 const summary=read(path.join(directory,'summary.json'));
 const value=(name,key)=>summary.metrics[name]?.values?.[key]??summary.metrics[name]?.[key];
 const metrics=read(path.join(directory,'normalized-result.json'));
 const tagged=Object.fromEntries(Object.entries(summary.metrics).filter(([name])=>name.includes('{')).map(([name,metric])=>[name,metric.values??metric]));
 return {scenario,directory:directory.replaceAll('\\','/'),run:read(path.join(directory,'run.json')),
  metrics:{...metrics,requests:value('http_reqs','count'),passedChecks:value('checks','passes')},tagged,
  gates:{dashboard:metrics.dashboardP95<500,httpP95:metrics.httpP95<1000,httpP99:metrics.httpP99<2000,
   errors:metrics.failedRequests===0&&metrics.businessFailures===0&&metrics.failedChecks===0},
  resources:read(path.join(directory,'resource-analysis.json')),
  applicationLogBytes:Object.fromEntries(['app.log','app2.log'].map(name=>[name,fs.statSync(path.join(directory,name)).size]))};
});
const labels=['populated-linux-log-control','native-warm-candidate','native-plus-light-request',
 'native-light-direct-two','native-light-minimum1024','native-light-proxy-observer-off',
 'native-light-rebuilt-control','short-fill-wait','narrow-notices','boolean-course','bounded-daily-timetable',
 'short-wait-repeat-control','short-wait-repeat-on','three-replica-comparison'];
const phases=labels.map(label=>{
 const directory=find(label),file=path.join(directory,'observer-analysis.json');
 if(!fs.existsSync(file))return {label,observationAvailable:false};
 const observation=read(file);
 return {label,directory:directory.replaceAll('\\','/'),apps:Object.fromEntries(Object.entries(observation.apps).map(([name,a])=>[name,{
  peakEluMedian:a.peakEluMedian,peakIntervalLagP95MedianMs:a.peakIntervalLagP95MedianMs,
  peakPoolWaitingMedian:a.peakPoolWaitingMedian,peakPoolWaitingMax:a.peakPoolWaitingMax,
  firstThreeSamplesEluAbove95Percent:a.firstThreeSamplesEluAbove95Percent,
  firstThreeSamplesPoolWaiting:a.firstThreeSamplesPoolWaiting,cacheDeltas:a.cacheDeltas}]))};
});
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true}).trim();
const containers=['lms-backend-app-1','nisaab360-app2','lms-backend-caddy-1','lms-backend-postgres-1','lms-backend-pgbouncer-1','lms-backend-valkey-1'].map(name=>{
 const c=JSON.parse(docker(['inspect',name]))[0];
 return {name,image:c.Image,startedAt:c.State.StartedAt,health:c.State.Health?.Status,status:c.State.Status,
  restartCount:c.RestartCount,oomKilled:c.State.OOMKilled,cpuQuota:c.HostConfig.CpuQuota,nanoCpus:c.HostConfig.NanoCpus,memoryLimit:c.HostConfig.Memory};
});
const sql="SELECT json_build_object('sharedPreload',current_setting('shared_preload_libraries'),'slowLogMs',current_setting('log_min_duration_statement'),'maxConnections',current_setting('max_connections'));";
const database=JSON.parse(docker(['exec','lms-backend-postgres-1','psql','-U','app','-d','app','-t','-A','-c',sql]));
const logs=Object.fromEntries(containers.map(({name})=>{
 const result=spawnSync('docker',['logs','--since',final[0].run.startedAt,name],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 if(result.status!==0)throw Error('Cannot inspect final test-window logs for '+name);
 const lines=(result.stdout+'\n'+result.stderr).split(/\r?\n/).filter(line=>line.trim());
 return [name,{lineCount:lines.length,errorLines:lines.filter(line=>/\b(error|fatal|panic|exception)\b/i.test(line)).length,
  timeoutLines:lines.filter(line=>/timeout|timed out/i.test(line)).length,
  connectionRefusedLines:lines.filter(line=>/connection refused/i.test(line)).length,
  oomLines:lines.filter(line=>/out of memory|oomkilled/i.test(line)).length}];
}));
const sourceFiles=['Dockerfile','.dockerignore','docker-compose.yml','docker-compose.k6.yml','Caddyfile.k6',
 'scripts/standalone-server.cjs','scripts/hot-lane-request.cjs','src/lib/native-json-response.ts',
 'src/lib/auth-edge.ts','src/lib/user.ts','src/lib/auth.ts','src/lib/rbac.ts','src/lib/cors.ts',
 'src/lib/redis.ts','src/lib/dashboard-response.ts','src/lib/course-streaming.ts','src/lib/announcements.ts',
 'src/lib/cache-observation.ts','src/db/index.ts','src/app/api/student/dashboard/route.ts',
 'src/app/api/staff/dashboard/route.ts','src/app/api/student/timetable/route.ts',
 'src/app/api/staff/timetable/route.ts','src/app/api/student/profile/route.ts','src/app/api/staff/profile/route.ts',
 'k6/config.js','k6/scripts/load.js','k6/scripts/spike.js','k6/scripts/stress.js'];
const sourceFingerprints=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const evidence={capturedAt:new Date().toISOString(),final,phases,postTest:{containers,database,logs},sourceFingerprints,
 limitations:['No Git directory or commit is available; file hashes identify reviewed source.',
 'Final serving application/SQL/proxy profilers are disabled; final ELU, pool waits and SQL ranks are unavailable.',
 'Phase onset uses three consecutive 1-second ELU >=.95 or nonzero pool-wait samples, not proof of first system-wide saturation.',
 'Generator and Docker share a physical host; WSL processor count does not establish exclusive CPU affinity.']};
fs.writeFileSync('docs/performance-experiments/final-acceptance.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({final:final.map(({scenario,metrics,gates})=>({scenario,metrics,gates})),
 phases:phases.map(({label,apps})=>({label,apps:Object.fromEntries(Object.entries(apps??{}).map(([n,a])=>[n,{elu:a.peakEluMedian,
  eluOnset:a.firstThreeSamplesEluAbove95Percent?.secondsSinceStart,poolOnset:a.firstThreeSamplesPoolWaiting?.secondsSinceStart}]))})),
 postTest:evidence.postTest},null,2));
