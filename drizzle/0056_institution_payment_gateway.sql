CREATE TABLE IF NOT EXISTS institution_payment_gateways (
  institution_id integer PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  credentials_encrypted text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
