import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  admissionApplicantAccounts,
  admissionApplications,
  admissionFeePayments,
  institutions,
} from "@/db/schema";
import { getAdmissionSessionFromRequest } from "@/lib/admission-auth";
import { parseInstitutionHostname } from "@/lib/institution-domain";
import { getPublicSiteBaseDomain } from "@/lib/public-site-domain";
import { isGateway } from "@/lib/payments/policy";
import { PaymentError, startPayment } from "@/lib/payments/service";
import { withRateLimit } from "@/lib/rate-limit";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  
  if (!body || typeof body !== "object" || !("gateway" in body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const gateway = body.gateway;
  if (!isGateway(gateway)) return NextResponse.json({ error: "Unsupported gateway" }, { status: 400 });
  const limited = await withRateLimit(req, "api", `admission-payment:${authorized.payment.institutionId}:${authorized.session.applicantId}`);
  if (!limited.success) return NextResponse.json({ error: "Please wait before trying again" }, { status: 429 });
  try {
    return NextResponse.json(await startPayment(authorized.payment.institutionId, {
      applicationId, applicantId: authorized.session.applicantId,
    }, gateway), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Payment service unavailable" },
      { status: error instanceof PaymentError ? error.status : 503 });
  }
}
