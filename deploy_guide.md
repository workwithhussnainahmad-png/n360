# Easy Deploy Guide

Test locally first. Do not skip.

## Local Test
1. Run `npx tsc --noEmit`. Fix errors.
2. Run `npm run lint`. Fix errors.
3. Run `npm run lint:tenant`. Fix errors.
4. Run `npm run build`. Fix errors.

## VPS Deploy Steps

### Step 0: Backup DB (CRITICAL)
Database backup missing. Do this first.
1. Go to backend folder on VPS: `cd /path/to/lms-backend`
2. Make backup: `docker compose exec -T postgres pg_dump -U app -d app -Fc > nisaab360-backup.dump`
3. Check backup is not empty: `ls -lh nisaab360-backup.dump`
4. Verify backup data: `docker compose exec -T postgres pg_restore --list < nisaab360-backup.dump | head -30`
5. Download `nisaab360-backup.dump` to your own computer.

### Step 1: Add Indexes (No Downtime)
Makes database faster.
1. Check current speed: `docker compose exec -T postgres psql -U app -d app -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM institutions WHERE lower(contact_email) = 'nobody@example.com';"` (Look for "Seq Scan").
2. Apply indexes: `docker compose exec -T postgres psql -U app -d app -f - < scripts/sql/add-perf-indexes.sql`
3. Check new speed: Run command from 1 again. (Look for "Index Scan").
4. Verify no broken indexes: `docker compose exec -T postgres psql -U app -d app -c "SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;"`. Must show 0 rows.

### Step 2: Deploy App & Services
Do not use normal `up -d`. Follow exactly.
1. Get latest Caddy: `docker compose pull caddy`
2. Build new code: `docker compose build app app2 push-receipt-worker`
3. Start them: `docker compose up -d --no-deps app app2 push-receipt-worker caddy`
4. Check Caddy config: `docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile`
5. Check worker logs: `docker compose logs --tail=50 push-receipt-worker` (Look for "Push receipt worker started").

Prepared database reads are enabled by the current Compose configuration. Before
rolling the apps, deploy the updated PgBouncer configuration and verify PgBouncer
is at least 1.21 with `max_prepared_statements` nonzero (Compose sets 200). For an
older or external pooler without protocol-level prepared-statement support, set
`DB_PREPARED_STATEMENTS=0` and recreate both apps. This switch restores unnamed
queries without a data migration. After DDL changes a prepared query's result
types, use PgBouncer's administrative `RECONNECT` and roll app connections before
serving the new schema; see the [PgBouncer migration guidance](https://www.pgbouncer.org/config.html#max_prepared_statements).

### Step 3: Test Security
1. Check API lock: `curl -i -H 'x-user-session: {"userId":1,"role":"SUPER_ADMIN","institutionId":1}' https://institution.nisaab360.app/api/institution/account`. Must return **401 Unauthorized**, not 200.
2. Check Rate Limit: Spam login endpoint with wrong password 10 times. Must return **429 Too Many Requests** after 5 tries.
3. Check Compression: `curl -sI -H 'Accept-Encoding: zstd, gzip' https://nisaab360.app/api/health | grep -i content-encoding`. Must show `zstd` or `gzip`.
4. Test Logins: Log in as all roles manually on website and app.

### Step 4: Restart Database
Brief downtime (10-30s). Applies new memory settings.
1. Restart DB: `docker compose up -d postgres`
2. Check settings applied: `docker compose exec -T postgres psql -U app -d app -c "SHOW shared_buffers; SHOW effective_cache_size; SHOW work_mem; SHOW jit;"` (Should be 1536MB / 4GB / 16MB / off).
3. Test big exports (transcripts/CSV) to ensure they aren't slow.

### Step 5: Watch Cleanup Jobs
Old data will delete automatically over a few hours.
1. Check backlog: `docker compose exec -T postgres psql -U app -d app -c "SELECT count(*) AS old_refresh_tokens FROM refresh_tokens WHERE expires_at < now() - interval '30 days';"`
2. Watch logs: `docker compose logs push-receipt-worker`

### Step 6: Fix Backup System 
Current automatic backups fail silently.
Option A: Find and commit missing `backup/` folder on VPS.
Option B: Use official image. Change `build: ./backup` to `image: eeshugerman/postgres-backup-s3:16` in `docker-compose.yml`.
