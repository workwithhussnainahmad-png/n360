import fs from 'node:fs';
import path from 'node:path';
const directory=process.argv[2];
if(!directory) throw Error('Pass experiment run directory');
const read=file=>{
 const bytes=fs.readFileSync(file);return bytes[0]===255&&bytes[1]===254 ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/,'');
};
const run=JSON.parse(read(path.join(directory,'run.json')));
const environment=JSON.parse(read(path.join(directory,'../environment.json')));
const start=Date.parse(run.startedAt),finish=Date.parse(run.finishedAt);
const bounds=environment.scenario==='load'?[180000,480000]:environment.scenario==='spike'?[40000,100000]:environment.scenario==='stress'?[780000,1080000]:[10000,finish-start];
const quantile=(values,q)=>{const sorted=values.toSorted((a,b)=>a-b);if(!sorted.length)return null;return sorted[Math.floor((sorted.length-1)*q)];};
const apps={};
for(const app of environment.appCount===3?['app','app2','app3']:['app','app2']) {
 const source=path.join('.codex/performance-observer',app);
 const rows=fs.readdirSync(source).filter(f=>f.endsWith('.jsonl')).flatMap(file=>read(path.join(source,file)).split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}})).filter(r=>Date.parse(r.time)>=start&&Date.parse(r.time)<=finish).toSorted((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 const peak=rows.filter(r=>Date.parse(r.time)>=start+bounds[0]&&Date.parse(r.time)<=start+bounds[1]);
 function onset(predicate){for(let i=0;i<rows.length-2;i++){if(rows.slice(i,i+3).every(predicate))return {utc:rows[i].time,secondsSinceStart:(Date.parse(rows[i].time)-start)/1000};}return null;}
 const first=rows[0],last=rows.at(-1);
 const cache=last?.cache ? Object.fromEntries(Object.entries(last.cache).map(([k,v])=>[k,v-(first?.cache?.[k]??0)])):{};
 apps[app]={samples:rows.length,peakSamples:peak.length,peakWindowSeconds:bounds.map(n=>n/1000),
  peakEluMedian:quantile(peak.map(r=>r.elu),.5),peakEluP95:quantile(peak.map(r=>r.elu),.95),
  peakIntervalLagP95MedianMs:quantile(peak.map(r=>r.lagMs.p95),.5),peakIntervalLagP95P95Ms:quantile(peak.map(r=>r.lagMs.p95),.95),
  peakLargestLagMs:peak.length?Math.max(...peak.map(r=>r.lagMs.max)):null,
  peakCpuMedianPercent:quantile(peak.map(r=>r.cpuPercent),.5),
  peakPoolWaitingMax:peak.length?Math.max(...peak.map(r=>r.pools?.foreground?.waiting??0)):null,
  peakPoolWaitingMedian:quantile(peak.map(r=>r.pools?.foreground?.waiting??0),.5),
  peakRssMaxBytes:peak.length?Math.max(...peak.map(r=>r.memory.rss)):null,
  firstThreeSamplesEluAbove95Percent:onset(r=>r.elu>=.95),
  firstThreeSamplesPoolWaiting:onset(r=>(r.pools?.foreground?.waiting??0)>0),cacheDeltas:cache};
 fs.writeFileSync(path.join(directory,`${app}-observer.jsonl`),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
}
const result={run,environment,apps,limitations:'ELU and queue samples establish observed pressure, not exclusive causation or precise host scheduling. 20-ms monitor resolution creates an idle lag floor near 20ms. Three-sample onset is a diagnostic convention, not a hard capacity gate.'};
fs.writeFileSync(path.join(directory,'observer-analysis.json'),JSON.stringify(result,null,2));
const displayed=process.argv.includes('--brief')?Object.fromEntries(Object.entries(apps).map(([name,value])=>[name,Object.fromEntries(Object.entries(value).filter(([key])=>key!=='cacheDeltas'))])):apps;
console.log(JSON.stringify({run,apps:displayed,scenario:environment.scenario,images:environment.images},null,2));
