/** Docker Engine's timestamped 1-second stream, rather than CLI refresh frames. */
import fs from 'node:fs';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
const output=process.argv[2];
if(!output) throw Error('Pass output JSONL path');
const maxSamples=Number(process.argv[3]||0);
const context=execFileSync('docker',['context','show'],{encoding:'utf8',windowsHide:true}).trim();
const host=execFileSync('docker',['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',windowsHide:true}).trim();
if(!host.startsWith('npipe:////./pipe/')) throw Error('This collector supports the inspected Windows Docker named pipe');
const socketPath='\\\\.\\pipe\\'+host.slice('npipe:////./pipe/'.length);
const containers=['lms-backend-app-1','nisaab360-app2','lms-backend-caddy-1','lms-backend-postgres-1','lms-backend-pgbouncer-1','lms-backend-valkey-1'];
if(process.env.PERFORMANCE_APP3==='1')containers.push('nisaab360-app3');
const sink=fs.createWriteStream(output,{flags:'a'});
await Promise.all(containers.map(name=>new Promise((resolve,reject)=>{
 let samples=0;
 const request=http.get({socketPath,path:`/containers/${name}/stats?stream=true`},response=>{
  if(response.statusCode!==200){response.resume();reject(Error(`${name}: HTTP ${response.statusCode}`));return;}
  let pending='';response.setEncoding('utf8');
  response.on('data',chunk=>{
   pending+=chunk;
   let index;
   while((index=pending.indexOf('\n'))!==-1){
    const line=pending.slice(0,index);pending=pending.slice(index+1);if(!line.trim())continue;
    const s=JSON.parse(line),c=s.cpu_stats,p=s.precpu_stats;
    const delta=c.cpu_usage.total_usage-p.cpu_usage.total_usage;
    const system=c.system_cpu_usage-p.system_cpu_usage;
    const cpus=c.online_cpus||c.cpu_usage.percpu_usage?.length||0;
    const networks=Object.values(s.networks||{});
    const row={time:s.read,previousTime:s.preread,name,
     cpuPercent:system>0&&delta>=0?100*delta/system*cpus:null,
     cpuTotalNs:c.cpu_usage.total_usage,systemTotalNs:c.system_cpu_usage,onlineCpus:cpus,
     throttling:c.throttling_data,memoryUsage:s.memory_stats.usage,memoryLimit:s.memory_stats.limit,
     inactiveFile:s.memory_stats.stats?.inactive_file,pids:s.pids_stats.current,
     networkRx:networks.reduce((a,n)=>a+n.rx_bytes,0),networkTx:networks.reduce((a,n)=>a+n.tx_bytes,0)};
    sink.write(JSON.stringify(row)+'\n');samples++;
    if(maxSamples&&samples>=maxSamples){request.destroy();resolve();return;}
   }
  });
  response.on('error',error=>{if(!maxSamples||samples<maxSamples)reject(error);});
 });
 request.on('error',reject);
})));
await new Promise(resolve=>sink.end(resolve));
console.log(`Captured ${maxSamples} timestamped samples per container.`);
