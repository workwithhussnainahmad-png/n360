#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DATABASE:?POSTGRES_DATABASE is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

timestamp=$(date -u +"%Y-%m-%dT%H%M%SZ")
filename="backup-${timestamp}.dump"
filepath="/backups/${filename}"
keep_days="${BACKUP_KEEP_DAYS:-30}"
trap 'rm -f "${filepath}.partial"' EXIT

mkdir -p /backups
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --host="${POSTGRES_HOST}" --username="${POSTGRES_USER}" --dbname="${POSTGRES_DATABASE}" \
  --format=custom --compress=6 --no-owner --no-acl --file="${filepath}.partial"
pg_restore --list "${filepath}.partial" >/dev/null
mv "${filepath}.partial" "${filepath}"

if [ -n "${S3_ENDPOINT:-}" ] && [ -n "${S3_ACCESS_KEY_ID:-}" ] && [ -n "${S3_SECRET_ACCESS_KEY:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
  mc alias set b2 "${S3_ENDPOINT}" "${S3_ACCESS_KEY_ID}" "${S3_SECRET_ACCESS_KEY}" --api S3v4 >/dev/null
  mc cp "${filepath}" "b2/${S3_BUCKET}/${S3_PREFIX}/${filename}"
  mc stat "b2/${S3_BUCKET}/${S3_PREFIX}/${filename}" >/dev/null
else
  echo "B2 is not configured; continuing with central Google Drive backup only."
fi

find /backups -type f -name 'backup-*.dump' -mtime "+${keep_days}" -delete
# Never let disaster-backup retention traverse tenant packages if the prefix is
# misconfigured. Remote deletion is allowed only inside this exact namespace.
if [ -n "${S3_BUCKET:-}" ] && [ "${S3_PREFIX:-}" = "postgres-backups/disaster-recovery" ]; then
  mc rm --recursive --force --older-than "${keep_days}d" "b2/${S3_BUCKET}/${S3_PREFIX}/" >/dev/null 2>&1 || true
else
  echo "Skipping remote retention: unsafe S3_PREFIX=${S3_PREFIX:-}" >&2
fi
echo "Verified database dump completed: ${filename}"

# ---------------------------------------------------------------------------
# Central Google Drive backup
# Encrypt the dump and upload it via the Next.js app's cron endpoint.
# A failure here causes this script to exit non-zero (the health check
# detects it), but does NOT roll back the already-successful B2 upload.
# ---------------------------------------------------------------------------
central_enabled="${CENTRAL_DATABASE_BACKUP_DRIVE_FOLDER_ID:-}"
cron_secret="${CRON_SECRET:-}"

if [ -z "${central_enabled}" ] && [ -z "${S3_BUCKET:-}" ]; then
  echo "No database backup destination is configured (Google Drive folder and B2 bucket are both empty)." >&2
  exit 1
fi

if [ -z "${central_enabled}" ] || [ -z "${cron_secret}" ]; then
  if [ -n "${central_enabled}" ]; then
    echo "[central-backup] CRON_SECRET is required when central Google Drive backup is enabled." >&2
    exit 1
  fi
  echo "[central-backup] Central Drive upload is disabled; using B2 if configured."
else
    # The application encrypts the dump using the password configured by a
    # super-admin. The raw dump remains on the shared backup volume only for
    # the duration of the authenticated internal request.
    drive_date=$(date -u +"%Y-%m-%d-%H-%M")
    drive_filename="database-${drive_date}.dump"

    # Deterministic run ID: date + first 8 chars of dump filename hash.
    run_id="central-${drive_date}-$(echo "${filename}" | sha256sum | cut -c1-8)"

    raw_sha256=$(sha256sum "${filepath}" | cut -d' ' -f1)
    raw_size=$(stat -c%s "${filepath}")

    # Call the Next.js cron endpoint. The app must be reachable on the Docker
    # network at http://app:3000. If the call fails, log and exit non-zero.
    curl_result=0
    curl -fsS \
      --max-time 3600 \
      -X POST "http://app:3000/api/cron/central-backup" \
      -H "Authorization: Bearer ${cron_secret}" \
      -H "Content-Type: application/json" \
      -d "{\"runId\":\"${run_id}\",\"fileName\":\"${drive_filename}\",\"filePath\":\"${filepath}\",\"fileSizeBytes\":${raw_size},\"sha256\":\"${raw_sha256}\"}" \
      || curl_result=$?

    if [ "${curl_result}" -ne 0 ]; then
      echo "[central-backup] ERROR: cron upload call failed (curl exit ${curl_result}). The encrypted file has been removed. The backup run will be retried at the next scheduled time." >&2
      exit 1
    fi

    echo "[central-backup] central Drive upload triggered successfully: ${drive_filename} (runId=${run_id})"
fi

# This marker represents the primary configured backup path. It is written only
# after the central Drive request succeeds; when Drive is disabled, B2 success is
# sufficient for backward-compatible B2-only operation.
date -u +%s > /backups/last-success
echo "Database backup completed: ${filename}"
