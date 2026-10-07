-- Performance indexes, applied without locking writes.
--
-- Why this file exists: the project has no drizzle/ migration folder (schema
-- changes go out with `drizzle-kit push`), and `push` creates indexes with a
-- plain CREATE INDEX, which takes an ACCESS EXCLUSIVE lock and blocks all writes
-- to the table for the duration. Run this against the production database first;
-- `drizzle-kit push` will then report no diff for these indexes because the
-- names match src/db/schema.ts exactly.
--
-- Run each statement on its own connection, NOT inside a transaction block
-- (CREATE INDEX CONCURRENTLY cannot run in one):
--
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
--     -f - < scripts/sql/add-perf-indexes.sql
--
-- All statements are IF NOT EXISTS, so re-running is safe. If a statement is
-- interrupted, Postgres can leave an INVALID index behind — check with
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- and DROP INDEX CONCURRENTLY any it lists before re-running.

-- C1: the unhinted login CTE matches lower(<email column>) across six tables.
-- students and staff already had their lower() expression indexes; these four did
-- not, so every login attempt sequentially scanned all four. The UNIQUE
-- constraints on these columns index the raw value, which the planner cannot use
-- for a function call.
CREATE INDEX CONCURRENTLY IF NOT EXISTS institutions_lower_contact_email_idx
  ON institutions (lower(contact_email));

CREATE INDEX CONCURRENTLY IF NOT EXISTS institution_admins_lower_email_idx
  ON institution_admins (lower(email));

CREATE INDEX CONCURRENTLY IF NOT EXISTS employees_lower_email_idx
  ON employees (lower(email));

CREATE INDEX CONCURRENTLY IF NOT EXISTS super_admins_lower_email_idx
  ON super_admins (lower(email));

-- Refresh the planner statistics for the new expressions immediately rather than
-- waiting for autoanalyze.
ANALYZE institutions;
ANALYZE institution_admins;
ANALYZE employees;
ANALYZE super_admins;

-- C2: index gaps confirmed against the predicates that actually run.
--
-- The student test list (src/app/api/student/tests/route.ts) drives off
-- online_tests filtered by institution_id and ordered by created_at DESC, id DESC,
-- but the table had only the unique index on test_id — so every request to the
-- mobile app's tests tab was a sequential scan plus a sort. Column order matches
-- the query; Postgres scans this index backwards for the all-DESC ordering.
CREATE INDEX CONCURRENTLY IF NOT EXISTS online_tests_institution_created_idx
  ON online_tests (institution_id, created_at, id);

-- Serves the hourly prune added in src/lib/token-maintenance.ts. Without it the
-- `expires_at < cutoff` delete reads every row in a table that only grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS refresh_tokens_expires_at_idx
  ON refresh_tokens (expires_at);

ANALYZE online_tests;
ANALYZE refresh_tokens;

-- Deliberately NOT added, each checked against the real predicates rather than
-- assumed (every index costs write throughput, so a redundant one is a net loss):
--
--   grading_scales(institution_id)      — the column is declared .unique(), so a
--                                         unique btree already indexes it.
--   institution_holidays(institution_id, date)
--                                       — institution_holiday_unique is already a
--                                         composite btree on exactly those two
--                                         columns in that order, and all six call
--                                         sites lead with institution_id.
--   platform_pages(slug), blogs(slug)   — both declared .unique().
--   blogs(status, slug)                 — the /blog/[slug] page filters slug AND
--                                         status; the unique slug index finds one
--                                         row and the status check is a filter on
--                                         it. The /blog list scans a table of
--                                         hand-written marketing posts.
--   audit_logs(institution_id, ...)     — the only reader (the super-admin audit
--                                         page) has no institution predicate at
--                                         all; it orders by timestamp, which is
--                                         already indexed. institution_id appears
--                                         only in the DELETE that runs when an
--                                         institution is purged, so indexing it
--                                         would tax every audit-log insert to
--                                         speed up a rare admin operation.

