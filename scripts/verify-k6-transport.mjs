/** One request to a disposable echo server; no application credentials/traffic. */
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
let observed;
const server=http.createServer((req,res)=>{
 observed=req.headers;
 res.setHeader('Content-Type','application/json');res.end('{}');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const script='.codex/performance-transport-probe.js';
fs.writeFileSync(script,`import http from 'k6/http'; export const options={vus:1,iterations:1}; export default function(){http.get(__ENV.PROBE_URL,{headers:{Accept:'application/json','Content-Type':'application/json'}});}`);
try{
 const port=server.address().port;
 const child=spawn('k6/bin/k6.exe',['run','--quiet','-e',`PROBE_URL=http://127.0.0.1:${port}`,script],{windowsHide:true,stdio:'ignore'});
 const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
 assert.equal(code,0);assert.ok(observed);
 const result={capturedAt:new Date().toISOString(),requests:1,destination:'disposable echo server, not LMS',headers:observed,acceptEncoding:observed['accept-encoding']??null};
 fs.writeFileSync('docs/performance-experiments/k6-wire-headers.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await new Promise(resolve=>server.close(resolve));fs.unlinkSync(script);}
