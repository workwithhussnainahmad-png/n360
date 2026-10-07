import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import { Client } from 'pg';
const out = 'docs/performance-diagnostic-evidence';
const run = (...args) => execFileSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const names = ['lms-backend-app-1','nisaab360-app2','lms-backend-caddy-1','lms-backend-pgbouncer-1','lms-backend-postgres-1','lms-backend-valkey-1'];
const allow = /^(NODE_ENV|DEPLOYMENT_ENV|NODE_OPTIONS|KEEP_ALIVE_TIMEOUT|HOT_PATH_LANE|DB_POOL_MAX|PERF_DIAGNOSTICS|UV_THREADPOOL_SIZE|GOMAXPROCS)=/;
const runtime = {capturedAt:new Date().toISOString(),docker:JSON.parse(run('info','--format','{{json .}}')),containers:[],versions:{},postgres:{},wire:[],logs:[]};
runtime.docker = Object.fromEntries(['NCPU','MemTotal','OperatingSystem','KernelVersion','Architecture','Driver','DockerRootDir','ServerVersion'].map(k=>[k,runtime.docker[k]]));
for (const name of names) {
  const i=JSON.parse(run('inspect',name))[0];
  runtime.containers.push({name,image:i.Image,command:i.Config.Cmd,entrypoint:i.Config.Entrypoint,startedAt:i.State.StartedAt,restartCount:i.RestartCount,oomKilled:i.State.OOMKilled,health:i.State.Health?.Status,cpuQuota:i.HostConfig.CpuQuota,nanoCpus:i.HostConfig.NanoCpus,cpuset:i.HostConfig.CpusetCpus,memoryLimit:i.HostConfig.Memory,pidsLimit:i.HostConfig.PidsLimit,environment:i.Config.Env.filter(e=>allow.test(e)),processes:run('top',name,'-eo','pid,ppid,nlwp,args')});
  // docker logs emits stderr separately: combine stdout and stderr with spawnSync.
  const { spawnSync } = await import('node:child_process');
  const full=spawnSync('docker',['logs','--timestamps',name],{encoding:'utf8',maxBuffer:32*1024*1024});
  const lines=(full.stdout+'\n'+full.stderr).split(/\r?\n/).filter(Boolean);
  const categories={poolTimeout:/timeout exceeded when trying to connect|connection timeout|pool.*exhaust/i,queryTimeout:/query read timeout|query timeout|canceling statement due to statement timeout/i,redisError:/redis.*error|valkey.*error/i,transportError:/connection refused|ECONNREFUSED|dial tcp|i\/o timeout/i,appError:/RBAC Error|Error fetching profile|Hot-path lane error|Failed to handle request/i,oom:/out of memory|heap out of memory|oom-kill/i};
  runtime.logs.push({name,retainedLineCount:lines.length,firstTimestamp:lines[0]?.slice(0,30),lastTimestamp:lines.at(-1)?.slice(0,30),counts:Object.fromEntries(Object.entries(categories).map(([k,re])=>[k,lines.filter(l=>re.test(l)).length])),warning:'Retained current-container lifetime only; cannot associate with supplied tests without their UTC windows. Counts are matching log lines, not distinct requests.'});
}
runtime.currentStats=run('stats','--no-stream','--format','{{json .}}').split('\n').map(l=>JSON.parse(l));
runtime.versions.caddy=run('exec','lms-backend-caddy-1','caddy','version');
runtime.versions.pgbouncer=run('exec','lms-backend-pgbouncer-1','pgbouncer','--version');
runtime.valkey=run('exec','lms-backend-valkey-1','valkey-cli','INFO');
fs.writeFileSync(`${out}/caddy-effective.json`,run('exec','lms-backend-caddy-1','wget','-qO-','http://127.0.0.1:2019/config/'));
fs.writeFileSync(`${out}/pgbouncer-effective.ini`,run('exec','lms-backend-pgbouncer-1','cat','/etc/pgbouncer/pgbouncer.ini'));
const loc=new URL(process.env.DIRECT_URL); if(!['localhost','127.0.0.1'].includes(loc.hostname))throw Error('Local only');
const client=new Client({connectionString:process.env.DIRECT_URL,application_name:'diagnosis_readonly',statement_timeout:5000});
await client.connect(); await client.query('SET default_transaction_read_only = on');
const q=async sql=>(await client.query(sql)).rows;
runtime.postgres.version=await q('select version()');
runtime.postgres.settings=await q("select name,setting,unit,source from pg_settings where name in ('max_connections','shared_buffers','work_mem','effective_cache_size','statement_timeout','idle_in_transaction_session_timeout','log_min_duration_statement','log_lock_waits','track_io_timing','shared_preload_libraries','max_wal_size') order by name");
runtime.postgres.extensions=await q('select extname,extversion from pg_extension');
const tables=['institutions','students','staff','staff_assignments','subjects','classes','sections','assignments','submissions','marks','tests','announcements','announcement_reads','campuses'];
const quoted=tables.map(t=>`'${t}'`).join(',');
runtime.postgres.columns=await q(`select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in (${quoted}) order by table_name,ordinal_position`);
runtime.postgres.indexes=await q(`select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in (${quoted}) order by tablename,indexname`);
runtime.postgres.constraints=await q(`select c.relname as table_name,con.conname,pg_get_constraintdef(con.oid) definition from pg_constraint con join pg_class c on c.oid=con.conrelid where c.relname in (${quoted}) order by c.relname,con.conname`);
runtime.postgres.tables=await q(`select relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,last_analyze,last_autoanalyze,pg_total_relation_size(relid) total_bytes,pg_relation_size(relid) heap_bytes,pg_indexes_size(relid) index_bytes from pg_stat_user_tables where relname in (${quoted}) order by relname`);
runtime.postgres.rowCounts=[];
for(const t of tables)runtime.postgres.rowCounts.push({table:t,...(await q(`select count(*)::int rows from "${t}"`))[0]});
runtime.postgres.database=await q('select pg_database_size(current_database()) bytes');
runtime.postgres.activity=await q('select state,wait_event_type,wait_event,count(*)::int from pg_stat_activity group by 1,2,3');
runtime.postgres.ungrantedLocks=await q('select locktype,mode,count(*)::int from pg_locks where not granted group by 1,2');
const saved=JSON.parse(fs.readFileSync(`${out}/queries-and-plans.json`,'utf8'));
const top=[...saved.plans].sort((a,b)=>b.plan[0]['Execution Time']-a.plan[0]['Execution Time']).slice(0,3);
let plansText='# Three slowest among 13 single idle SELECT plan samples; NOT the three slowest under load.\n';
for(const p of top){const result=await client.query('EXPLAIN (ANALYZE, BUFFERS) '+p.sql,p.params);plansText+=`\n## ${p.label}; initial JSON plan execution ${p.plan[0]['Execution Time']} ms\nSQL: ${p.sql}\nParameters: ${JSON.stringify(p.params)}\n${result.rows.map(r=>r['QUERY PLAN']).join('\n')}\n`;}
fs.writeFileSync(`${out}/three-sampled-plans.txt`,plansText);
await client.end();
const tokens=JSON.parse(fs.readFileSync('k6/tokens.json','utf8').replace(/^\uFEFF/, '')).tokens;
function get(path,token,encoding){return new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:3000,path,headers:{Authorization:`Bearer ${token}`,'Accept-Encoding':encoding,Accept:'application/json'}},r=>{let bytes=0;r.on('data',b=>bytes+=b.length);r.on('end',()=>resolve({path,acceptEncoding:encoding,status:r.statusCode,wireBodyBytes:bytes,headers:Object.fromEntries(['content-type','content-length','content-encoding','cache-control','vary','x-perf-proxy-ms'].map(k=>[k,r.headers[k]??null]))}));}).on('error',reject);});}
for(const role of ['STUDENT','STAFF']){const token=tokens.find(t=>t.roleHint===role).accessToken;for(const endpoint of ['dashboard','timetable','profile'])for(const enc of ['identity','gzip'])runtime.wire.push(await get(`/api/${role.toLowerCase()}/${endpoint}`,token,enc));}
runtime.tokens={counts:Object.fromEntries(['STUDENT','STAFF','INSTITUTION'].map(role=>[role,tokens.filter(t=>t.roleHint===role).length])),studentAcademicClaimsPresent:tokens.filter(t=>t.roleHint==='STUDENT').every(t=>{const p=JSON.parse(Buffer.from(t.accessToken.split('.')[1],'base64url'));return p.studentAcademicStatus!==undefined && p.graduatedStudentAccessAllowed!==undefined;}),hash:crypto.createHash('sha256').update(fs.readFileSync('k6/tokens.json')).digest('hex')};
fs.writeFileSync(`${out}/runtime.json`,JSON.stringify(runtime,null,2));
console.log(JSON.stringify({versions:runtime.versions,tables:runtime.postgres.rowCounts,wire:runtime.wire,logs:runtime.logs},null,2));
