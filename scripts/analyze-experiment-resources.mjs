import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2];if(!dir)throw Error('Pass run directory');
const read=file=>{const b=fs.readFileSync(file);return b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8').replace(/^\uFEFF/,'');};
const lines=file=>read(file).split('\n').filter(Boolean).map(JSON.parse);
const run=JSON.parse(read(path.join(dir,'run.json'))),env=JSON.parse(read(path.join(dir,'../environment.json')));
const start=Date.parse(run.startedAt),end=Date.parse(run.finishedAt);
const bounds=env.scenario==='load'?[start+180000,start+480000]:env.scenario==='spike'?[start+40000,start+100000]:env.scenario==='stress'?[start+780000,start+1080000]:[start+10000,end];
const q=(v,p)=>{const s=v.toSorted((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)*p)]:null;};
const result={windowUtc:bounds.map(t=>new Date(t).toISOString()),containers:{},sql:[]};
const summaryFile=path.join(dir,'summary.json');
const requestCount=fs.existsSync(summaryFile)?JSON.parse(read(summaryFile)).metrics.http_reqs.count:0;
const stats=path.join(dir,'docker-engine-stats.jsonl');
if(fs.existsSync(stats)){
 const captured=lines(stats).filter(r=>r.cpuPercent!==null);
 const all=captured.filter(r=>Date.parse(r.time)>=bounds[0]&&Date.parse(r.time)<=bounds[1]);
 for(const [name,rows]of Object.entries(Object.groupBy(all,r=>r.name))){
  const whole=captured.filter(r=>r.name===name&&Date.parse(r.time)>=start&&Date.parse(r.time)<=end);
  const cpuMs=whole.length>1?(whole.at(-1).cpuTotalNs-whole[0].cpuTotalNs)/1e6:null;
  const firstMinute=rows.filter(r=>Date.parse(r.time)<bounds[0]+60000);
  const lastMinute=rows.filter(r=>Date.parse(r.time)>bounds[1]-60000);
  result.containers[name]={samples:rows.length,cpuMedianPercent:q(rows.map(r=>r.cpuPercent),.5),cpuP95Percent:q(rows.map(r=>r.cpuPercent),.95),cpuMaxPercent:Math.max(...rows.map(r=>r.cpuPercent)),memoryMaxBytes:Math.max(...rows.map(r=>r.memoryUsage||0)),peakFirstMinuteMemoryMedianBytes:q(firstMinute.map(r=>r.memoryUsage),.5),peakLastMinuteMemoryMedianBytes:q(lastMinute.map(r=>r.memoryUsage),.5),wholeRunCpuMs:cpuMs,wholeRunCpuMsPerRequest:requestCount&&cpuMs!==null?cpuMs/requestCount:null,cpuThrottledTimeNsMax:Math.max(...rows.map(r=>r.throttling?.throttled_time||0))};
 }
}
const generator=path.join(dir,'generator-stats.jsonl');
if(fs.existsSync(generator)){
 const rows=lines(generator).filter(r=>Date.parse(r.time)>=bounds[0]&&Date.parse(r.time)<=bounds[1]);
 result.generator={samples:rows.length,cpuMedianPercent:q(rows.map(r=>r.cpuPercent),.5),cpuP95Percent:q(rows.map(r=>r.cpuPercent),.95),workingSetMaxBytes:Math.max(...rows.map(r=>r.workingSet))};
}
const before=path.join(dir,'pg-stat-before.json'),after=path.join(dir,'pg-stat-statements.json');
if(fs.existsSync(before)&&fs.existsSync(after)){
 const previous=new Map((JSON.parse(read(before))||[]).map(r=>[r.query,r]));
 result.sql=(JSON.parse(read(after))||[]).flatMap(row=>{
  const old=previous.get(row.query),calls=row.calls-(old?.calls||0),ms=row.total_exec_time-(old?.total_exec_time||0);
  const plans=row.plans===undefined?null:row.plans-(old?.plans||0),planning=row.total_plan_time===undefined?null:row.total_plan_time-(old?.total_plan_time||0);
  return calls>0?[{sql:row.query,calls,plans,totalPlanningMs:planning,meanPlanningMs:plans?planning/plans:null,totalExecutionMs:ms,meanExecutionMs:ms/calls,globalMaximumExecutionMs:row.max_exec_time,sharedHits:row.shared_blks_hit-(old?.shared_blks_hit||0),sharedReads:row.shared_blks_read-(old?.shared_blks_read||0)}]:[];
 }).toSorted((a,b)=>b.meanExecutionMs-a.meanExecutionMs);
}
result.limitations='CPU percentages normalize one core to 100%; Docker has four virtual CPUs. CPU samples do not establish exclusive physical-core access. SQL planning/execution use counter deltas; planning is available only when enabled for the run. The execution maximum is cumulative, not a test-window maximum. Post-run snapshots can include finishing refresh work. An exploratory run does not establish production capacity.';
fs.writeFileSync(path.join(dir,'resource-analysis.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,sql:result.sql.slice(0,3).map(r=>({...r,sql:r.sql.slice(0,180)}))},null,2));
