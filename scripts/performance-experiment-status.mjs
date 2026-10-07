import fs from 'node:fs';
import path from 'node:path';
for(const app of ['app','app2']){
 const dir=path.join('.codex/performance-observer',app);
 const rows=fs.readdirSync(dir).filter(f=>f.endsWith('.jsonl')).flatMap(file=>{
  const descriptor=fs.openSync(path.join(dir,file),'r');
  const size=fs.fstatSync(descriptor).size,buffer=Buffer.alloc(Math.min(size,65536));
  fs.readSync(descriptor,buffer,0,buffer.length,size-buffer.length);fs.closeSync(descriptor);
  return buffer.toString().split('\n').filter(Boolean).slice(-2).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 });
 const row=rows.toSorted((a,b)=>Date.parse(b.time)-Date.parse(a.time))[0];
 console.log(JSON.stringify({app,time:row?.time,elu:row?.elu,cpu:row?.cpuPercent,lagP95:row?.lagMs.p95,pools:row?.pools,rssMiB:row?.memory.rss/1048576}));
}
