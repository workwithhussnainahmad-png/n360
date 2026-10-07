CREATE TABLE IF NOT EXISTS institution_restore_requests (
  id serial PRIMARY KEY,
  institution_id integer NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'PREVIEW_PENDING' CHECK (status IN (
    'PREVIEW_PENDING','PREVIEW_RUNNING','AWAITING_APPROVAL','APPROVED',
    'EXECUTION_PENDING','EXECUTION_RUNNING','CACHE_PENDING','COMPLETED','FAILED','REJECTED')),
  payload_encrypted text,
  archive_sha256 varchar(64) NOT NULL,
  backup_generated_at timestamp NOT NULL,
  preview jsonb,
  preview_hash varchar(64),
  approved_at timestamp,
  execution_requested_by integer REFERENCES super_admins(id) ON DELETE SET NULL,
  recovery_encrypted text,
  recovery_expires_at timestamp,
  source_restore_id integer REFERENCES institution_restore_requests(id) ON DELETE SET NULL,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS institution_restore_requests_tenant_idx ON institution_restore_requests(institution_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS institution_restore_one_active_idx ON institution_restore_requests(institution_id)
  WHERE status NOT IN ('COMPLETED','FAILED','REJECTED');
