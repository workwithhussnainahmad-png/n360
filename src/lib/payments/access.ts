import { accountPaymentScope } from "./receipt-scope";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { admissionApplicantAccounts, gatewayPaymentAttempts as attempts, institutions } from "@/db/schema";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdmissionSessionFromRequest } from "@/lib/admission-auth";
import { parseInstitutionHostname } from "@/lib/institution-domain";
import { getPublicSiteBaseDomain } from "@/lib/public-site-domain";

// This predicate is applied by every receipt/list/status endpoint. Order IDs alone grant no access.
export async function paymentAccess(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session && !session.mustChangePassword && session.institutionId) {
    const scope = accountPaymentScope(session.role, session.userId, session.institutionId);
    if (scope) return scope;
  }
  const applicant = await getAdmissionSessionFromRequest(req);
  if (!applicant) return null;
  const host = parseInstitutionHostname(req.headers.get("host") || "", await getPublicSiteBaseDomain());
  if (host.kind !== "institution") return null;
  const [account] = await db.select({ id: admissionApplicantAccounts.id }).from(admissionApplicantAccounts)
    .innerJoin(institutions, eq(institutions.id, admissionApplicantAccounts.institutionId))
    .where(and(eq(admissionApplicantAccounts.id, applicant.applicantId), eq(admissionApplicantAccounts.institutionId, applicant.institutionId),
      eq(admissionApplicantAccounts.sessionVersion, applicant.sessionVersion), eq(institutions.publicSlug, host.slug)));
  if (!account) return null;
  return and(eq(attempts.institutionId, applicant.institutionId), sql`exists (
    select 1 from admission_applications a where a.id = ${attempts.applicationId} and a.institution_id = ${applicant.institutionId} and a.applicant_id = ${applicant.applicantId}
  )`);
}

// Explicit projection prevents returning encrypted credential snapshots or provider secrets.
export const publicPaymentFields = {
  id: attempts.id, invoiceId: attempts.invoiceId, applicationId: attempts.applicationId,
  gateway: attempts.gateway, environment: attempts.environment, amount: attempts.amount, currency: attempts.currency,
  status: attempts.status, receiptNumber: attempts.receiptNumber, providerReference: attempts.providerReference,
  institutionName: attempts.institutionName, payerName: attempts.payerName, description: attempts.description,
  verifiedAt: attempts.verifiedAt, createdAt: attempts.createdAt, expiresAt: attempts.expiresAt,
};
