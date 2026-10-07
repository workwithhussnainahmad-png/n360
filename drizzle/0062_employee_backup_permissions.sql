ALTER TABLE institution_backups ADD COLUMN IF NOT EXISTS requested_by_employee integer REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE central_backup_settings ADD COLUMN IF NOT EXISTS updated_by_employee integer REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE institution_restore_requests ADD COLUMN IF NOT EXISTS execution_requested_by_employee integer REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE institution_restore_requests ADD COLUMN IF NOT EXISTS execution_requested_role varchar(16) CHECK (execution_requested_role IN ('SUPER_ADMIN','EMPLOYEE'));
UPDATE institution_restore_requests SET execution_requested_role='SUPER_ADMIN' WHERE execution_requested_by IS NOT NULL AND execution_requested_role IS NULL;
