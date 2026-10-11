// Read-only query-plan inspection; no EXPLAIN ANALYZE or benchmark.
const {Client} = require('pg');
async function main() {
  const client = new Client({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL});
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const {rows} = await client.query('SELECT id,institution_id FROM students WHERE is_active=true AND deleted_at IS NULL ORDER BY id LIMIT 1');
    if (!rows.length) throw Error('No active student');
    const result = await client.query(`EXPLAIN (FORMAT JSON) SELECT u.id, u.institution_id AS "institutionId",
      u.academic_status AS "academicStatus", i.allow_graduated_student_access AS "graduatedAccessAllowed",
      u.class_id AS "classId", u.section_id AS "sectionId", u.name
      FROM students u JOIN institutions i ON i.id=u.institution_id
      LEFT JOIN institutions root ON root.id=i.parent_institution_id
      WHERE u.id=$1 AND ($2::integer IS NULL OR u.institution_id=$2)
      AND u.is_active=true AND u.deleted_at IS NULL
      AND (u.academic_status <> 'GRADUATED' OR i.allow_graduated_student_access=true)
      AND i.status='APPROVED' AND i.deleted_at IS NULL
      AND (i.parent_institution_id IS NULL OR (root.status='APPROVED' AND root.deleted_at IS NULL AND root.parent_institution_id IS NULL)) LIMIT 1`, [rows[0].id,rows[0].institution_id]);
    const scrub = node => Object.fromEntries(Object.entries(node).filter(([key])=>['Node Type','Join Type','Relation Name','Index Name','Startup Cost','Total Cost','Plan Rows','Plans'].includes(key)).map(([key,value])=>[key,key==='Plans'?value.map(scrub):value]));
    console.log(JSON.stringify({note:'Estimated plan for one existing student; not execution timing or the pooled prepared generic plan.',plan:scrub(result.rows[0]['QUERY PLAN'][0].Plan)},null,2));
    await client.query('ROLLBACK');
  } finally { await client.end(); }
}
main().catch(()=>{console.error('Read-only authorization plan inspection failed');process.exitCode=1;});
