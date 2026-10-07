CREATE INDEX IF NOT EXISTS "super_admins_lower_email_idx" ON "super_admins" (lower("email"));
CREATE INDEX IF NOT EXISTS "employees_lower_email_idx" ON "employees" (lower("email"));
CREATE INDEX IF NOT EXISTS "institutions_lower_contact_email_idx" ON "institutions" (lower("contact_email"));
CREATE INDEX IF NOT EXISTS "staff_lower_email_idx" ON "staff" (lower("email"));
CREATE INDEX IF NOT EXISTS "students_lower_login_roll_number_idx" ON "students" (lower("login_roll_number"));
