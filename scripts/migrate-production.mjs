import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const SUPPLEMENTAL_MIGRATIONS = [
  // Functional lower-case login indexes were maintained manually and are not
  // represented by the generated Drizzle journal.
  "0006_login_lookup_indexes.sql",
  "0015_students_institution_section_idx.sql",
  "0016_institution_level_features.sql",
  "0017_batch_exam_promotion_type.sql",
  "0018_hot_query_performance_indexes.sql",
  "0018_student_admission_sequences.sql",
  "0019_official_promotion_results.sql",
  "0020_final_class.sql",
  "0021_promotion_history_snapshots.sql",
  "0022_graduated_student_access.sql",
  "0023_server_load_indexes.sql",
  "0024_dashboard_optimization_indexes.sql",
  "0025_institution_pricing_plan.sql",
  "0026_fee_voucher_monthly_cycle.sql",
  "0027_software_version.sql",
  "0028_institution_public_slug.sql",
  "0029_institution_public_profiles.sql",
  "0030_admissions_intake.sql",
  "0031_admission_applicant_accounts.sql",
  "0032_admission_review_pipeline.sql",
  "0033_admission_fee_enrollment.sql",
  "0034_admission_review_queue_indexes.sql",
  "0035_admission_cycle_workflow_presets.sql",
  "0036_public_website_content.sql",
  "0037_fee_management.sql",
  "0038_fee_register_performance.sql",
  "0039_pricing_plan_required.sql",
  "0040_public_site_base_domain.sql",
  "0041_institution_backups.sql",
  "0042_institution_backup_retries.sql",
  "0043_admission_payment_details.sql",
  "0044_fix_fee_invoice_billing_month_check.sql",
  "0045_payment_methods_and_student_fee_submissions.sql",
  "0046_admission_refund_required.sql",
  "0047_courses_and_streaming.sql",
  "0048_email_outbox.sql",
  "0049_retire_legacy_fee_vouchers.sql",
  "0050_refresh_token_rotation.sql",
  "0051_parent_identity.sql",
  "0052_assessment_result_publishing.sql",
  "0053_section_groups_timetable.sql",
  "0054_public_website_notices.sql",
  "0055_public_events.sql",
  "0056_institution_payment_gateway.sql",
  "0057_gateway_payment_attempts.sql",
  "0058_institution_google_drive_backups.sql",
  "0059_central_backup_settings.sql",
  "0060_central_database_backups.sql",
  "0061_institution_restore_requests.sql",
  "0062_employee_backup_permissions.sql",
  "0063_institution_admin_profile_review.sql",
  "0064_public_website_themes.sql",
  "0065_public_website_default_theme.sql",
  "0066_campus_workspaces.sql",
  "0067_admission_campus_intake.sql",
  "0068_admission_campus_availability.sql",
  "0069_campus_identity.sql",
  "0070_submissions_file_url.sql",
];

if (!process.argv.includes("--apply"))
  throw new Error(
    "Refusing to change the database without the explicit --apply flag",
  );
const connectionString = process.env.DIRECT_URL?.trim();
if (!connectionString)
  throw new Error("DIRECT_URL is required for production migrations");
if (/(:6432\b|pgbouncer=true)/i.test(connectionString))
  throw new Error("DIRECT_URL must bypass PgBouncer");

const pool = new pg.Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: 10_000,
  application_name: "nisaab360_migrator",
});
const lockClient = await pool.connect();

async function baselineLegacyDrizzleSchema(client) {
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id serial PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`);
  const [{ count: migrationCount }] = (
    await client.query(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
    )
  ).rows;
  if (migrationCount > 0) return;

  const [{ count: publicTableCount }] = (
    await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
  ).rows;
  if (publicTableCount === 0) return;

  // Older installations were created with drizzle-kit push, so they contain the
  // generated schema but no migration ledger. Verify the complete final snapshot
  // before recording a baseline; a partial or unexpected schema is refused.
  const snapshot = JSON.parse(
    await readFile(resolve("drizzle", "meta", "0015_snapshot.json"), "utf8"),
  );
  const columnsResult = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  const enumsResult = await client.query(
    "SELECT t.typname AS enum_name, e.enumlabel AS enum_value FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid WHERE n.nspname = 'public'",
  );
  const indexesResult = await client.query(
    "SELECT tablename AS table_name, indexname AS index_name FROM pg_indexes WHERE schemaname = 'public'",
  );
  const constraintsResult = await client.query(
    "SELECT c.conname AS constraint_name FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'",
  );
  const actualColumns = new Set(
    columnsResult.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const actualEnums = new Set(
    enumsResult.rows.map((row) => `${row.enum_name}.${row.enum_value}`),
  );
  const actualIndexes = new Set(
    indexesResult.rows.map((row) => `${row.table_name}.${row.index_name}`),
  );
  const actualConstraints = new Set(
    constraintsResult.rows.map((row) => row.constraint_name),
  );
  const missing = [];

  for (const table of Object.values(snapshot.tables)) {
    for (const columnName of Object.keys(table.columns)) {
      if (!actualColumns.has(`${table.name}.${columnName}`))
        missing.push(`column ${table.name}.${columnName}`);
    }
    for (const indexName of Object.keys(table.indexes)) {
      if (!actualIndexes.has(`${table.name}.${indexName}`))
        missing.push(`index ${table.name}.${indexName}`);
    }
    for (const group of [
      table.foreignKeys,
      table.uniqueConstraints,
      table.checkConstraints,
      table.compositePrimaryKeys,
    ]) {
      for (const constraintName of Object.keys(group)) {
        // PostgreSQL truncates unquoted and quoted identifiers to 63 bytes.
        const storedName = Buffer.from(constraintName)
          .subarray(0, 63)
          .toString();
        if (!actualConstraints.has(storedName))
          missing.push(`constraint ${constraintName}`);
      }
    }
  }
  for (const enumDefinition of Object.values(snapshot.enums)) {
    for (const value of enumDefinition.values) {
      if (!actualEnums.has(`${enumDefinition.name}.${value}`))
        missing.push(`enum value ${enumDefinition.name}.${value}`);
    }
  }
  if (missing.length) {
    throw new Error(
      `Refusing to baseline a partial legacy schema. Missing snapshot objects:\n- ${missing.slice(0, 30).join("\n- ")}${missing.length > 30 ? `\n- ...and ${missing.length - 30} more` : ""}`,
    );
  }

  const journal = JSON.parse(
    await readFile(resolve("drizzle", "meta", "_journal.json"), "utf8"),
  );
  for (const entry of journal.entries) {
    const sql = await readFile(resolve("drizzle", `${entry.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [hash, entry.when],
    );
  }
  process.stdout.write(
    `Baselined ${journal.entries.length} generated migrations after verifying the legacy schema snapshot.\n`,
  );
}

try {
  await lockClient.query(
    "SELECT pg_advisory_lock(hashtext('nisaab360-production-migrations'))",
  );
  await baselineLegacyDrizzleSchema(lockClient);
  await migrate(drizzle(pool), { migrationsFolder: resolve("drizzle") });
  await lockClient.query(`CREATE TABLE IF NOT EXISTS nisaab360_supplemental_migrations (
    name text PRIMARY KEY,
    sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const name of SUPPLEMENTAL_MIGRATIONS) {
    const sql = await readFile(resolve("drizzle", name), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const prior = await lockClient.query(
      "SELECT sha256 FROM nisaab360_supplemental_migrations WHERE name = $1",
      [name],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].sha256 !== sha256)
        throw new Error(`Applied migration was modified: ${name}`);
      continue;
    }

    if (/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(sql)) {
      // These files contain only concurrent index statements plus line comments.
      // Strip comments first so a semicolon in prose cannot become executable SQL.
      const statements = sql
        .replace(/^\s*--.*$/gm, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) await lockClient.query(statement);
      await lockClient.query(
        "INSERT INTO nisaab360_supplemental_migrations (name, sha256) VALUES ($1, $2)",
        [name, sha256],
      );
    } else {
      await lockClient.query("BEGIN");
      try {
        await lockClient.query(sql);
        await lockClient.query(
          "INSERT INTO nisaab360_supplemental_migrations (name, sha256) VALUES ($1, $2)",
          [name, sha256],
        );
        await lockClient.query("COMMIT");
      } catch (error) {
        await lockClient.query("ROLLBACK");
        throw error;
      }
    }
    process.stdout.write(`Applied ${name}\n`);
  }
  process.stdout.write("Database migrations are current.\n");
} finally {
  try {
    await lockClient.query(
      "SELECT pg_advisory_unlock(hashtext('nisaab360-production-migrations'))",
    );
  } catch {}
  lockClient.release();
  await pool.end();
}
