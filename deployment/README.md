# Release and tenant-host setup

The base Compose file remains usable for local builds. For AWS ARM64 releases,
build the app once and use its same registry digest for `app` and `app2`.
Receipt and restore workers share their worker artifact; migrations and backups
have separate targets. The web image contains the standalone app and two server
transport scripts. Worker images contain compiled workers and production
dependencies, run as an unprivileged user, and omit source/test/release tools.
The migration script and SQL belong only to the separate migrator image.
App, worker and migrator containers drop Linux capabilities and disallow gaining
new privileges. Deployment commands below explicitly start services when run.

1. Run `npm run verify:local` and `npm run build`.
2. Build local ARM64 artifacts with `node --env-file=.env scripts/build-release.mjs <source-revision>`.
   This step requires Docker Buildx/emulation on an x86 builder. It does not push.
   The builder receives only the public app domain and Cloudinary cloud name,
   plus the revision. Runtime database/mail/OAuth/API secrets are not build args.
3. After your authorized registry publication, copy `release.env.example` to
   `deployment/release.env` and enter actual tested immutable image digests.
   Registry inspection must confirm `linux/arm64`; this checkout's local Next
   build does not prove an ARM64 container build.
4. Run `npm run release:preflight`. It validates the merged Compose configuration
   and records only revision/image identities in ignored `deployment/releases/`.
5. Before migration, create a private PostgreSQL custom-format dump and validate
   it with `pg_restore --list`. Record the migration ledger with the release.
6. On deployment use both Compose files and both env files:

   ```sh
   docker compose --env-file .env --env-file deployment/release.env \
     -f docker-compose.yml -f deployment/compose.release.yml pull
   docker compose --env-file .env --env-file deployment/release.env \
     -f docker-compose.yml -f deployment/compose.release.yml run --rm migrate
   docker compose --env-file .env --env-file deployment/release.env \
     -f docker-compose.yml -f deployment/compose.release.yml up -d --wait \
     postgres pgbouncer valkey app app2 caddy push-receipt-worker institution-restore-worker
   ```

   Start the backup service only after central Google Drive OAuth, folders and
   the administrator encryption password are configured. Validate readiness,
   login, one tenant host, email delivery and a backup before recording success.
   Application rollback uses previous image digests. It does not undo migrations;
   migration 0074 enables multiple challans in a month, so an older fee generator
   must not be used after one-time billing begins.

## Institution/campus certificates

The Caddyfile uses a restricted on-demand TLS `ask` endpoint at
`http://app:3000/api/public/tls-authorization`. It allows the configured root and
portal hosts, approved/nondeleted root institution slugs/usernames and registered
nested campus login names such as `ncs.green.nisaab360.app`. Unknown hosts,
unapproved/deleted tenants, URLs, IPs and arbitrary suffixes are denied. Database
failure denies new issuance. The endpoint does not authenticate any user.
Caddy blocks public forwarding of this permission path; its own `ask` requests
go directly to the private app network.

DNS must still point each intended hostname to the server; ports 80/443 must be
reachable. Caddy uses HTTP-01 because this deployment's Cloudflare proxy prevents
direct TLS-ALPN validation. Cloudflare's browser certificate must also cover the
hostname: default first-level wildcard coverage does not cover nested campus
names. Verify both browser-to-Cloudflare and Cloudflare-to-origin TLS on AWS.
Existing certificates remain cached until expiry; deletion does not instantly
revoke a certificate. Application tenant authorization remains authoritative.
The permission endpoint uses the main app; the main app must be ready for new
certificate issuance. Caddy state volumes must persist across releases.

Reference: [Caddy on-demand TLS](https://caddyserver.com/docs/automatic-https#on-demand-tls).

## Printed-card keys

Configure `STUDENT_QR_SIGNING_SECRET` with an independent random secret of at
least 32 characters and `STUDENT_QR_KEY_ID` before printing new production cards.
New tokens include the key ID. Rotating JWT secrets does not affect these cards.
Keep at most three previous keys in `STUDENT_QR_PREVIOUS_KEYS`, each with a future
ISO `expiresAt`, then remove them after the transition window. Changing a key
requires a new key ID.

For already printed legacy cards, retain the original JWT signing value in
`STUDENT_QR_LEGACY_SECRET` and choose `STUDENT_QR_LEGACY_VALID_UNTIL`. Without a
future legacy expiry, configuring a dedicated key disables old unversioned cards.
With the dedicated setting empty, legacy behavior is preserved. Actual secrets
belong only in ignored `.env`/secret storage; examples contain no working keys.

## Fees

Existing invoices retain their amounts and monthly identity. Existing adjustments
keep recurring behavior; inspect their duration explicitly in the billing panel.
New adjustments default to once and allow a start/end month. A once adjustment is
consumed only when a new monthly challan actually uses a positive amount.
Monthly generation is transactional, skips existing monthly bills, and blocks
missing class/head amounts. An explicit 0 is allowed and a zero-total invoice is
recorded as paid without fabricating a payment. One-time batches have stable UUID
request identities: retries return the original result, changed payloads under
the same identity are rejected, and a new batch is a distinct intentional charge.

The automated verification gate uses disposable PostgreSQL fixtures and no live
credentials. Live Google Drive restore drills and deployed capacity tests remain
separate operational work; never restore a test backup over the current database.
Local verifiers that use real database/Redis/Drive credentials are excluded from
Git and Docker and have no public npm commands. Private environment/key files,
data dumps, uploaded files and diagnostic evidence stay outside version control.

GitHub CI uses read-only repository permissions and does not persist checkout
credentials, publish artifacts or deploy. It runs the same local gate, an empty
disposable database migration, a build and offline billing browser checks.
Action configuration follows [checkout](https://github.com/actions/checkout) and
[setup-node](https://github.com/actions/setup-node) documentation. A GitHub run
remains pending until the user publishes the workflow.
