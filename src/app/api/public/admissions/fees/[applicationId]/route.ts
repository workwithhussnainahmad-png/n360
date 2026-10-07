import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  admissionApplicantAccounts,
  admissionApplications,
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
      accountSessionVersion: admissionApplicantAccounts.sessionVersion,
    })
    .from(admissionApplications)
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
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
      { timestamp, folder, allowed_formats: allowedFormats, type },
      apiSecret,
    );
    return NextResponse.json(
      { signature, timestamp, folder, allowedFormats, type, cloudName, apiKey },
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

  const submitted = await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: admissionApplications.status }).from(admissionApplications)
      .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.institutionId, authorized.payment.institutionId))).for("update");
    if (!current || current.status !== "FEE_PENDING") return false;
    const [fee] = await tx.select({ status: admissionFeePayments.status }).from(admissionFeePayments)
      .where(and(eq(admissionFeePayments.id, authorized.payment.id), eq(admissionFeePayments.institutionId, authorized.payment.institutionId))).for("update");
    if (!fee || fee.status !== authorized.payment.status) return false;
    await tx
      .update(admissionFeePayments)
      .set({
        payerReference,
        payerSourceBank,
        proofFileKey: encodeAdmissionFileAsset(asset),
        status: "SUBMITTED",
        reviewerNote: null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(admissionFeePayments.id, authorized.payment.id),
          eq(
            admissionFeePayments.institutionId,
            authorized.payment.institutionId,
          ),
          eq(admissionFeePayments.status, authorized.payment.status),
        ),
      );
    await tx
      .update(admissionApplications)
      .set({ status: "FEE_VERIFICATION", updatedAt: new Date() })
      .where(
        and(
          eq(admissionApplications.id, applicationId),
          eq(
            admissionApplications.institutionId,
            authorized.payment.institutionId,
          ),
          eq(admissionApplications.status, "FEE_PENDING"),
        ),
      );
    return true;
  });
  if (!submitted) return NextResponse.json({ error: "Fee status changed. Refresh before submitting proof." }, { status: 409 });
  return NextResponse.json({ success: true, status: "FEE_VERIFICATION" });
}
