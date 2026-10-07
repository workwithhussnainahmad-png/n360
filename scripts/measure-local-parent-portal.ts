import { performance } from "node:perf_hooks";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { institutions, parentAccounts, parentStudents } from "@/db/schema";
import { createAccessToken } from "@/lib/auth";
import { redis } from "@/lib/redis";

const USERNAME = "local-perf-fixture";
const REQUEST_COUNT = 5;

async function main() {
  const [parent] = await db
    .select({
      parentId: parentAccounts.id,
      studentId: parentStudents.studentId,
      institutionId: parentAccounts.institutionId,
      createdAt: parentAccounts.createdAt,
    })
    .from(parentStudents)
    .innerJoin(parentAccounts, eq(parentAccounts.id, parentStudents.parentId))
    .innerJoin(institutions, eq(institutions.id, parentAccounts.institutionId))
    .where(and(eq(institutions.username, USERNAME), eq(parentAccounts.status, "ACTIVE")))
    .limit(1);
  if (!parent) throw new Error("Local performance fixture parent was not found.");

  const accessToken = await createAccessToken({
    userId: parent.parentId,
    role: "PARENT",
    institutionId: parent.institutionId,
    mustChangePassword: false,
    createdAt: parent.createdAt.toISOString(),
  });
  const endpoint = `http://localhost:3000/api/parent/portal?section=home&student=${parent.studentId}`;

  await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
  const durations: number[] = [];
  let bodyBytes = 0;
  for (let index = 0; index < REQUEST_COUNT; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await response.arrayBuffer();
    if (!response.ok) throw new Error(`Parent portal returned ${response.status}.`);
    durations.push(performance.now() - startedAt);
    bodyBytes = body.byteLength;
  }

  const ordered = [...durations].sort((left, right) => left - right);
  console.log(JSON.stringify({
    requests: REQUEST_COUNT,
    minMs: Number(ordered[0]!.toFixed(2)),
    p50Ms: Number(ordered[Math.floor((REQUEST_COUNT - 1) / 2)]!.toFixed(2)),
    maxMs: Number(ordered[REQUEST_COUNT - 1]!.toFixed(2)),
    bodyBytes,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([pool.end(), redis.quit()]);
  });
