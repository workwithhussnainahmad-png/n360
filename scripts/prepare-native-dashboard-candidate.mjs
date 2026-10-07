/** Mechanical extraction keeps one shared cold/refresh fetcher per handler. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const snapshot=fs.readFileSync('docs/performance-diagnostic-evidence/full-handler-and-helper-source.md','utf8');
for(const match of snapshot.matchAll(/\n## ([^\n]+)\n\nSHA256: ([a-f0-9]+)\n\n```[^\n]+\n([\s\S]*?)\n```\n/g)) {
 const file=match[1];const code=match[3];
 if(crypto.createHash('sha256').update(code).digest('hex')!==match[2])throw Error(`Snapshot hash mismatch: ${file}`);
 const destination=path.join('.codex/performance-experiment-backups',file);
 if(!fs.existsSync(destination)){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,code);}
}
for(const role of ['student','staff']){
 const file=`src/app/api/${role}/dashboard/route.ts`;
 let source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 if(source.includes('nativeWarm:'))throw Error('Candidate already extracted');
 const marker='async (): Promise<DashboardPayload | { error: string }> => {';
 const start=source.indexOf(marker);const bodyStart=start+marker.length;
 const end=source.indexOf('\n    }, decodeDashboardPayload)',bodyStart);
 if(start<0||end<0)throw Error('Expected original dashboard factory');
 let body=source.slice(bodyStart,end).replace('\n      isCacheHit = false;\n','');
 const factory=role==='student'?'async () => { isCacheHit = false; return fetchDashboardPayload(session); }':'() => fetchDashboardPayload(session)';
 source=source.slice(0,start)+factory+source.slice(end+'\n    }'.length);
 const helper=`async function fetchDashboardPayload(session: JWTPayload): Promise<DashboardPayload | { error: string }> {\n  const tenantId = getTenantContext(session);\n${role==='staff'?'  const staffId = session.userId;\n':''}${body.replace(/^      /gm,'  ')}\n}\n\n`;
 source=source.replace('export const GET =',helper+'export const GET =');
 source=`import type { JWTPayload } from '@/lib/auth-types';\n`+source;
 source=source.replace('import { getCachedOrFetch }','import { getCachedOrFetch, peekCachedOrFetch }');
 source=source.replace('import { getInstitutionCourseStreamingHint }','import { getInstitutionCourseStreamingHint, peekInstitutionCourseStreamingHint }');
 source=source.replace('decodeDashboardPayload, dashboardResponse }','decodeDashboardPayload, dashboardResponse, nativeDashboardResponse }');
 const key=role==='student'?'`cache:student:dashboard:${session.userId}:${tenantId}`':'`cache:staff:dashboard:v2:${tenantId}:${session.userId}`';
 const native=`}, {\n  nativeWarm: (req, { session }) => {\n    const started = performance.now();\n    const tenantId = getTenantContext(session);\n    const payload = peekCachedOrFetch(${key}, DASHBOARD_CACHE_TTL_SECONDS, () => fetchDashboardPayload(session), decodeDashboardPayload);\n    const coursesEnabled = peekInstitutionCourseStreamingHint(tenantId);\n    if (payload === undefined || coursesEnabled === undefined) return null;\n${role==='student'?`    const duration = (Math.round((performance.now() - started) * 100) / 100).toString();\n    return nativeDashboardResponse(payload, coursesEnabled, {\n      'x-request-id': req.headers.get('x-request-id') || crypto.randomUUID(),\n      'x-cache': 'HIT', 'x-dashboard-duration-ms': duration, 'server-timing': \`total;dur=\${duration}\`,\n    });`:`    return nativeDashboardResponse(payload, coursesEnabled);`}\n  },\n});\n`;
 const closing=source.lastIndexOf('});');
 source=source.slice(0,closing)+native;
 // Avoid unused request/timer bindings in staff's native path.
 if(role==='staff')source=source.replace('nativeWarm: (req, { session }) => {\n    const started = performance.now();','nativeWarm: (_req, { session }) => {');
 fs.writeFileSync(file,source);
}
console.log('Extracted shared fetchers and attached synchronous native warm dashboard handlers.');
