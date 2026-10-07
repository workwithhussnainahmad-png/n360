/** Static inventory of current handlers. No HTTP or database access. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}
const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const records = [];
for (const path of files('src/app/api').filter(path => path.endsWith('route.ts'))) {
  const source = readFileSync(path, 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const handlers = [];
  function walk(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && httpMethods.has(node.name.getText(ast))) {
      const body = node.getText(ast);
      const calls = [...body.matchAll(/(?:db|tx)\.(select(?:Distinct)?|execute|insert|update|delete|transaction)\s*\(/g)];
      const sql = calls.filter(match => ['select', 'selectDistinct', 'execute'].includes(match[1])).length;
      handlers.push({ method: node.name.getText(ast), sql,
        cache: /getCachedOrFetch|getRawCachedOrFetch|redis\.get/.test(body),
        limits: /\.limit\(|paginate|cursor|windowRange|resolveParentPeriod/.test(body),
        fanout: /Promise\.all/.test(body),
        loops: /(?:for\s*\(|\.map\(async)/.test(body),
      });
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  const normalized = path.replaceAll('\\', '/');
  const portal = normalized.includes('/public/admissions/') || normalized.endsWith('/public/admissions/route.ts')
    ? 'applicant' : normalized.split('/')[3];
  const imports = [...source.matchAll(/from\s+['"](@\/lib\/[^'"]+|@\/app\/actions\/[^'"]+)['"]/g)].map(match => match[1]);
  records.push({ path: normalized, portal, sha256: createHash('sha256').update(source).digest('hex'), handlers, imports });
}
const portals = ['student', 'staff', 'institution', 'parent', 'applicant'];
const relevant = records.filter(record => portals.includes(record.portal));
let report = '# Current portal endpoint inventory\n\nGenerated from current source. Counts are static SQL call sites inside each handler, not measured queries per request; shared helpers and conditional branches can change actual cost. A limit flag describes source usage, not proof that every query is bounded.\n\n';
for (const portal of portals) {
  const rows = relevant.filter(row => row.portal === portal);
  report += `## ${portal}\n\n${rows.length} route files, ${rows.reduce((n, row) => n + row.handlers.length, 0)} exported handlers.\n\n| Endpoint | Methods | GET SQL sites | GET cache | GET fan-out | GET bounds |\n|---|---|---:|---|---|---|\n`;
  for (const row of rows) {
    const get = row.handlers.find(handler => handler.method === 'GET');
    report += `| /${row.path.slice('src/app/'.length).replace('/route.ts', '')} | ${row.handlers.map(handler => handler.method).join(', ')} | ${get?.sql ?? '-'} | ${get ? get.cache : '-'} | ${get ? get.fanout : '-'} | ${get ? get.limits : '-'} |\n`;
  }
  report += '\n';
}
report += '## Shared transport and access flow\n\n- Main portals: Next Proxy transport policy, signed JWT, account validity, role/tenant guard, then handler and SQL/Valkey helpers. Exact hot routes already enforce transport policy in their guarded handler.\n- Parent: signed PARENT session, fresh parent/child link and current student membership before section data. SSR pages also call the parent context helper.\n- Applicant: institution slug/domain resolution, applicant JWT audience/kind, fresh sessionVersion/account ownership, then application/document/payment queries. Applicant SSR lives in src/app/sites/[slug]/[[...path]]/page.tsx, not an api/applicant directory.\n- Writes/payment/authorization must remain fresh; caching a GET does not justify caching a mutation or removing membership checks.\n\n## Referenced shared helpers\n\n';
for (const helper of [...new Set(relevant.flatMap(record => record.imports))].sort()) report += `- ${helper}\n`;
writeFileSync('.codex/portal-performance-inventory.md', report);
writeFileSync('.codex/portal-performance-inventory.json', JSON.stringify(records, null, 2));
console.log(JSON.stringify({ allApiRoutes: records.length, portals: Object.fromEntries(portals.map(portal => [portal,
  { routes: relevant.filter(row => row.portal === portal).length, handlers: relevant.filter(row => row.portal === portal).reduce((n, row) => n + row.handlers.length, 0) }])) }));
