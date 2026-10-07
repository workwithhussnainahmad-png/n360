-- The invoice/payment system introduced in 0037 and 0045 is now the only live
-- fee workflow. Disable the old scheduler immediately, including for workers
-- that have not yet been redeployed. Historical rows remain read-only so
-- backups and manual audits retain the original evidence.
UPDATE "institutions"
SET "accept_fee_vouchers" = false
WHERE "accept_fee_vouchers" = true;

COMMENT ON TABLE "fee_vouchers" IS
  'Read-only legacy archive. New fee proofs belong to fee_payment_submissions.';
COMMENT ON TABLE "fee_voucher_cycles" IS
  'Read-only legacy archive. New monthly obligations belong to fee_invoices.';
