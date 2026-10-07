import { cpSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const standaloneDir = resolve(".next/standalone");

if (!existsSync(resolve(standaloneDir, "server.js"))) {
  console.info("Standalone output is missing. Building the application...");
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(resolve(standaloneDir, ".next"), { recursive: true });
cpSync(resolve("public"), resolve(standaloneDir, "public"), { recursive: true });
cpSync(resolve(".next/static"), resolve(standaloneDir, ".next/static"), { recursive: true });
