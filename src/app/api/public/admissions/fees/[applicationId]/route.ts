import { withApiPolicy } from "@/lib/api-policy";
import { submitAdmissionFeeProof } from '@/lib/manual-admission-payments';
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  admissionApplicantAccounts,
  admissionApplications,
  admissionCycles,
  admissionFeePayments,
  institutions,
} from "@/db/schema";
import cloudinary from "@/lib/cloudinary";
import {
  encodeAdmissionFileAsset,
  hasExactFolderPrefix,
  parseAdmissionUploadCompletion,
} from "@/lib/admission-files";
import { getAdmissionSessionFromRequest } from "@/lib/admission-auth";
import { parseInstitutionHostname } from "@/lib/institution-domain";
import { getPublicSiteBaseDomain } from "@/lib/public-site-domain";
import { withRateLimit } from "@/lib/rate-limit";
import { getPaymentAccounts } from "@/lib/manual-payment-accounts";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

async function authorize(req: NextRequest, applicationId: number) {
  const session = await getAdmissionSessionFromRequest(req);
  const hostname = parseInstitutionHostname(
    req.headers.get("host") || "",
    await getPublicSiteBaseDomain(),
  );
  if (!session || hostname.kind !== "institution") return null;
  const [row] = await db
    .select({
      payment: admissionFeePayments,
      applicationStatus: admissionApplications.status,
      archivedAt: admissionCycles.archivedAt,
      accountSessionVersion: admissionApplicantAccounts.sessionVersion,
    })
    .from(admissionApplications)
    .innerJoin(admissionCycles, eq(admissionCycles.id, admissionApplications.cycleId))
    .innerJoin(
      admissionFeePayments,
      and(
        eq(admissionFeePayments.applicationId, admissionApplications.id),
        eq(
          admissionFeePayments.institutionId,
          admissionApplications.institutionId,
        ),
      ),
    )
    .innerJoin(
      admissionApplicantAccounts,
      and(
        eq(admissionApplicantAccounts.id, admissionApplications.applicantId),
        eq(
          admissionApplicantAccounts.institutionId,
          admissionApplications.intakeInstitutionId,
        ),
      ),
    )
    .innerJoin(
      institutions,
      eq(institutions.id, admissionApplications.intakeInstitutionId),
    )
    .where(
      and(
        eq(admissionApplications.id, applicationId),
        eq(admissionApplications.applicantId, session.applicantId),
        eq(admissionApplications.intakeInstitutionId, session.institutionId),
        eq(institutions.publicSlug, hostname.slug),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.accountSessionVersion !== session.sessionVersion
  )
    return null;
  return { ...row, session };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const applicationId = Number((await params).applicationId);
  if (!Number.isSafeInteger(applicationId) || applicationId <= 0) return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  const authorized = await authorize(req, applicationId);
  if (!authorized) return NextResponse.json({ error: "Applicant session required." }, { status: 401 });
  return NextResponse.json({ paymentAccounts: await getPaymentAccounts(authorized.payment.institutionId) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const POST = withApiPolicy(async (
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) => {
  const { applicationId: rawApplicationId } = await params;
  const applicationId = Number(rawApplicationId);
  if (!Number.isInteger(applicationId) || applicationId <= 0)
    return NextResponse.json({ error: "Invalid application" }, { status: 400 });
  const authorized = await authorize(req, applicationId);
  if (!authorized)
    return NextResponse.json(
      { error: "Applicant session required" },
      { status: 401 },
    );
  if (authorized.archivedAt) return NextResponse.json({ error: "Restore this archived admission cycle before changing its records." }, { status: 409 });
  if (
    authorized.applicationStatus !== "FEE_PENDING" ||
    !["PENDING", "REJECTED"].includes(authorized.payment.status)
  ) {
    return NextResponse.json(
      { error: "A fee payment is not currently awaiting submission" },
      { status: 409 },
    );
  }
  const limited = await withRateLimit(
    req,
    "upload",
    `applicant-fee:${authorized.session.applicantId}`,
  );
  if (!limited.success)
    return NextResponse.json(
      { error: "Too many upload attempts. Please wait and try again." },
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
    const folder = `admission-fees/${authorized.payment.institutionId}/${applicationId}`;
    const allowedFormats = "jpg,jpeg,png,webp,pdf";
    const type = "authenticated";
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, allowed_formats: allowedFormats, type, overwrite: false },
      apiSecret,
    );
    return NextResponse.json(
      { signature, timestamp, folder, allowedFormats, type, overwrite: false, cloudName, apiKey },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (
    body.action !== "complete" ||
    !("payerReference" in body) ||
    typeof body.payerReference !== "string" ||
    !("payerSourceBank" in body) ||
    typeof body.payerSourceBank !== "string"
  ) {
    return NextResponse.json(
      { error: "Source bank, payment reference, and proof are required" },
      { status: 400 },
    );
  }
  const payerReference = body.payerReference.trim();
  const payerSourceBank = body.payerSourceBank.trim();
  if (payerReference.length < 2 || payerReference.length > 160)
    return NextResponse.json(
      { error: "Enter a valid transaction or receipt reference" },
      { status: 400 },
    );
  if (payerSourceBank.length < 2 || payerSourceBank.length > 120)
    return NextResponse.json(
      { error: "Enter the bank or wallet used to send payment" },
      { status: 400 },
    );
  const asset = parseAdmissionUploadCompletion(body);
  const expectedFolder = `admission-fees/${authorized.payment.institutionId}/${applicationId}`;
  if (!asset || !hasExactFolderPrefix(asset.publicId, expectedFolder)) {
    return NextResponse.json(
      { error: "Uploaded payment proof could not be verified" },
      { status: 400 },
    );
  }
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
    ) {
      await cloudinary.uploader
        .destroy(asset.publicId, {
          resource_type: asset.resourceType,
          type: "authenticated",
          invalidate: true,
        })
        .catch(() => undefined);
      return NextResponse.json(
        { error: "Uploaded payment proof could not be verified" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Uploaded payment proof could not be verified" },
      { status: 400 },
    );
  }

  let submitted;
  try { submitted = await db.transaction(tx => submitAdmissionFeeProof(tx, { institutionId: authorized.payment.institutionId, applicationId, paymentId: authorized.payment.id, expectedStatus: authorized.payment.status, paymentAccountId: String("paymentAccountId" in body ? body.paymentAccountId : ""), transactionId: payerReference, sourceBankName: payerSourceBank, proofFileKey: encodeAdmissionFileAsset(asset) })); } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_ACCOUNT_UNAVAILABLE") return NextResponse.json({ error: "Payment account was removed. Refresh and select a current account." }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_REFERENCE_USED") return NextResponse.json({ error: "This transaction ID has already been submitted for this payment account." }, { status: 409 });
    throw error;
  }
  if (!submitted) return NextResponse.json({ error: "Fee status changed. Refresh before submitting proof." }, { status: 409 });
  return NextResponse.json({ success: true, status: "FEE_VERIFICATION" });
});
