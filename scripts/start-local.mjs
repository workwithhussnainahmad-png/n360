import { spawn, spawnSync } from "node:child_process";
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

// Mount current migration source read-only so a cached image cannot miss newly added SQL.
console.info("Applying pending local database migrations...");
run(
  "docker",
  [
    "compose", "run", "--rm",
    "--volume", `${path.join(projectRoot, "drizzle")}:/app/drizzle:ro`,
    "--volume", `${path.join(projectRoot, "scripts", "migrate-production.mjs")}:/app/scripts/migrate-production.mjs:ro`,
    "migrate",
  ],
  "local database migration",
);
console.info("Local database migrations are current.");
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
