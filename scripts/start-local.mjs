import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependencies = ["postgres", "pgbouncer", "valkey"];

function run(command, args, friendlyName) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`\nCould not run ${friendlyName}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\n${friendlyName} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

function runWithInput(command, args, input, friendlyName) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    input,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) {
    console.error(`\nCould not run ${friendlyName}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n${friendlyName} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.info("Starting local database and cache services...");

const dockerCheck = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
  cwd: projectRoot,
  env: process.env,
  encoding: "utf8",
});

if (dockerCheck.error || dockerCheck.status !== 0) {
  console.error(
    "\nDocker Desktop is not running. Start Docker Desktop, wait until it is ready, then run npm start again.",
  );
  process.exit(1);
}

run(
  "docker",
  ["compose", "up", "-d", "--wait", ...dependencies],
  "local database/cache startup",
);

console.info("Local database and cache are ready.");

if (process.argv.includes("--deps-only")) {
  process.exit(0);
}

console.info("Applying pending local database migrations...");
run(
  "docker",
  ["compose", "run", "--rm", "migrate"],
  "local database migration",
);
// The migration image may be cached while local source migrations change. The
// new institution Google Drive table is idempotent, so apply this local-only
// supplemental migration through the PostgreSQL container itself. This avoids
// relying on the Windows-published 5433 port, which is not reachable on every
// Docker Desktop installation.
runWithInput(
  "docker",
  ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"],
  readFileSync(path.join(projectRoot, "drizzle", "0058_institution_google_drive_backups.sql")),
  "local institution backup migration",
);
console.info("Local database migrations are current.");
runWithInput(
  "docker",
  ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"],
  readFileSync(path.join(projectRoot, "drizzle", "0061_institution_restore_requests.sql")),
  "local institution restore migration",
);

runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], readFileSync(path.join(projectRoot, "drizzle", "0062_employee_backup_permissions.sql")), "local employee backup permissions migration");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], readFileSync(path.join(projectRoot, "drizzle", "0063_institution_admin_profile_review.sql")), "local institution admin review migration");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], readFileSync(path.join(projectRoot, "drizzle", "0064_public_website_themes.sql")), "local public website theme migration");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], readFileSync(path.join(projectRoot, "drizzle", "0065_public_website_default_theme.sql")), "local public website default theme migration");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], readFileSync(path.join(projectRoot, "drizzle", "0066_campus_workspaces.sql")), "local campus workspace migration");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], readFileSync(path.join(projectRoot, "drizzle", "0067_admission_campus_intake.sql")), "local admission campus intake migration");
const campusAvailabilityMigration = readFileSync(path.join(projectRoot, "drizzle", "0068_admission_campus_availability.sql"));
const campusAvailabilityHash = createHash("sha256").update(campusAvailabilityMigration).digest("hex");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-1", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], `${campusAvailabilityMigration.toString()}\nINSERT INTO nisaab360_supplemental_migrations(name, sha256) VALUES ('0068_admission_campus_availability.sql', '${campusAvailabilityHash}') ON CONFLICT (name) DO NOTHING;`, "local admission campus availability migration");
const campusIdentityMigration = readFileSync(path.join(projectRoot, "drizzle", "0069_campus_identity.sql"));
const campusIdentityHash = createHash("sha256").update(campusIdentityMigration).digest("hex");
runWithInput("docker", ["compose", "exec", "-T", "postgres", "psql", "-1", "-v", "ON_ERROR_STOP=1", "-U", "app", "-d", "app"], `${campusIdentityMigration.toString()}\nINSERT INTO nisaab360_supplemental_migrations(name, sha256) VALUES ('0069_campus_identity.sql', '${campusIdentityHash}') ON CONFLICT (name) DO NOTHING;`, "local campus identity migration");
run(process.execPath, ["scripts/prepare-standalone.mjs"], "standalone preparation");

const server = spawn(
  process.execPath,
  ["--env-file=.env", "scripts/standalone-server.cjs"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

const worker = spawn(
  process.execPath,
  ["--env-file=.env", "--import", "tsx", "scripts/email-outbox-worker.ts"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

worker.once("error", (error) => {
  console.error(`Could not start the local background worker: ${error.message}`);
  server.kill("SIGTERM");
  process.exitCode = 1;
});

worker.once("exit", (code, signal) => {
  if (!signal && code !== 0) {
    console.error(`Local background worker stopped with exit code ${code}.`);
    server.kill("SIGTERM");
    process.exitCode = code ?? 1;
  }
});

server.once("error", (error) => {
  console.error(`Could not start the Next.js server: ${error.message}`);
  process.exitCode = 1;
});

server.once("exit", (code, signal) => {
  if (!worker.killed) worker.kill("SIGTERM");
  if (signal) {
    console.info(`Next.js server stopped by ${signal}.`);
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});
