// Read-only account export. Signing key stays inside the AWS application container.
const { Client } = require('pg');
const { createHmac } = require('node:crypto');
async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing');
  const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    application_name: 'aws_k6_student_token_export' });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const institutions = (await client.query("SELECT id,username,allow_graduated_student_access FROM institutions WHERE status='APPROVED' AND deleted_at IS NULL")).rows;
    if (institutions.length !== 1) throw new Error('Expected exactly one approved institution');
    const institution = institutions[0];
    const students = (await client.query(`SELECT id,institution_id,campus_id,login_roll_number,created_at,academic_status
      FROM students WHERE institution_id=$1 AND is_active=true AND deleted_at IS NULL AND academic_status='ACTIVE' ORDER BY id`, [institution.id])).rows;
    if (!students.length) throw new Error('No active students found');
    const issued = Math.floor(Date.now() / 1000);
    const expiration = issued + 4 * 60 * 60;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const tokens = students.map(row => {
      // Match createAccessToken: student password-change flags normalize to false.
      const payload = { userId: row.id, role: 'STUDENT', institutionId: row.institution_id,
        campusId: row.campus_id, mustChangePassword: false, createdAt: row.created_at.toISOString(),
        studentAcademicStatus: row.academic_status, graduatedStudentAccessAllowed: institution.allow_graduated_student_access,
        iat: issued, exp: expiration };
      const message = `${encode({ alg: 'HS256' })}.${encode(payload)}`;
      const accessToken = `${message}.${createHmac('sha256', process.env.JWT_SECRET).update(message).digest('base64url')}`;
      return { roleHint: 'STUDENT', userId: row.id, institutionId: row.institution_id,
        emailOrUsername: row.login_roll_number, expiresAt: new Date(expiration * 1000).toISOString(), accessToken };
    });
    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), source: 'aws-existing-students',
      institutionId: institution.id, tokens }, null, 2) + '\n');
    console.error(`Exported ${tokens.length} student tokens for ${institution.username}; expires in four hours. No database changes.`);
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
