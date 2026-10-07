CREATE INDEX IF NOT EXISTS "audit_logs_timestamp_idx"
  ON "audit_logs" ("timestamp" DESC);
