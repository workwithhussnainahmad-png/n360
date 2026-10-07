import { activeGateways as availableGateways } from "@/lib/payments/config";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  feeInvoiceItems,
  feeInvoices,
  feePayments,
  feePaymentSubmissions,
  institutionPaymentGateways,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import cloudinary from "@/lib/cloudinary";
import {
  encodeAdmissionFileAsset,
  hasExactFolderPrefix,
  parseAdmissionUploadCompletion,
} from "@/lib/admission-files";
import { withRateLimit } from "@/lib/rate-limit";
import { decryptGatewayCredentials } from "@/lib/payment-credentials";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

export const GET = requireRole(
  ["STUDENT"],
  async (_req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    const invoices = await db
      .select()
      .from(feeInvoices)
      .where(
        and(
          eq(feeInvoices.institutionId, institutionId),
          eq(feeInvoices.studentId, session.userId),
        ),
      )
      .orderBy(desc(feeInvoices.billingMonth))
      .limit(24);
    const ids = invoices.map((invoice) => invoice.id);
    const [gatewayRow] = await db
      .select({ credentialsEncrypted: institutionPaymentGateways.credentialsEncrypted })
      .from(institutionPaymentGateways)
      .where(eq(institutionPaymentGateways.institutionId, institutionId))
      .limit(1);

  const activeGateways = availableGateways(gatewayRow ? decryptGatewayCredentials(institutionId, gatewayRow.credentialsEncrypted) : null);

    if (ids.length === 0)
      return NextResponse.json({
        invoices: [],
        items: [],
        payments: [],
        submissions: [],
        gateways: activeGateways,
        summary: { billed: 0, paid: 0, balance: 0 },
      });

    const [items, payments, submissions] = await Promise.all([
      db
        .select()
        .from(feeInvoiceItems)
        .where(inArray(feeInvoiceItems.invoiceId, ids))
        .orderBy(feeInvoiceItems.id),
      db
        .select()
        .from(feePayments)
        .where(
          and(
            eq(feePayments.institutionId, institutionId),
            eq(feePayments.studentId, session.userId),
            inArray(feePayments.invoiceId, ids),
          ),
        )
        .orderBy(desc(feePayments.receivedAt)),
      db
        .select()
        .from(feePaymentSubmissions)
        .where(
          and(
            eq(feePaymentSubmissions.institutionId, institutionId),
            eq(feePaymentSubmissions.studentId, session.userId),
            inArray(feePaymentSubmissions.invoiceId, ids),
          ),
        )
        .orderBy(desc(feePaymentSubmissions.submittedAt)),
    ]);
    const active = invoices.filter((invoice) => invoice.status !== "VOID");
    return NextResponse.json({
      invoices,
      items,
      payments,
      submissions,
      gateways: activeGateways,
      summary: {
        billed: active.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
        paid: active.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
        balance: active.reduce(
          (sum, invoice) => sum + invoice.totalAmount - invoice.paidAmount,
          0,
        ),
      },
    });
  },
);

export const POST = requireRole(
  ["STUDENT"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    const limited = await withRateLimit(
      req,
      "upload",
      `student-fee:${institutionId}:${session.userId}`,
    );
    if (!limited.success)
      return NextResponse.json(
        { error: "Too many payment submissions. Please wait and try again." },
        { status: 429 },
      );
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }
    if (!body || typeof body !== "object" || !("action" in body))
      return NextResponse.json(
        { error: "Invalid payment action" },
        { status: 400 },
      );

    if (body.action === "signature") {
      const invoiceId = Number("invoiceId" in body ? body.invoiceId : 0);
      const [invoice] = await db
        .select({ id: feeInvoices.id, status: feeInvoices.status })
        .from(feeInvoices)
        .where(
          and(
            eq(feeInvoices.id, invoiceId),
            eq(feeInvoices.institutionId, institutionId),
            eq(feeInvoices.studentId, session.userId),
          ),
        )
        .limit(1);
      if (!invoice || !["DUE", "PARTIAL"].includes(invoice.status))
        return NextResponse.json(
          { error: "This challan is not awaiting payment" },
          { status: 409 },
        );
      const cloudName =
        process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
        process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret)
        return NextResponse.json(
          { error: "Payment proof uploads are not configured" },
          { status: 503 },
        );
      const timestamp = Math.round(Date.now() / 1000);
      const folder = `student-fees/${institutionId}/${session.userId}/${invoiceId}`;
      const allowedFormats = "jpg,jpeg,png,webp,pdf";
      const type = "authenticated";
      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder, allowed_formats: allowedFormats, type },
        apiSecret,
      );
      return NextResponse.json(
        {
          signature,
          timestamp,
          folder,
          allowedFormats,
          type,
          cloudName,
          apiKey,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.action !== "complete")
      return NextResponse.json(
        { error: "Invalid payment action" },
        { status: 400 },
      );
    const invoiceId = Number("invoiceId" in body ? body.invoiceId : 0);
    const amount = Number("amount" in body ? body.amount : 0);
    const sourceBankName = String(
      "sourceBankName" in body ? body.sourceBankName : "",
    ).trim();
    const transactionId = String(
      "transactionId" in body ? body.transactionId : "",
    ).trim();
    if (
      !Number.isInteger(invoiceId) ||
      invoiceId <= 0 ||
      !Number.isInteger(amount) ||
      amount <= 0
    )
      return NextResponse.json(
        { error: "Enter a valid payment amount" },
        { status: 400 },
      );
    if (sourceBankName.length < 2 || sourceBankName.length > 120)
      return NextResponse.json(
        { error: "Enter the source bank or wallet name" },
        { status: 400 },
      );
    if (transactionId.length < 2 || transactionId.length > 160)
      return NextResponse.json(
        { error: "Enter a valid transaction ID" },
        { status: 400 },
      );
    const asset = parseAdmissionUploadCompletion(body);
    const expectedFolder = `student-fees/${institutionId}/${session.userId}/${invoiceId}`;
    if (!asset || !hasExactFolderPrefix(asset.publicId, expectedFolder))
      return NextResponse.json(
        { error: "Uploaded payment proof could not be verified" },
        { status: 400 },
      );
    try {
      const resource = await cloudinary.api.resource(asset.publicId, {
        resource_type: asset.resourceType,
        type: "authenticated",
      });
      if (
        resource.type !== "authenticated" ||
        resource.format?.toLowerCase() !== asset.format ||
        !ALLOWED_PROOF_FORMATS.has(asset.format) ||
        Number(resource.bytes) > MAX_PROOF_BYTES
      )
        throw new Error("INVALID_PROOF");
    } catch {
      return NextResponse.json(
        { error: "Uploaded payment proof could not be verified" },
        { status: 400 },
      );
    }

    try {
      const submission = await db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(feeInvoices)
          .where(
            and(
              eq(feeInvoices.id, invoiceId),
              eq(feeInvoices.institutionId, institutionId),
              eq(feeInvoices.studentId, session.userId),
            ),
          )
          .limit(1);
        if (!invoice || !["DUE", "PARTIAL"].includes(invoice.status))
          throw new Error("INVOICE_NOT_PAYABLE");
        if (amount > invoice.totalAmount - invoice.paidAmount)
          throw new Error("PAYMENT_EXCEEDS_BALANCE");
        const [created] = await tx
          .insert(feePaymentSubmissions)
          .values({
            institutionId,
            invoiceId,
            studentId: session.userId,
            amount,
            sourceBankName,
            transactionId,
            proofFileKey: encodeAdmissionFileAsset(asset),
          })
          .returning();
        return created;
      });
      return NextResponse.json({ submission }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "INVOICE_NOT_PAYABLE")
        return NextResponse.json(
          { error: "This challan is no longer awaiting payment" },
          { status: 409 },
        );
      if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE")
        return NextResponse.json(
          { error: "Payment cannot exceed the challan balance" },
          { status: 409 },
        );
      const dbError = error as { code?: string; cause?: { code?: string } };
      if ((dbError.code || dbError.cause?.code) === "23505")
        return NextResponse.json(
          {
            error:
              "A payment for this challan is already awaiting verification",
          },
          { status: 409 },
        );
      throw error;
    }
  },
);
