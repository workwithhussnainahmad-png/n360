import { verifyJazzCashUpdate, jazzCashSoapAcknowledgement, inquireJazzCash } from "./jazzcash-soap";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { admissionApplications, admissionApplicationEvents, admissionFeePayments, feeInvoices, feePayments,
  gatewayPaymentAttempts, institutionPaymentGateways, institutions, students } from "@/db/schema";
import { decryptGatewayCredentials, encryptGatewayCredentials } from "@/lib/payment-credentials";
import { gatewayReadiness, jazzCashEndpoint, paymentOrigin } from "./config";
import { jazzCashCheckout, verifyJazzCash } from "./jazzcash";
import { hblCheckout, verifyHbl } from "./hbl-cybersource";
import { generateEasypaisaQr, inquireEasypaisa } from "./easypaisa";
import { settlementDecision, validAmount, type Gateway } from "./policy";

export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export type PaymentTarget = { invoiceId: number; studentId: number } | { applicationId: number; applicantId: number };
export type PaymentAttempt = typeof gatewayPaymentAttempts.$inferSelect;

export async function startPayment(institutionId: number, target: PaymentTarget, gateway: Gateway, sandbox = false, database = db) {
  const result = await database.transaction(async (tx) => {
    const [configuration] = await tx.select().from(institutionPaymentGateways).where(eq(institutionPaymentGateways.institutionId, institutionId));
    const credentials = configuration ? decryptGatewayCredentials(institutionId, configuration.credentialsEncrypted) : null;
    const readiness = gatewayReadiness(credentials, gateway);
    if (!credentials?.[gateway] || (!sandbox && !readiness.ready)) throw new PaymentError(readiness.reason, 503);
    if (sandbox && credentials.settings?.[gateway]?.environment !== "sandbox") throw new PaymentError("Save sandbox credentials before running a test", 400);
    if (gateway === "hblpay" && credentials.hblpay?.integration !== "cybersource-hosted") throw new PaymentError("HBL Hosted Checkout profile required", 400);
    const merchantId = gateway === "jazzcash" ? credentials.jazzcash!.merchantId : gateway === "easypaisa" ? credentials.easypaisa!.accountNum : credentials.hblpay!.profileId;
    const [institution] = await tx.select({ name: institutions.name }).from(institutions).where(eq(institutions.id, institutionId));
    if (!institution) throw new PaymentError("Institution unavailable", 404);
    let amount: number, payerName: string, description: string;
    let invoiceId: number | null = null, applicationId: number | null = null;
    if ("invoiceId" in target) {
      const [invoice] = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.id, target.invoiceId),
        eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, target.studentId))).for("update");
      if (!invoice || !["DUE", "PARTIAL"].includes(invoice.status)) throw new PaymentError("Challan is not payable");
      const [student] = await tx.select({ name: students.name }).from(students).where(and(eq(students.id, target.studentId), eq(students.institutionId, institutionId)));
      if (!student) throw new PaymentError("Student unavailable", 404);
      invoiceId = invoice.id; amount = validAmount(invoice.totalAmount - invoice.paidAmount);
      payerName = student.name; description = `Monthly fee ${invoice.billingMonth} · Challan ${invoice.id}`;
    } else {
      const [application] = await tx.select().from(admissionApplications).where(and(eq(admissionApplications.id, target.applicationId),
        eq(admissionApplications.institutionId, institutionId), eq(admissionApplications.applicantId, target.applicantId))).for("update");
      const [fee] = await tx.select().from(admissionFeePayments).where(and(eq(admissionFeePayments.applicationId, target.applicationId),
        eq(admissionFeePayments.institutionId, institutionId))).for("update");
      if (!application || !fee || application.status !== "FEE_PENDING" || !["PENDING", "REJECTED"].includes(fee.status)) {
        throw new PaymentError("Admission fee is not payable");
      }
      applicationId = application.id; amount = validAmount(fee.amount);
      payerName = application.studentName; description = `Admission fee · Application ${application.id}`;
    }
    // Target row lock serializes double clicks, including concurrent browser tabs.
    const [pending] = await tx.select().from(gatewayPaymentAttempts).where(and(
      eq(gatewayPaymentAttempts.institutionId, institutionId),
      invoiceId !== null ? eq(gatewayPaymentAttempts.invoiceId, invoiceId) : eq(gatewayPaymentAttempts.applicationId, applicationId!),
      eq(gatewayPaymentAttempts.environment, sandbox ? "sandbox" : "production"),
      eq(gatewayPaymentAttempts.status, "PENDING"), gt(gatewayPaymentAttempts.expiresAt, new Date()),
    )).orderBy(desc(gatewayPaymentAttempts.createdAt)).limit(1);
    if (pending) {
      if (pending.amount !== amount || pending.gateway !== gateway) throw new PaymentError("An earlier payment is still pending. Check its status before starting another.");
      return pending;
    }
    const now = new Date();
    const [attempt] = await tx.insert(gatewayPaymentAttempts).values({
      id: `T${randomBytes(9).toString("hex").toUpperCase()}`, institutionId, invoiceId, applicationId,
      gateway, environment: sandbox ? "sandbox" : "production", merchantId, amount,
      credentialsEncrypted: encryptGatewayCredentials(institutionId, { [gateway]: credentials[gateway] }),
      returnUrl: `${paymentOrigin()}/api/payments/${gateway}/return`,
      institutionName: institution.name, payerName, description,
      createdAt: now, expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    }).returning();
    return attempt;
  });
  if (gateway === "easypaisa") {
    await ensurePaymentQr(result.id, database);
    return { attemptId: result.id, checkoutUrl: `/payments/${result.id}` };
  }
  if (gateway === "hblpay") {
    const merchant = decryptGatewayCredentials(institutionId, result.credentialsEncrypted)?.hblpay;
    if (!merchant) throw new PaymentError("Payment configuration unavailable", 503);
    return { attemptId: result.id, redirectUrl: result.environment === "sandbox" ? "https://testsecureacceptance.cybersource.com/pay" : "https://secureacceptance.cybersource.com/pay", payload: hblCheckout(result, merchant) };
  }
  const merchant = decryptGatewayCredentials(institutionId, result.credentialsEncrypted)?.jazzcash;
  if (!merchant) throw new PaymentError("Payment configuration unavailable", 503);
  return { attemptId: result.id, redirectUrl: jazzCashEndpoint(result.environment), payload: jazzCashCheckout(result, merchant) };
}

export async function processJazzCashCallback(fields: Record<string, string>, database = db) {
  const id = fields.pp_TxnRefNo;
  if (!/^[A-Za-z0-9]{1,20}$/.test(id || "")) throw new PaymentError("Invalid payment reference", 400);
  // Snapshot is retained across credential rotation/removal so in-flight payments can settle.
  const [attempt] = await database.select().from(gatewayPaymentAttempts).where(eq(gatewayPaymentAttempts.id, id));
  if (!attempt || attempt.gateway !== "jazzcash") throw new PaymentError("Unknown payment", 404);
  const merchant = decryptGatewayCredentials(attempt.institutionId, attempt.credentialsEncrypted)?.jazzcash;
  if (!merchant) throw new PaymentError("Payment configuration unavailable", 503);
  let verified: ReturnType<typeof verifyJazzCash>;
  try { verified = verifyJazzCash(fields, attempt, merchant); }
  catch { throw new PaymentError("Payment verification failed", 401); }
  if (!verified.paid) return { id, status: attempt.status, code: verified.code };

  return settleConfirmedPayment(id, "jazzcash", verified, database);
}

type VerifiedPayment = { code: string; reference: string | null; evidenceDigest: string };
async function settleConfirmedPayment(id: string, gateway: Gateway, verified: VerifiedPayment, database = db) {
  return database.transaction(async (tx) => {
    const [locked] = await tx.select().from(gatewayPaymentAttempts).where(eq(gatewayPaymentAttempts.id, id)).for("update");
    if (!locked || locked.gateway !== gateway) throw new PaymentError("Payment not found", 404);
    if (locked.status !== "PENDING") return { id, status: locked.status, code: "000" };
    let status: "PAID" | "REVIEW" = "REVIEW";
    // Sandbox money must never affect the real fee ledger.
    if (locked.environment === "production" && locked.invoiceId !== null) {
      const [invoice] = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.id, locked.invoiceId), eq(feeInvoices.institutionId, locked.institutionId))).for("update");
      if (invoice) {
        status = settlementDecision(locked.amount, { kind: "FEE", ...invoice });
        if (status === "PAID") {
          await tx.insert(feePayments).values({ institutionId: locked.institutionId, invoiceId: invoice.id,
            studentId: invoice.studentId, receiptNumber: `GP-${id}`, amount: locked.amount, method: gateway === "easypaisa" ? "EASYPAISA" : gateway === "hblpay" ? "HBL_PAY" : "JAZZCASH",
            reference: verified.reference, notes: `Gateway verified payment; order ${id}`, recordedBy: 0 });
          await tx.update(feeInvoices).set({ paidAmount: invoice.paidAmount + locked.amount, status: "PAID", updatedAt: new Date() }).where(eq(feeInvoices.id, invoice.id));
        }
      }
    } else if (locked.environment === "production" && locked.applicationId !== null) {
      const [application] = await tx.select().from(admissionApplications).where(and(eq(admissionApplications.id, locked.applicationId), eq(admissionApplications.institutionId, locked.institutionId))).for("update");
      const [fee] = await tx.select().from(admissionFeePayments).where(and(eq(admissionFeePayments.applicationId, locked.applicationId), eq(admissionFeePayments.institutionId, locked.institutionId))).for("update");
      if (application && fee) {
        status = settlementDecision(locked.amount, { kind: "ADMISSION", status: application.status, feeStatus: fee.status, amount: fee.amount });
        if (status === "PAID") {
          await tx.update(admissionFeePayments).set({ status: "VERIFIED", payerReference: verified.reference,
            payerSourceBank: gateway.toUpperCase(), verifiedBy: null, verifiedAt: new Date(), updatedAt: new Date(), reviewerNote: null }).where(eq(admissionFeePayments.id, fee.id));
          await tx.update(admissionApplications).set({ status: "FEE_VERIFIED", updatedAt: new Date() }).where(eq(admissionApplications.id, application.id));
          await tx.insert(admissionApplicationEvents).values({ institutionId: locked.institutionId, applicationId: application.id,
            title: "Admission fee verified", description: `${gateway} payment verified automatically. Receipt GP-${id}.`,
            fromStatus: application.status, toStatus: "FEE_VERIFIED", actorId: 0, actorRole: "INSTITUTION", visibleToApplicant: true });
        }
      }
    }
    // Even when a fee changed or was already paid, retain authenticated money for reconciliation.
    await tx.update(gatewayPaymentAttempts).set({ status, receiptNumber: `GP-${id}`, providerReference: verified.reference,
      providerResponseCode: verified.code, evidenceDigest: verified.evidenceDigest, verifiedAt: new Date() }).where(eq(gatewayPaymentAttempts.id, id));
    return { id, status, code: "000" };
  });
}

export async function ensurePaymentQr(id: string, database = db) {
  return database.transaction(async (tx) => {
    const [attempt] = await tx.select().from(gatewayPaymentAttempts).where(eq(gatewayPaymentAttempts.id, id)).for("update");
    if (!attempt || attempt.gateway !== "easypaisa") throw new PaymentError("Payment not found", 404);
    if (attempt.status !== "PENDING" || attempt.expiresAt <= new Date()) return null;
    if (attempt.qrImage) return attempt.qrImage;
    const credentials = decryptGatewayCredentials(attempt.institutionId, attempt.credentialsEncrypted)?.easypaisa;
    if (!credentials) throw new PaymentError("Payment configuration unavailable", 503);
    const qrImage = await generateEasypaisaQr({ orderId: id, amount: attempt.amount, accountNum: credentials.accountNum, storeId: credentials.storeId }, credentials, attempt.environment);
    await tx.update(gatewayPaymentAttempts).set({ qrImage }).where(eq(gatewayPaymentAttempts.id, id));
    return qrImage;
  });
}

export async function checkPayment(id: string, database = db) {
  const [attempt] = await database.select().from(gatewayPaymentAttempts).where(eq(gatewayPaymentAttempts.id, id));
  if (!attempt) throw new PaymentError("Payment not found", 404);
  if (attempt.status !== "PENDING") return { id, status: attempt.status };
  const checkedAt = new Date();
  const leased = await database.update(gatewayPaymentAttempts).set({ lastCheckedAt: checkedAt }).where(and(
    eq(gatewayPaymentAttempts.id, id), eq(gatewayPaymentAttempts.status, "PENDING"),
    sql`(${gatewayPaymentAttempts.lastCheckedAt} is null or ${gatewayPaymentAttempts.lastCheckedAt} < ${new Date(checkedAt.getTime() - 15_000).toISOString()}::timestamp)`,
  )).returning({ id: gatewayPaymentAttempts.id });
  if (!leased.length) return { id, status: "PENDING" };
  if (attempt.gateway === "jazzcash") {
    const credentials = decryptGatewayCredentials(attempt.institutionId, attempt.credentialsEncrypted)?.jazzcash;
    if (!credentials) throw new PaymentError("Payment configuration unavailable", 503);
    const verified = await inquireJazzCash(attempt, credentials, attempt.environment);
    if (verified) return settleConfirmedPayment(id, "jazzcash", verified, database);
    return { id, status: "PENDING" };
  }
  if (attempt.gateway === "easypaisa") {
    const credentials = decryptGatewayCredentials(attempt.institutionId, attempt.credentialsEncrypted)?.easypaisa;
    if (!credentials) throw new PaymentError("Payment configuration unavailable", 503);
    const verified = await inquireEasypaisa({ orderId: id, amount: attempt.amount, accountNum: credentials.accountNum, storeId: credentials.storeId }, credentials, attempt.environment);
    if (verified) return settleConfirmedPayment(id, "easypaisa", verified, database);
    return { id, status: "PENDING" };
  }
  // Hosted Checkout also posts a signed server notification independently of the browser.
  return { id, status: "PENDING" };
}

export async function processHblCallback(fields: Record<string, string>, database = db) {
  const id = fields.req_reference_number;
  if (!/^[A-Za-z0-9]{1,20}$/.test(id || "")) throw new PaymentError("Invalid payment reference", 400);
  const [attempt] = await database.select().from(gatewayPaymentAttempts).where(eq(gatewayPaymentAttempts.id, id));
  if (!attempt || attempt.gateway !== "hblpay") throw new PaymentError("Unknown payment", 404);
  const merchant = decryptGatewayCredentials(attempt.institutionId, attempt.credentialsEncrypted)?.hblpay;
  if (!merchant) throw new PaymentError("Payment configuration unavailable", 503);
  let verified: ReturnType<typeof verifyHbl>;
  try { verified = verifyHbl(fields, attempt, merchant); } catch { throw new PaymentError("Payment verification failed", 401); }
  if (!verified.paid) return { id, status: attempt.status, code: verified.code };
  return settleConfirmedPayment(id, "hblpay", verified, database);
}

export async function processJazzCashNotification(fields: Record<string, string>, database = db) {
  const id = fields.pp_TxnRefNo;
  if (!/^[A-Za-z0-9]{1,20}$/.test(id || "")) throw new PaymentError("Invalid payment reference", 400);
  const [attempt] = await database.select().from(gatewayPaymentAttempts).where(eq(gatewayPaymentAttempts.id, id));
  if (!attempt || attempt.gateway !== "jazzcash") throw new PaymentError("Unknown payment", 404);
  const merchant = decryptGatewayCredentials(attempt.institutionId, attempt.credentialsEncrypted)?.jazzcash;
  if (!merchant) throw new PaymentError("Payment configuration unavailable", 503);
  let verified: ReturnType<typeof verifyJazzCashUpdate>;
  try { verified = verifyJazzCashUpdate(fields, attempt, merchant); } catch { throw new PaymentError("Payment verification failed", 401); }
  if (verified.paid) await settleConfirmedPayment(id, "jazzcash", verified, database);
  return jazzCashSoapAcknowledgement(merchant.hashKey);
}
