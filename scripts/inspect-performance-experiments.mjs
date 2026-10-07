import fs from 'node:fs';
import path from 'node:path';
const root = 'test-results/experiments';
const rows=[];
for(const folder of fs.readdirSync(root)){
 const dir=path.join(root,folder);
 if(!fs.statSync(dir).isDirectory())continue;
 for(const run of fs.readdirSync(dir).filter(n=>n.startsWith('run-'))){
  const file=path.join(dir,run,'summary.json');if(!fs.existsSync(file))continue;
  const m=JSON.parse(fs.readFileSync(file,'utf8')).metrics;
  const value=(name,key)=>m[name]?.values?.[key] ?? m[name]?.[key];
  const row={experiment:folder,run,dashboardP95:value('dashboard_ms','p(95)'),httpP95:value('http_req_duration','p(95)'),httpP99:value('http_req_duration','p(99)'),max:value('http_req_duration','max'),rps:value('http_reqs','rate'),errorRate:value('http_req_failed','rate') ?? value('http_req_failed','value'),failedRequests:value('http_req_failed','passes')??0,dropped:value('dropped_iterations','count')??0};
  row.businessErrorRate=value('business_fail','rate') ?? value('business_fail','value');
  row.businessFailures=value('business_fail','passes') ?? 0;
  row.failedChecks=value('checks','fails') ?? 0;
  rows.push(row);
  fs.writeFileSync(path.join(dir,run,'normalized-result.json'),JSON.stringify(row,null,2));
 }
}
const groups=Object.groupBy(rows,r=>r.experiment);
const variance=Object.fromEntries(Object.entries(groups).map(([name,group])=>[name,Object.fromEntries(['dashboardP95','httpP95','httpP99','rps'].map(metric=>{
 const values=group.map(r=>r[metric]); const mean=values.reduce((a,b)=>a+b,0)/values.length;
 const min=Math.min(...values),max=Math.max(...values);
 return [metric,{samples:values.length,mean,min,max,range:max-min,rangePercentOfMean:mean ? (max-min)/mean*100 : 0}];
}))]));
fs.writeFileSync('docs/performance-experiment-metrics.json',JSON.stringify({capturedAt:new Date().toISOString(),rows,variance},null,2));
console.log(JSON.stringify({rows,variance},null,2));
