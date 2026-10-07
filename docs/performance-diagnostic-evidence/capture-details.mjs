import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
const dir='docs/performance-diagnostic-evidence';
const r=JSON.parse(fs.readFileSync(`${dir}/runtime.json`,'utf8'));
const nodeCode=`const fs=require('fs'),path=require('path'); const versions={}; for(const k of ['next','react','drizzle-orm','pg','pg-pool']) {let p=path.dirname(require.resolve(k)); while(!fs.existsSync(path.join(p,'package.json')))p=path.dirname(p); versions[k]=JSON.parse(fs.readFileSync(path.join(p,'package.json'))).version;} const s=require('http').createServer(); const urls={}; for(const k of ['DATABASE_URL','DIRECT_URL','REDIS_URL']){const u=new URL(process.env[k]);urls[k]={hostname:u.hostname,port:u.port};} console.log(JSON.stringify({node:process.version,versions,urls,defaults:{requestTimeout:s.requestTimeout,headersTimeout:s.headersTimeout,timeout:s.timeout,keepAliveTimeout:s.keepAliveTimeout,keepAliveTimeoutBuffer:s.keepAliveTimeoutBuffer,maxRequestsPerSocket:s.maxRequestsPerSocket},buildId:fs.readFileSync('.next/BUILD_ID','utf8').trim()}));`;
r.node=JSON.parse(execFileSync('docker',['exec','lms-backend-app-1','node','-e',nodeCode],{encoding:'utf8'}));
r.notableLogLines=[];
for(const name of ['lms-backend-caddy-1','lms-backend-pgbouncer-1']){
 const p=spawnSync('docker',['logs','--timestamps',name],{encoding:'utf8',maxBuffer:32*1024*1024});
 for(const line of (p.stdout+'\n'+p.stderr).split(/\r?\n/))if(/query timeout|dial tcp|connection refused/i.test(line))r.notableLogLines.push({name,line});
}
fs.writeFileSync(`${dir}/runtime.json`,JSON.stringify(r,null,2));
const files=['src/app/api/student/dashboard/route.ts','src/app/api/staff/dashboard/route.ts','scripts/standalone-server.cjs','src/lib/rbac.ts','src/lib/api-policy.ts','src/lib/auth.ts','src/lib/auth-edge.ts','src/lib/auth-types.ts','src/lib/jwt-secret.ts','src/lib/user.ts','src/lib/http.ts','src/lib/session-header.ts','src/lib/cors.ts','src/lib/performance.ts','src/lib/dashboard-data.ts','src/lib/announcements.ts','src/lib/course-streaming.ts','src/lib/streaming-credentials.ts','src/lib/redis.ts','src/lib/cache-scripts.ts','src/lib/cache-refresh-context.ts','src/lib/tracked-dashboard-cache.ts','src/lib/dashboard-response.ts','src/db/index.ts','src/app/api/student/timetable/route.ts','src/app/api/staff/timetable/route.ts','src/app/api/student/profile/route.ts','src/app/api/staff/profile/route.ts','src/lib/rate-limit.ts'];
let md='# Full first-party source evidence\n\nExact source snapshots for both dashboard handlers and their first-party helper paths, including fallback auth, transport, cache, database and serialization functions. Functions for other methods in these files are not necessarily called by dashboards. Third-party framework internals are not reproduced. No environment files or tokens are included.\n';
const hashes={};
for(const file of files){const code=fs.readFileSync(file,'utf8');hashes[file]=crypto.createHash('sha256').update(code).digest('hex');md+=`\n## ${file}\n\nSHA256: ${hashes[file]}\n\n\`\`\`${file.endsWith('.cjs')?'javascript':'typescript'}\n${code}\n\`\`\`\n`;}
fs.writeFileSync(`${dir}/full-handler-and-helper-source.md`,md);
fs.writeFileSync(`${dir}/source-fingerprints.json`,JSON.stringify({capturedAt:new Date().toISOString(),files:hashes},null,2));
let schema='# Live database schema and indexes\n\nCaptured from PostgreSQL catalogs; source declaration: src/db/schema.ts. Includes dashboard tables and campuses used by profile. Enum labels are in source schema.\n';
for(const t of r.postgres.rowCounts){schema+=`\n## ${t.table} (${t.rows} rows)\n\n| Column | Type | Nullable | Default |\n|---|---|---|---|\n`;for(const c of r.postgres.columns.filter(c=>c.table_name===t.table))schema+=`| ${c.column_name} | ${c.udt_name} | ${c.is_nullable} | ${(c.column_default??'').replaceAll('|','\\|')} |\n`;schema+='\n```sql\n'+r.postgres.indexes.filter(i=>i.tablename===t.table).map(i=>i.indexdef+';').join('\n')+'\n```\n\nConstraints:\n\n';for(const c of r.postgres.constraints.filter(c=>c.table_name===t.table))schema+=`- ${c.conname}: ${c.definition}\n`;}
fs.writeFileSync(`${dir}/live-schema-and-indexes.md`,schema);
const q=JSON.parse(fs.readFileSync(`${dir}/queries-and-plans.json`,'utf8'));
let sql='# Exact generated SELECT statements\n\nBound parameters are listed separately. Source-handler probe uses one identity per role, disabled Redis and a direct read-only local database client; not a production query-count trace. Client elapsed values include Windows transport/scheduling and shared-client queueing. Use EXPLAIN server time for sampled execution.\n';
for(let n=0;n<q.queries.length;n++){const x=q.queries[n];sql+=`\n## Q${n+1}: ${x.label}\n\nParameters: ${JSON.stringify(x.params)}\n\n\`\`\`sql\n${x.sql}\n\`\`\`\n`;}
sql+=`\n## Conditional staff announcement read status (not executed: notices empty)\n\nExample parameters: ${JSON.stringify(q.conditionalAnnouncementReads.params)}\n\n\`\`\`sql\n${q.conditionalAnnouncementReads.sql}\n\`\`\`\n`;
fs.writeFileSync(`${dir}/exact-queries.md`,sql);
console.log(JSON.stringify({node:r.node,notableLogLines:r.notableLogLines,tableSizes:r.postgres.tables.map(t=>({table:t.relname,totalBytes:t.total_bytes,dead:t.n_dead_tup})),database:r.postgres.database,tokens:r.tokens,ungrantedLocks:r.postgres.ungrantedLocks},null,2));

