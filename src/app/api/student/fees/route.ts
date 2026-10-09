import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  feeInvoices,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import cloudinary from "@/lib/cloudinary";
import {
  encodeAdmissionFileAsset,
  hasExactFolderPrefix,
  parseAdmissionUploadCompletion,
} from "@/lib/admission-files";
import { withRateLimit } from "@/lib/rate-limit";
import { getStudentFeeAccount, getStudentFeeDetails } from "@/lib/student-fees";
import { positiveInteger } from "@/lib/pagination";
import { submitStudentFeeProof } from "@/lib/manual-fee-submissions";
import { getParentPortalContext } from "@/lib/parent-access";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

export const GET = requireRole(
  ["STUDENT", "PARENT"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    let studentId = session.userId;
    if (session.role === "PARENT") {
      try { const context = await getParentPortalContext(session, req.nextUrl.searchParams.get("studentId"), { selectedOnly: true }); if (!context.selectedChild) throw new Error(); studentId = context.selectedChild.id; }
      catch { return NextResponse.json({ error: "Child not found." }, { status: 403 }); }
    }
    const params = req.nextUrl.searchParams;
    if (params.has("invoiceId")) {
      const invoiceId = Number(params.get("invoiceId"));
      if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) return NextResponse.json({ error: "Invalid challan." }, { status: 400 });
      const details = await getStudentFeeDetails(institutionId, studentId, invoiceId, positiveInteger(params.get("page")));
      return details ? NextResponse.json(details) : NextResponse.json({ error: "Challan not found." }, { status: 404 });
    }
    return NextResponse.json(await getStudentFeeAccount(institutionId, studentId, positiveInteger(params.get("activePage")), positiveInteger(params.get("paidPage"))));
  },
);

export const POST = requireRole(["STUDENT", "PARENT"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  let studentId = session.userId;
  if (session.role === "PARENT") {
    try {
      const context = await getParentPortalContext(session, req.nextUrl.searchParams.get("studentId"), { selectedOnly: true });
      if (!context.selectedChild) throw new Error();
      studentId = context.selectedChild.id;
    } catch { return NextResponse.json({ error: "Child not found." }, { status: 403 }); }
  }
  const limited = await withRateLimit(req, "upload", `student-fee:${institutionId}:${session.userId}`);
  if (!limited.success) return NextResponse.json({ error: "Too many payment submissions. Please wait and try again." }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("action" in body)) return NextResponse.json({ error: "Invalid payment action" }, { status: 400 });
  if (body.action === "signature") {
    const invoiceId = Number("invoiceId" in body ? body.invoiceId : 0);
    const [invoice] = await db.select({ id: feeInvoices.id, status: feeInvoices.status }).from(feeInvoices)
      .where(and(eq(feeInvoices.id, invoiceId), eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, studentId))).limit(1);
    if (!invoice || !["DUE", "PARTIAL"].includes(invoice.status)) return NextResponse.json({ error: "This challan is not awaiting payment" }, { status: 409 });
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return NextResponse.json({ error: "Payment proof uploads are not configured" }, { status: 503 });
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `student-fees/${institutionId}/${studentId}/${invoiceId}`;
    const allowedFormats = "jpg,jpeg,png,webp,pdf";
    const type = "authenticated";
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder, allowed_formats: allowedFormats, type, overwrite: false }, apiSecret);
    return NextResponse.json({ signature, timestamp, folder, allowedFormats, type, overwrite: false, cloudName, apiKey }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.action !== "complete") return NextResponse.json({ error: "Invalid payment action" }, { status: 400 });
  const invoiceId = Number("invoiceId" in body ? body.invoiceId : 0);
  const amount = Number("amount" in body ? body.amount : 0);
  const sourceBankName = String("sourceBankName" in body ? body.sourceBankName : "").trim();
  const transactionId = String("transactionId" in body ? body.transactionId : "").trim();
  if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid payment amount" }, { status: 400 });
  if (sourceBankName.length < 2 || sourceBankName.length > 120) return NextResponse.json({ error: "Enter the source bank or wallet name" }, { status: 400 });
  if (transactionId.length < 2 || transactionId.length > 160) return NextResponse.json({ error: "Enter a valid transaction ID" }, { status: 400 });
  const asset = parseAdmissionUploadCompletion(body);
  const expectedFolder = `student-fees/${institutionId}/${studentId}/${invoiceId}`;
  if (!asset || !hasExactFolderPrefix(asset.publicId, expectedFolder)) return NextResponse.json({ error: "Uploaded payment proof could not be verified" }, { status: 400 });
  try {
    const resource = await cloudinary.api.resource(asset.publicId, { resource_type: asset.resourceType, type: "authenticated" });
    if (resource.type !== "authenticated" || resource.format?.toLowerCase() !== asset.format || !ALLOWED_PROOF_FORMATS.has(asset.format)
      || !Number.isFinite(Number(resource.bytes)) || Number(resource.bytes) < 1 || Number(resource.bytes) > MAX_PROOF_BYTES) throw new Error("INVALID_PROOF");
  } catch { return NextResponse.json({ error: "Uploaded payment proof could not be verified" }, { status: 400 }); }
  try {
    const submission = await db.transaction(tx => submitStudentFeeProof(tx, { institutionId, studentId, invoiceId, amount,
      paymentAccountId: String("paymentAccountId" in body ? body.paymentAccountId : ""), sourceBankName, transactionId,
      proofFileKey: encodeAdmissionFileAsset(asset), submittedByRole: session.role, submittedById: session.userId }));
    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_ACCOUNT_UNAVAILABLE") return NextResponse.json({ error: "Payment account was removed. Refresh and select a current account." }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_REFERENCE_USED") return NextResponse.json({ error: "This transaction ID has already been submitted for this payment account." }, { status: 409 });
    if (error instanceof Error && error.message === "INVOICE_NOT_PAYABLE") return NextResponse.json({ error: "This challan is no longer awaiting payment" }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "Payment cannot exceed the challan balance" }, { status: 409 });
    const dbError = error as { code?: string; cause?: { code?: string } };
    if ((dbError.code || dbError.cause?.code) === "23505") return NextResponse.json({ error: "A payment for this challan is already awaiting verification" }, { status: 409 });
    throw error;
  }
});
