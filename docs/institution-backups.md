# Institution Google Drive backups

Institution backups are customer-owned exports and are separate from the PostgreSQL disaster-recovery backup in the `postgres-backup` container. The database backup service and its B2 layout are not changed by this feature.

## Destination and retention

After an institution connects Google Drive, the application creates:

```text
Nisaab360/
└── InstitutionName/
    └── InstitutionName Backup.zip
```

There is one visible current file per institution. Each nightly job creates a new ZIP, verifies the uploaded byte count, and updates/replaces the same Drive file. A failed job does not remove the previous successful file. Drive credentials and the ZIP password are encrypted in the LMS database; the password is never returned by the settings API.

## ZIP contents

The archive contains `data.jsonl`, `README.txt`, and `backup-info.json`. It includes rows belonging to that institution, including dependent child records, and deliberately excludes authentication hashes, tokens, reset secrets, push tokens, operational backup metadata, and email outbox rows. Cloudinary media binaries are not copied; the export preserves database media keys/URLs.

The archive is AES-256 password protected. The institution owner configures a password of 14–200 characters after connecting Drive. Since the worker must use it at midnight, it is encrypted with the application credential-encryption key rather than stored as a one-way hash.

## Flow

1. `GET /api/institution/settings/google-drive/connect` returns a Google OAuth authorization URL.
2. Google redirects to `/api/institution/settings/google-drive/callback`.
3. The callback exchanges the authorization code, creates/finds `Nisaab360/<InstitutionName>`, and stores the encrypted refresh token and folder ID.
4. `PUT /api/institution/settings/google-drive` stores/rotates the archive password.
5. The push-receipt worker queues approved institutions with both Drive credentials and a configured password, then processes jobs sequentially.
6. The job takes a repeatable-read tenant snapshot, creates the ZIP, uploads/replaces the single Drive file, verifies its size, and records a `gdrive:<file-id>` object key, checksum, counts, and timestamp.

## Operations

`npm run verify:backups` checks completed institution job records against their Google Drive file IDs and expected sizes. The former institution B2 download/verify/restore endpoints return `410 Gone`; they must not be used for this workflow. Full database recovery remains the responsibility of the PostgreSQL backup runbook.

## Institution restoration

The institution owner opens **Institution → Settings → Institution restore requests**, uploads the original Google Drive ZIP, and supplies its password. Delegated institution administrators cannot submit or approve restores. The password is used only during upload and is not persisted. Staged restore data is encrypted with the existing credential encryption key; preserve that key during recovery.

The background worker validates version 2 JSONL exports in temporary PostgreSQL tables. The importer checks archive authentication, names, actual decompressed sizes, manifest counts, column compatibility, primary/unique/check constraints, foreign keys, tenant ownership and identifier collisions. The ZIP ceiling is 16 MB, decompressed data 64 MB, and records 100,000. All 17 supported tables must appear in the manifest, including empty tables. CSV exports and full PostgreSQL dumps are not accepted.

The supported replacement scope is assignments/submissions, student/staff attendance, tests/marks/online tests/questions/submissions, batch exams/subjects/results, diaries, and courses/class links/lectures/progress. Every current record in these categories is replaced for the institution, including newer records. Accounts, passwords, permissions, institution settings, class/section/subject structure, admissions, fees/payments, announcements, audit logs and provider credentials remain current. This is not a full tenant recreation. Existing referenced accounts and academic structure must still exist; otherwise the request fails validation. Media URLs and keys are restored, but media binaries and remote availability are not checked.

The institution owner or a created institution admin reviews the replacement counts and warnings and approves the exact preview. A SUPER_ADMIN opens **Super-admin → Backups → Institution restore requests**, reviews the approved preview, and queues execution. Created institution admins may submit and approve restores for their own institution. Super-admins and employees cannot approve on behalf of the institution. A change in current restored records or referenced identity/academic tables after preview causes execution to produce a new preview and clear the earlier approval. The institution owner or a created admin must approve again.

Execution saves an encrypted pre-restore recovery snapshot and replaces the supported records in one database transaction. Errors roll back all record changes. PostgreSQL table locks wait for prior writers and pause writes to the supported tables across the platform during execution; this also protects dependent rows without a tenant column and handles writers from other replicas/workers. Reads remain available. These locks are deliberately broader than a tenant-only UI pause. No historical payment, email or push actions are replayed. The worker sends an in-app status notification to the owner.

After the transaction commits, the job enters `CACHE_PENDING` until shared read caches and fill locks are invalidated. If Redis is unavailable, cleanup retries without re-importing data. Authentication/session keys remain intact. Interrupted pre-commit work is marked failed after a replacement worker acquires the global worker lease; committed cleanup jobs survive restart. Only one restore worker may process work at once, and each institution may have one active request and at most three submissions in 24 hours.

Completed requests with a retained snapshot expose **Prepare recovery from pre-restore snapshot** to super-admins and employees. This creates a new preview/institution-approval request rather than bypassing the approval process. Snapshots expire after 30 days. Staged payloads expire seven days after a terminal state; cleanup runs in the worker. Audit metadata and preview counts remain. Terminal failures may be resubmitted, subject to the daily limit.

### Deployment and verification

Apply `drizzle/0061_institution_restore_requests.sql` and `drizzle/0062_employee_backup_permissions.sql` through `npm run db:migrate:production`; the existing production migration runner includes it. Rebuild the app and worker images, then start the new `institution-restore-worker` service. Both replicas and the restore worker need `DIRECT_URL` pointing directly to PostgreSQL and the same `STREAMING_CREDENTIALS_SECRET` (or the existing `JWT_SECRET` fallback). Compose supplies the worker key. The dedicated restore worker has a 1,024 MB heap ceiling for bounded staging and recovery encryption and runs separately from receipt/email delivery. Local `npm start` applies the migration and the local email worker also processes restores. The k6 override excludes the dedicated restore worker unless the `with-backup` profile is enabled. The old B2 restore script remains disabled.

`npm run verify:restores` runs isolated PGlite SQL fixtures, actual AES ZIP interoperability, tenant/reference checks, owner/admin state transitions, changed-preview invalidation, encryption, recovery and injected failure rollback. It never restores production data. PGlite tests do not establish concurrent multi-session PostgreSQL lock behavior; verify deployment with a disposable institution before operational use.

Employees can configure the platform public-site base domain from their dashboard and manage central backup settings, institution backup jobs, and owner-approved restores from their Backups page. Employee requests use employee foreign keys and audit roles; existing super-admin attribution is preserved. Full database restoration is still an operator runbook operation, not an employee portal action.

Institution-admin parity (October 5): created institution admins can submit, review, approve and cancel restoration requests for their own institution. Employees and regular/root super admins execute only the approved preview. The three owner-only capabilities are creating/deleting institution admins, deleting the institution account and payment-gateway configuration. Apply `drizzle/0063_institution_admin_profile_review.sql` before deploying the new app, in addition to the earlier backup/restore migrations; it adds separate admin attribution to profile-request reviews.
