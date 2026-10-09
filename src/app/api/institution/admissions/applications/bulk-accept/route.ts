import { validationError } from '@/lib/validation-errors';
import { applicantCredentialResetAllowedSql } from "@/lib/admission-campus";
import { after, NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, isNull, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  admissionApplicantAccounts,
  admissionApplicationEvents,
  admissionApplications,
  admissionAppointments,
  admissionCycles,
  admissionDocumentRequests,
  admissionFeePayments,
  admissionOfferings,
  institutions,
} from "@/db/schema";
import { hashPassword } from "@/lib/argon2-pool";
import { getClientIp } from "@/lib/client-ip";
import { AdmissionCredentialEmail, AdmissionUpdateEmail } from "@/lib/email";
import { enqueueEmail } from "@/lib/email-outbox";
import { logAudit } from "@/lib/audit";
import { getTenantContext, requireRole } from "@/lib/rbac";

const requestSchema = z
  .object({
    confirm: z.literal(true),
    cycleId: z.number().int().positive().nullable().optional(),
  })
  .strict();

type Candidate = {
  canResetApplicantCredentials: boolean;
  id: number;
  applicantId: number | null;
  applicationNumber: string;
  guardianEmail: string;
  studentName: string;
  cycleId: number;
  institutionName: string;
  requiredDocuments: Array<{ name: string; instructions: string | null }>;
  requiresTest: boolean;
  testScheduledAt: Date | null;
  testLocation: string | null;
  testInstructions: string | null;
  requiresInterview: boolean;
  interviewScheduledAt: Date | null;
  interviewLocation: string | null;
  interviewInstructions: string | null;
  admissionFeeAmount: number | null;
  admissionFeeDueDays: number;
  admissionFeeInstructions: string | null;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentQrUrl: string | null;
  paymentMethods: Array<{
    id: string;
    providerName: string;
    accountTitle: string;
    accountNumber: string;
    qrUrl: string | null;
  }>;
};

type NextStep = {
  status: "DOCUMENTS_REQUIRED" | "TEST_SCHEDULED" | "INTERVIEW_SCHEDULED" | "FEE_PENDING" | "DECISION_PENDING" | "UNDER_REVIEW";
  title: string;
  description: string;
  documents?: Candidate["requiredDocuments"];
  appointment?: {
    type: "TEST" | "INTERVIEW";
    scheduledAt: Date;
    location: string;
    instructions: string | null;
  };
  fee?: {
    amount: number;
    dueDate: string;
    instructions: string;
    bankName: string | null;
    accountNumber: string | null;
    qrUrl: string | null;
    paymentMethods: Candidate["paymentMethods"];
  };
};

function feeDueDate(days: number) {
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + days);
  return dueDate.toISOString().slice(0, 10);
}

function acceptedStep(application: Candidate): NextStep {
  if (application.requiredDocuments.length > 0) {
    return {
      status: "DOCUMENTS_REQUIRED",
      title: "Application accepted — documents requested",
      description: application.requiredDocuments.map((item) => item.name).join(", ").slice(0, 1000),
      documents: application.requiredDocuments,
    };
  }
  if (application.requiresTest) {
    if (application.testScheduledAt && application.testLocation && application.testScheduledAt.getTime() > Date.now()) {
      return {
        status: "TEST_SCHEDULED",
        title: "Application accepted — admission test scheduled",
        description: `${application.testScheduledAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} at ${application.testLocation}`,
        appointment: { type: "TEST", scheduledAt: application.testScheduledAt, location: application.testLocation, instructions: application.testInstructions },
      };
    }
    return { status: "UNDER_REVIEW", title: "Application accepted", description: "The institution will provide an admission test schedule." };
  }
  if (application.requiresInterview) {
    if (application.interviewScheduledAt && application.interviewLocation && application.interviewScheduledAt.getTime() > Date.now()) {
      return {
        status: "INTERVIEW_SCHEDULED",
        title: "Application accepted — interview scheduled",
        description: `${application.interviewScheduledAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} at ${application.interviewLocation}`,
        appointment: { type: "INTERVIEW", scheduledAt: application.interviewScheduledAt, location: application.interviewLocation, instructions: application.interviewInstructions },
      };
    }
    return { status: "UNDER_REVIEW", title: "Application accepted", description: "The institution will provide an interview schedule." };
  }
  if (application.admissionFeeAmount) {
    const dueDate = feeDueDate(application.admissionFeeDueDays);
    return {
      status: "FEE_PENDING",
      title: "Application accepted — fee payment requested",
      description: `PKR ${application.admissionFeeAmount.toLocaleString("en-PK")} due by ${dueDate}`,
      fee: {
        amount: application.admissionFeeAmount,
        dueDate,
        instructions: application.admissionFeeInstructions || "Transfer the fee to a configured institution payment account and submit a screenshot and transaction ID.",
        bankName: null,
        accountNumber: null,
        qrUrl: null,
        paymentMethods: [],
      },
    };
  }
  return { status: "DECISION_PENDING", title: "Application accepted", description: "The institution will record the next admission decision." };
}

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });

  const institutionId = getTenantContext(session);
  const conditions = [
    eq(admissionApplications.institutionId, institutionId),
    eq(admissionApplications.status, "SUBMITTED"),
    isNull(admissionCycles.archivedAt),
    ...(parsed.data.cycleId ? [eq(admissionApplications.cycleId, parsed.data.cycleId)] : []),
  ];
  const candidates = await db.select({
    id: admissionApplications.id,
    canResetApplicantCredentials: applicantCredentialResetAllowedSql,
    applicantId: admissionApplications.applicantId,
    applicationNumber: admissionApplications.applicationNumber,
    guardianEmail: admissionApplications.guardianEmail,
    studentName: admissionApplications.studentName,
    cycleId: admissionApplications.cycleId,
    institutionName: institutions.name,
    requiredDocuments: admissionCycles.requiredDocuments,
    requiresTest: admissionCycles.requiresTest,
    testScheduledAt: admissionCycles.testScheduledAt,
    testLocation: admissionCycles.testLocation,
    testInstructions: admissionCycles.testInstructions,
    requiresInterview: admissionCycles.requiresInterview,
    interviewScheduledAt: admissionCycles.interviewScheduledAt,
    interviewLocation: admissionCycles.interviewLocation,
    interviewInstructions: admissionCycles.interviewInstructions,
    admissionFeeAmount: admissionCycles.admissionFeeAmount,
    admissionFeeDueDays: admissionCycles.admissionFeeDueDays,
    admissionFeeInstructions: admissionCycles.admissionFeeInstructions,
    paymentBankName: admissionCycles.paymentBankName,
    paymentAccountNumber: admissionCycles.paymentAccountNumber,
    paymentQrUrl: admissionCycles.paymentQrUrl,
    paymentMethods: admissionCycles.paymentMethods,
  }).from(admissionApplications)
    .innerJoin(admissionOfferings, eq(admissionOfferings.id, admissionApplications.offeringId))
    .innerJoin(admissionCycles, eq(admissionCycles.id, admissionApplications.cycleId))
    .innerJoin(institutions, eq(institutions.id, admissionApplications.institutionId))
    .where(and(...conditions)) as Candidate[];

  const accepted: Array<Candidate & { temporaryPassword: string; step: NextStep }> = [];
  const skipped: number[] = [];
  let failed = 0;
  // One guardian account can own several applications. Reuse one generated
  // credential for that account so concurrent acceptance never emails multiple
  // passwords where only the last one works.
  const credentialsByApplicant = new Map<number, Promise<{ temporaryPassword: string; passwordHash: string }>>();
  const credentialFor = (applicantId: number) => {
    let credential = credentialsByApplicant.get(applicantId);
    if (!credential) {
      credential = (async () => {
        const temporaryPassword = crypto.randomBytes(9).toString("base64url");
        return { temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
      })();
      credentialsByApplicant.set(applicantId, credential);
    }
    return credential;
  };
  // Limit concurrent Argon2/database work so a large queue does not exhaust the API process.
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = candidates.slice(offset, offset + 5);
    const batchResults = await Promise.allSettled(batch.map(async (application) => {
      if (!application.applicantId) return { application, skipped: true as const };
      const { temporaryPassword, passwordHash } = application.canResetApplicantCredentials ? await credentialFor(application.applicantId) : { temporaryPassword: "", passwordHash: "" };
      const step = acceptedStep(application);
      const changed = await db.transaction(async (tx) => {
        const [updated] = await tx.update(admissionApplications)
          .set({ status: step.status, updatedAt: new Date() })
          .where(and(eq(admissionApplications.id, application.id), eq(admissionApplications.institutionId, institutionId), eq(admissionApplications.status, "SUBMITTED")))
          .returning({ id: admissionApplications.id });
        if (!updated) return false;
        if (application.canResetApplicantCredentials) await tx.update(admissionApplicantAccounts)
          .set({ passwordHash, mustChangePassword: true, sessionVersion: sql`${admissionApplicantAccounts.sessionVersion} + 1`, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
          .where(and(eq(admissionApplicantAccounts.id, application.applicantId!), eq(admissionApplicantAccounts.institutionId, institutionId)));
        for (const document of step.documents || []) {
          await tx.insert(admissionDocumentRequests).values({ institutionId, applicationId: application.id, documentName: document.name, instructions: document.instructions })
            .onConflictDoUpdate({ target: [admissionDocumentRequests.applicationId, admissionDocumentRequests.documentName], set: { instructions: document.instructions, status: "REQUESTED", updatedAt: new Date() } });
        }
        if (step.appointment) {
          await tx.insert(admissionAppointments).values({ institutionId, applicationId: application.id, ...step.appointment })
            .onConflictDoUpdate({ target: [admissionAppointments.applicationId, admissionAppointments.type], set: { ...step.appointment, outcome: "PENDING", outcomeNote: null, updatedAt: new Date() } });
        }
        if (step.fee) {
          await tx.insert(admissionFeePayments).values({ institutionId, applicationId: application.id, ...step.fee })
            .onConflictDoUpdate({ target: admissionFeePayments.applicationId, set: { ...step.fee, payerReference: null, payerSourceBank: null, proofFileKey: null, status: "PENDING", reviewerNote: null, verifiedBy: null, verifiedAt: null, submittedAt: null, updatedAt: new Date() } });
        }
        await tx.insert(admissionApplicationEvents).values({ institutionId, applicationId: application.id, title: step.title, description: step.description, fromStatus: "SUBMITTED", toStatus: step.status, visibleToApplicant: true, actorId: session.userId, actorRole: session.role });
        return true;
      });
      return changed ? { application, temporaryPassword, step } : { application, skipped: true as const };
    }));
    for (const settled of batchResults) {
      if (settled.status === "rejected") {
        failed += 1;
        console.error("Bulk admission acceptance item failed:", settled.reason);
        continue;
      }
      const result = settled.value;
      if ("skipped" in result) skipped.push(result.application.id);
      else accepted.push({
        ...result.application,
        temporaryPassword: result.temporaryPassword,
        step: result.step,
      });
    }
  }

  const ip = getClientIp(req);
  const bulkOperationId = crypto.randomUUID();
  const credentialQueuedFor = new Set<number>();
  await Promise.all(accepted.flatMap((application) => {
    if (application.guardianEmail.endsWith("@example.test")) return [];
    const messages = [enqueueEmail({
      institutionId,
      to: application.guardianEmail,
      subject: `${application.step.title} - ${application.institutionName}`,
      html: AdmissionUpdateEmail({ institutionName: application.institutionName, studentName: application.studentName, applicationNumber: application.applicationNumber, title: application.step.title, description: application.step.description }),
      dedupeKey: `admission:${application.id}:bulk-accepted-update`,
    })];
    if (!application.canResetApplicantCredentials || !application.applicantId || credentialQueuedFor.has(application.applicantId)) return messages;
    credentialQueuedFor.add(application.applicantId);
    messages.push(enqueueEmail({
      institutionId,
      to: application.guardianEmail,
      subject: `Applicant portal credentials - ${application.institutionName}`,
      html: AdmissionCredentialEmail({ institutionName: application.institutionName, accountType: "applicant", loginId: application.guardianEmail, temporaryPassword: application.temporaryPassword }),
      dedupeKey: `admission-applicant:${application.applicantId}:bulk:${bulkOperationId}:credentials`,
    }));
    return messages;
  }));
  after(async () => {
    try {
      await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: "BULK_ACCEPT_ADMISSION_APPLICATIONS", target: `${accepted.length} submitted applications`, ip });
    } catch (error) {
      console.error("Bulk admission acceptance audit failed:", error);
    }
  });
  return NextResponse.json({ accepted: accepted.length, skipped: skipped.length, failed });
});
