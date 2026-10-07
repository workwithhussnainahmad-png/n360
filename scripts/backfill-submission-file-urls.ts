import { config as loadEnv } from "dotenv";
import { Pool } from "pg";
import { v2 as cloudinary } from "cloudinary";

loadEnv({ path: ".env.local", override: false, quiet: true });
loadEnv({ path: ".env", override: false, quiet: true });

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 5;
const MAX_BATCH_SIZE = 200;
const MAX_CONCURRENCY = 10;

type Options = {
  apply: boolean;
  batchSize: number;
  concurrency: number;
};

type SubmissionRow = { id: number; file_key: string };

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function optionValue(name: string) {
  const equalsPrefix = `${name}=`;
  const equalsValue = process.argv.find((argument) => argument.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseOptions(): Options {
  return {
    // Deliberately opt-in: dry-run performs no Cloudinary calls and no writes.
    apply: process.argv.includes("--apply"),
    batchSize: positiveInteger(optionValue("--batch-size"), DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE),
    concurrency: positiveInteger(optionValue("--concurrency"), DEFAULT_CONCURRENCY, MAX_CONCURRENCY),
  };
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function resolveSecureUrl(fileKey: string) {
  for (const resourceType of ["image", "raw"] as const) {
    try {
      const resource = await cloudinary.api.resource(fileKey, { resource_type: resourceType });
      if (typeof resource.secure_url === "string") return resource.secure_url;
    } catch {
      // A key can be either image or raw; do not log the key or provider response.
    }
  }
  return null;
}

async function main() {
  const options = parseOptions();
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DIRECT_URL or DATABASE_URL before running this script.");

  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET before running this script.");
  }

  const pool = new Pool({ connectionString, application_name: "nisaab360_submission_url_backfill" });
  let scanned = 0;
  let updated = 0;
  let unresolved = 0;
  let failures = 0;
  let lastId = 0;

  try {
    if (!options.apply) {
      const { rows } = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM submissions WHERE file_url IS NULL"
      );
      console.info("Dry run: no Cloudinary calls or database writes performed.", {
        eligibleRows: Number(rows[0]?.count ?? 0),
        runWith: "npx tsx scripts/backfill-submission-file-urls.ts --apply",
      });
      return;
    }

    for (;;) {
      const { rows } = await pool.query<SubmissionRow>(
        `SELECT id, file_key
         FROM submissions
         WHERE file_url IS NULL AND id > $1
         ORDER BY id
         LIMIT $2`,
        [lastId, options.batchSize]
      );
      if (rows.length === 0) break;

      scanned += rows.length;
      lastId = rows[rows.length - 1].id;

      await mapWithConcurrency(rows, options.concurrency, async (submission) => {
        try {
          const fileUrl = await resolveSecureUrl(submission.file_key);
          if (!fileUrl) {
            unresolved += 1;
            return;
          }

          const result = await pool.query(
            "UPDATE submissions SET file_url = $1 WHERE id = $2 AND file_url IS NULL",
            [fileUrl, submission.id]
          );
          updated += result.rowCount ?? 0;
        } catch {
          failures += 1;
        }
      });

      console.info("Backfill progress", { scanned, updated, unresolved, failures });
    }
  } finally {
    await pool.end();
  }

  console.info("Submission file URL backfill complete", { scanned, updated, unresolved, failures });
}

main().catch((error) => {
  console.error("Submission file URL backfill failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
