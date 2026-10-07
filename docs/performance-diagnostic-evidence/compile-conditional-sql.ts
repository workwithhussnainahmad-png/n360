import fs from 'node:fs';
async function main(){
 process.env.NEXT_PHASE='phase-production-build';
 const {db,pool,cacheRefreshPool,readinessPool}=await import('../../src/db');
 const s=await import('../../src/db/schema');const {and,eq}=await import('drizzle-orm');
 const queries=[
  {branch:'Legacy student token missing academic claims: src/lib/auth.ts enrichSession',query:db.select({academicStatus:s.students.academicStatus,graduatedAccessAllowed:s.institutions.allowGraduatedStudentAccess}).from(s.students).innerJoin(s.institutions,eq(s.students.institutionId,s.institutions.id)).where(eq(s.students.id,101)).limit(1).toSQL()},
  {branch:'Student announcements called without studentInfo; dashboard supplies it so this query is skipped',query:db.select({campusId:s.students.campusId,classId:s.students.classId,sectionId:s.students.sectionId,createdAt:s.students.createdAt}).from(s.students).where(and(eq(s.students.id,101),eq(s.students.institutionId,2))).limit(1).toSQL()}
 ];
 fs.writeFileSync('docs/performance-diagnostic-evidence/conditional-queries.json',JSON.stringify(queries,null,2));
 fs.appendFileSync('docs/performance-diagnostic-evidence/exact-queries.md',queries.map(q=>`\n## ${q.branch}\n\nCompiled, not executed. Parameters: ${JSON.stringify(q.query.params)}\n\n\`\`\`sql\n${q.query.sql}\n\`\`\`\n`).join(''));
 await Promise.all([pool.end(),cacheRefreshPool.end(),readinessPool.end()]);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
