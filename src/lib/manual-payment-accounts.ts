import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { institutions } from '@/db/schema';
import type { PaymentAccount } from './payment-account-types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function getPaymentAccounts(institutionId: number): Promise<PaymentAccount[]> {
  const [institution] = await db.select({ accounts: institutions.feePaymentMethods }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  return institution?.accounts ?? [];
}
export async function resolvePaymentAccount(tx: Transaction, institutionId: number, accountId: string): Promise<PaymentAccount> {
  const [institution] = await tx.select({ accounts: institutions.feePaymentMethods }).from(institutions).where(eq(institutions.id, institutionId)).for('share');
  const account = institution?.accounts.find(row => row.id === accountId);
  if (!account) throw new Error('PAYMENT_ACCOUNT_UNAVAILABLE');
  return account;
}
export async function assertPaymentReferenceUnused(tx: Transaction, institutionId: number, accountId: string, reference: string) {
  const normalized = reference.trim().toLowerCase();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`manual-payment:${institutionId}:${accountId}:${normalized}`}))`);
  const result = await tx.execute(sql`SELECT 1 FROM fee_payment_submissions
    WHERE institution_id=${institutionId} AND payment_account->>'id'=${accountId}
      AND lower(btrim(transaction_id))=${normalized} AND status IN ('SUBMITTED','VERIFIED')
    UNION ALL SELECT 1 FROM admission_fee_proofs WHERE institution_id=${institutionId}
      AND payment_account->>'id'=${accountId} AND lower(btrim(transaction_id))=${normalized}
      AND status IN ('SUBMITTED','VERIFIED') LIMIT 1`);
  if (result.rows.length) throw new Error('PAYMENT_REFERENCE_USED');
}
