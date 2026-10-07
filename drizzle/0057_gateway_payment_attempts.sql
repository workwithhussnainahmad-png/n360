CREATE TABLE gateway_payment_attempts (
  id varchar(20) PRIMARY KEY,
  institution_id integer NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  invoice_id integer REFERENCES fee_invoices(id) ON DELETE RESTRICT,
  application_id integer REFERENCES admission_applications(id) ON DELETE RESTRICT,
  gateway varchar(20) NOT NULL CHECK (gateway IN ('easypaisa','jazzcash','hblpay')),
  environment varchar(20) NOT NULL CHECK (environment IN ('sandbox','production')),
  merchant_id varchar(160) NOT NULL,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 21474836),
  currency varchar(3) NOT NULL DEFAULT 'PKR' CHECK (currency = 'PKR'),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','REVIEW')),
  credentials_encrypted text NOT NULL,
  return_url text NOT NULL,
  institution_name text NOT NULL,
  payer_name text NOT NULL,
  description text NOT NULL,
  receipt_number varchar(50) UNIQUE,
  provider_reference varchar(160),
  provider_response_code varchar(20),
  evidence_digest varchar(64),
  qr_image text,
  last_checked_at timestamp,
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  CHECK ((invoice_id IS NOT NULL)::int + (application_id IS NOT NULL)::int = 1),
  CHECK ((status = 'PENDING' AND verified_at IS NULL AND receipt_number IS NULL)
    OR (status IN ('PAID','REVIEW') AND verified_at IS NOT NULL AND receipt_number IS NOT NULL))
);
CREATE INDEX gateway_attempts_invoice_idx ON gateway_payment_attempts(institution_id, invoice_id, created_at);
CREATE INDEX gateway_attempts_application_idx ON gateway_payment_attempts(institution_id, application_id, created_at);
CREATE INDEX gateway_attempts_status_idx ON gateway_payment_attempts(institution_id, status, created_at);

-- Do not silently move a financial record to a different institution or target.
CREATE FUNCTION guard_gateway_payment_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('PAID','REVIEW') THEN
      RAISE EXCEPTION 'Verified payment records are immutable';
    END IF;
    IF ROW(NEW.id, NEW.institution_id, NEW.invoice_id, NEW.application_id, NEW.gateway,
      NEW.environment, NEW.merchant_id, NEW.amount, NEW.currency, NEW.credentials_encrypted,
      NEW.return_url, NEW.institution_name, NEW.payer_name, NEW.description, NEW.created_at, NEW.expires_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.institution_id, OLD.invoice_id, OLD.application_id, OLD.gateway,
      OLD.environment, OLD.merchant_id, OLD.amount, OLD.currency, OLD.credentials_encrypted,
      OLD.return_url, OLD.institution_name, OLD.payer_name, OLD.description, OLD.created_at, OLD.expires_at) THEN
      RAISE EXCEPTION 'Payment terms are immutable';
    END IF;
  END IF;
  IF NEW.invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fee_invoices WHERE id = NEW.invoice_id AND institution_id = NEW.institution_id
  ) THEN RAISE EXCEPTION 'Payment invoice tenant mismatch'; END IF;
  IF NEW.application_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM admission_applications WHERE id = NEW.application_id AND institution_id = NEW.institution_id
  ) THEN RAISE EXCEPTION 'Payment application tenant mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gateway_payment_attempt_guard BEFORE INSERT OR UPDATE ON gateway_payment_attempts
FOR EACH ROW EXECUTE FUNCTION guard_gateway_payment_attempt();
