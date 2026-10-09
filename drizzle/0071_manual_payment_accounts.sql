ALTER TABLE fee_payment_submissions ADD COLUMN IF NOT EXISTS payment_account jsonb;
ALTER TABLE fee_payment_submissions ADD COLUMN IF NOT EXISTS submitted_by_role varchar(20);
ALTER TABLE fee_payment_submissions ADD COLUMN IF NOT EXISTS submitted_by_id integer;
ALTER TABLE admission_fee_payments ADD COLUMN IF NOT EXISTS payment_account jsonb;
CREATE TABLE IF NOT EXISTS admission_fee_proofs (
  id serial PRIMARY KEY,
  institution_id integer NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id integer NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
  payment_id integer NOT NULL REFERENCES admission_fee_payments(id) ON DELETE CASCADE,
  payment_account jsonb,
  source_bank_name varchar(120) NOT NULL,
  transaction_id varchar(160) NOT NULL,
  proof_file_key varchar(500) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','VERIFIED','REJECTED')),
  reviewer_note varchar(500), verified_by integer, verified_at timestamp,
  submitted_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admission_fee_proofs_application_idx ON admission_fee_proofs(institution_id,application_id,submitted_at);
INSERT INTO admission_fee_proofs(institution_id,application_id,payment_id,source_bank_name,transaction_id,proof_file_key,status,reviewer_note,verified_by,verified_at,submitted_at)
SELECT institution_id,application_id,id,coalesce(payer_source_bank,'Legacy payment'),coalesce(payer_reference,'Legacy receipt'),proof_file_key,status::text,reviewer_note,verified_by,verified_at,coalesce(submitted_at,created_at)
FROM admission_fee_payments p WHERE proof_file_key IS NOT NULL AND status::text IN ('SUBMITTED','VERIFIED','REJECTED')
AND NOT EXISTS (SELECT 1 FROM admission_fee_proofs h WHERE h.payment_id=p.id);
CREATE UNIQUE INDEX IF NOT EXISTS student_manual_reference_unique ON fee_payment_submissions(institution_id,(payment_account->>'id'),lower(btrim(transaction_id))) WHERE payment_account IS NOT NULL AND status IN ('SUBMITTED','VERIFIED');
CREATE UNIQUE INDEX IF NOT EXISTS admission_manual_reference_unique ON admission_fee_proofs(institution_id,(payment_account->>'id'),lower(btrim(transaction_id))) WHERE payment_account IS NOT NULL AND status IN ('SUBMITTED','VERIFIED');
