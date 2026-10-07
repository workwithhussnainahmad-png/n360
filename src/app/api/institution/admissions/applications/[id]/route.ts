import { applicantCredentialResetAllowedSql } from "@/lib/admission-campus";
import { after, NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  admissionEnrollments,
  admissionApplicantAccounts,
  admissionApplicationEvents,
  admissionApplications,
  admissionAppointments,
  admissionCycles,
  admissionDocumentRequests,
  admissionFeePayments,
  admissionOfferings,
  campuses,
  classes,
  institutions,
  sections,
  students,
} from "@/db/schema";
import { revokeAllSessions, type JWTPayload } from "@/lib/auth";
import { hashPassword } from "@/lib/argon2-pool";
import { allocateAdmissionSequences } from "@/lib/admission-sequences";
import { getClientIp } from "@/lib/client-ip";
import {
  AdmissionCredentialEmail,
  AdmissionEnrollmentEmail,
  AdmissionUpdateEmail,
  ParentAccountActivationEmail,
} from "@/lib/email";
import { enqueueEmail } from "@/lib/email-outbox";
import { generateStudentLoginRollNumber } from "@/lib/login-identifiers";
import { resolveStudentLoginInstitution } from "@/lib/student-login-institution";
import { logAudit } from "@/lib/audit";
import { prepareParentActivation, syncStudentGuardian } from "@/lib/parent-identity";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { invalidateUserValidity } from "@/lib/user";
import { admissionReviewActionSchema } from "@/lib/validators/admission-review";

type ApplicationStatus = (typeof admissionApplications.$inferSelect)["status"];
type AppointmentType = (typeof admissionAppointments.$inferSelect)["type"];
const WHOLE_CLASS_SECTION_NAME = "Whole Class";

const allowedStatuses: Record<string, ApplicationStatus[]> = {
  startReview: ["SUBMITTED"],
  requestDocuments: [
    "SUBMITTED",
    "UNDER_REVIEW",
    "DOCUMENTS_REQUIRED",
    "TEST_SCHEDULED",
    "INTERVIEW_SCHEDULED",
    "DECISION_PENDING",
  ],
  scheduleTest: [
    "SUBMITTED",
    "UNDER_REVIEW",
    "DOCUMENTS_REQUIRED",
    "TEST_SCHEDULED",
  ],
  scheduleInterview: [
    "UNDER_REVIEW",
    "DOCUMENTS_REQUIRED",
    "TEST_SCHEDULED",
    "INTERVIEW_SCHEDULED",
    "DECISION_PENDING",
  ],
  decision: ["SUBMITTED", "UNDER_REVIEW", "DECISION_PENDING"],
};

async function getApplication(applicationId: number, institutionId: number) {
  const [application] = await db
    .select({
      id: admissionApplications.id,
      institutionId: admissionApplications.institutionId,
      intakeInstitutionId: admissionApplications.intakeInstitutionId,
      campusId: admissionApplications.campusId,
      campusName: admissionApplications.campusName,
      canResetApplicantCredentials: applicantCredentialResetAllowedSql,
      applicantId: admissionApplications.applicantId,
      applicationNumber: admissionApplications.applicationNumber,
      cycleId: admissionApplications.cycleId,
      offeringId: admissionApplications.offeringId,
      studentName: admissionApplications.studentName,
      dateOfBirth: admissionApplications.dateOfBirth,
      gender: admissionApplications.gender,
      guardianName: admissionApplications.guardianName,
      guardianEmail: admissionApplications.guardianEmail,
      guardianPhone: admissionApplications.guardianPhone,
      previousInstitution: admissionApplications.previousInstitution,
      previousClassMarks: admissionApplications.previousClassMarks,
      medicalInformation: admissionApplications.medicalInformation,
      notes: admissionApplications.notes,
      status: admissionApplications.status,
      submittedAt: admissionApplications.submittedAt,
      offeringTitle: admissionOfferings.title,
      offeringCapacity: admissionOfferings.capacity,
      cycleName: admissionCycles.name,
      requiresTest: admissionCycles.requiresTest,
      requiredDocuments: admissionCycles.requiredDocuments,
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
      institutionName: institutions.name,
      institutionUsername: institutions.username,
    })
    .from(admissionApplications)
    .innerJoin(
      admissionOfferings,
      eq(admissionOfferings.id, admissionApplications.offeringId),
    )
    .innerJoin(
      admissionCycles,
      eq(admissionCycles.id, admissionApplications.cycleId),
    )
    .innerJoin(
      institutions,
      eq(institutions.id, admissionApplications.institutionId),
    )
    .where(
      and(
        eq(admissionApplications.id, applicationId),
        eq(admissionApplications.institutionId, institutionId),
      ),
    )
    .limit(1);
  return application;
}

function invalidTransition(status: ApplicationStatus) {
  return NextResponse.json(
    {
      error: `This action is not available while the application is ${status.toLowerCase().replaceAll("_", " ")}`,
    },
    { status: 409 },
  );
}

type LoadedApplication = NonNullable<
  Awaited<ReturnType<typeof getApplication>>
>;
type AutomaticStep = {
  status: ApplicationStatus;
  title: string;
  description: string;
  documents?: Array<{ name: string; instructions: string | null }>;
  appointment?: {
    type: AppointmentType;
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
    paymentMethods: LoadedApplication["paymentMethods"];
  };
};

function feeDueDate(days: number) {
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + days);
  return dueDate.toISOString().slice(0, 10);
}

function automaticWorkflowStep(
  application: LoadedApplication,
  stage: "ACCEPTED" | "DOCUMENTS_VERIFIED" | "TEST_PASSED" | "INTERVIEW_PASSED",
): AutomaticStep {
  if (stage === "ACCEPTED" && application.requiredDocuments.length > 0) {
    return {
      status: "DOCUMENTS_REQUIRED",
      title: "Application accepted — documents requested",
      description: application.requiredDocuments
        .map((document) => document.name)
        .join(", ")
        .slice(0, 1000),
      documents: application.requiredDocuments,
    };
  }

  if (
    (stage === "ACCEPTED" || stage === "DOCUMENTS_VERIFIED") &&
    application.requiresTest
  ) {
    if (
      application.testScheduledAt &&
      application.testLocation &&
      application.testScheduledAt.getTime() > Date.now()
    ) {
      return {
        status: "TEST_SCHEDULED",
        title: "Documents verified — admission test scheduled",
        description: `${application.testScheduledAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} at ${application.testLocation}`,
        appointment: {
          type: "TEST",
          scheduledAt: application.testScheduledAt,
          location: application.testLocation,
          instructions: application.testInstructions,
        },
      };
    }
    return {
      status: "UNDER_REVIEW",
      title: "Documents verified",
      description:
        "The institution will provide an updated admission test schedule.",
    };
  }

  if (stage !== "INTERVIEW_PASSED" && application.requiresInterview) {
    if (
      application.interviewScheduledAt &&
      application.interviewLocation &&
      application.interviewScheduledAt.getTime() > Date.now()
    ) {
      return {
        status: "INTERVIEW_SCHEDULED",
        title:
          stage === "TEST_PASSED"
            ? "Admission test passed — interview scheduled"
            : "Documents verified — interview scheduled",
        description: `${application.interviewScheduledAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} at ${application.interviewLocation}`,
        appointment: {
          type: "INTERVIEW",
          scheduledAt: application.interviewScheduledAt,
          location: application.interviewLocation,
          instructions: application.interviewInstructions,
        },
      };
    }
    return {
      status: "UNDER_REVIEW",
      title:
        stage === "TEST_PASSED"
          ? "Admission test passed"
          : "Documents verified",
      description: "The institution will provide an interview schedule.",
    };
  }

  if (application.admissionFeeAmount) {
    const dueDate = feeDueDate(application.admissionFeeDueDays);
    const instructions = application.admissionFeeInstructions || "Choose one of the institution's configured online payment gateways.";
    return {
      status: "FEE_PENDING",
      title: "Admission offered — fee payment requested",
      description: `PKR ${application.admissionFeeAmount.toLocaleString("en-PK")} due by ${dueDate}`,
      fee: {
        amount: application.admissionFeeAmount,
        dueDate,
        instructions,
        bankName: null,
        accountNumber: null,
        qrUrl: null,
        paymentMethods: [],
      },
    };
  }

  return {
    status: "DECISION_PENDING",
    title: "Assessment stages completed",
    description: "The institution will record the final admission decision.",
  };
}

export const GET = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (
    _req: NextRequest,
    {
      session,
      params,
    }: { session: JWTPayload; params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const applicationId = Number(id);
    if (!Number.isInteger(applicationId) || applicationId <= 0)
      return NextResponse.json(
        { error: "Invalid application" },
        { status: 400 },
      );
    const institutionId = getTenantContext(session);
    const application = await getApplication(applicationId, institutionId);
    if (!application)
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );

    const [
      documents,
      appointments,
      events,
      feeRows,
      enrollmentRows,
      campusOptions,
      classOptions,
      sectionOptions,
    ] = await Promise.all([
      db
        .select()
        .from(admissionDocumentRequests)
        .where(
          and(
            eq(admissionDocumentRequests.applicationId, applicationId),
            eq(admissionDocumentRequests.institutionId, institutionId),
          ),
        )
        .orderBy(asc(admissionDocumentRequests.createdAt)),
      db
        .select()
        .from(admissionAppointments)
        .where(
          and(
            eq(admissionAppointments.applicationId, applicationId),
            eq(admissionAppointments.institutionId, institutionId),
          ),
        )
        .orderBy(asc(admissionAppointments.scheduledAt)),
      db
        .select()
        .from(admissionApplicationEvents)
        .where(
          and(
            eq(admissionApplicationEvents.applicationId, applicationId),
            eq(admissionApplicationEvents.institutionId, institutionId),
          ),
        )
        .orderBy(asc(admissionApplicationEvents.createdAt)),
      db
        .select()
        .from(admissionFeePayments)
        .where(
          and(
            eq(admissionFeePayments.applicationId, applicationId),
            eq(admissionFeePayments.institutionId, institutionId),
          ),
        )
        .limit(1),
      db
        .select({
          id: admissionEnrollments.id,
          studentId: admissionEnrollments.studentId,
          loginRollNumber: students.loginRollNumber,
          createdAt: admissionEnrollments.createdAt,
        })
        .from(admissionEnrollments)
        .innerJoin(
          students,
          and(
            eq(students.id, admissionEnrollments.studentId),
            eq(students.institutionId, admissionEnrollments.institutionId),
          ),
        )
        .where(
          and(
            eq(admissionEnrollments.applicationId, applicationId),
            eq(admissionEnrollments.institutionId, institutionId),
          ),
        )
        .limit(1),
      db
        .select({ id: campuses.id, name: campuses.name })
        .from(campuses)
        .where(
          and(
            eq(campuses.institutionId, institutionId),
            isNull(campuses.deletedAt),
          ),
        )
        .orderBy(asc(campuses.name)),
      db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(
          and(
            eq(classes.institutionId, institutionId),
            isNull(classes.deletedAt),
            eq(classes.isGraduatedArchive, false),
          ),
        )
        .orderBy(asc(classes.level), asc(classes.name)),
      db
        .select({
          id: sections.id,
          classId: sections.classId,
          name: sections.name,
        })
        .from(sections)
        .where(
          and(
            eq(sections.institutionId, institutionId),
            isNull(sections.deletedAt),
          ),
        )
        .orderBy(asc(sections.name)),
    ]);
    const safeDocuments = documents.map(
      ({ submittedFileKey, ...document }) => ({
        ...document,
        submittedFileKey: submittedFileKey ? "available" : null,
      }),
    );
    const feePayment = feeRows[0]
      ? {
          ...feeRows[0],
          proofFileKey: feeRows[0].proofFileKey ? "available" : null,
        }
      : null;
    return NextResponse.json({
      application,
      documents: safeDocuments,
      appointments,
      events,
      feePayment,
      enrollment: enrollmentRows[0] || null,
      options: {
        campuses: campusOptions,
        classes: classOptions,
        sections: sectionOptions,
      },
    });
  },
);

export const PATCH = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (
    req: NextRequest,
    {
      session,
      params,
    }: { session: JWTPayload; params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const applicationId = Number(id);
    if (!Number.isInteger(applicationId) || applicationId <= 0)
      return NextResponse.json(
        { error: "Invalid application" },
        { status: 400 },
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
    const parsed = admissionReviewActionSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid review action" },
        { status: 400 },
      );

    const institutionId = getTenantContext(session);
    const application = await getApplication(applicationId, institutionId);
    if (!application)
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );

    let nextStatus: ApplicationStatus = application.status;
    let title = "Application updated";
    let description: string | null = null;
    let automaticStep: AutomaticStep | null = null;
    let acceptedCredentials: {
      loginId: string;
      temporaryPassword: string;
    } | null = null;
    const action = parsed.data;

    if (action.action === "startReview") {
      if (!allowedStatuses.startReview.includes(application.status))
        return invalidTransition(application.status);
      automaticStep = automaticWorkflowStep(application, "ACCEPTED");
      nextStatus = automaticStep.status;
      title = automaticStep.title;
      description = automaticStep.description;
      if (!application.applicantId)
        return NextResponse.json(
          { error: "No applicant account is linked to this application" },
          { status: 409 },
        );
      if (application.canResetApplicantCredentials) {
        const temporaryPassword = crypto.randomBytes(9).toString("base64url");
        acceptedCredentials = { loginId: application.guardianEmail, temporaryPassword };
      }
    } else if (action.action === "requestDocuments") {
      if (!allowedStatuses.requestDocuments.includes(application.status))
        return invalidTransition(application.status);
      nextStatus = "DOCUMENTS_REQUIRED";
      title = "Documents requested";
      description = action.documents
        .map((document) => document.name)
        .join(", ")
        .slice(0, 1000);
    } else if (action.action === "scheduleAppointment") {
      const rule =
        action.type === "TEST"
          ? allowedStatuses.scheduleTest
          : allowedStatuses.scheduleInterview;
      if (!rule.includes(application.status))
        return invalidTransition(application.status);
      if (action.type === "TEST" && !application.requiresTest)
        return NextResponse.json(
          { error: "This admission cycle does not require a test" },
          { status: 409 },
        );
      if (action.type === "INTERVIEW" && !application.requiresInterview)
        return NextResponse.json(
          { error: "This admission cycle does not require an interview" },
          { status: 409 },
        );
      if (new Date(action.scheduledAt).getTime() <= Date.now())
        return NextResponse.json(
          { error: "Appointment date and time must be in the future" },
          { status: 400 },
        );
      if (action.type === "INTERVIEW" && application.requiresTest) {
        const [test] = await db
          .select({ outcome: admissionAppointments.outcome })
          .from(admissionAppointments)
          .where(
            and(
              eq(admissionAppointments.applicationId, applicationId),
              eq(admissionAppointments.institutionId, institutionId),
              eq(admissionAppointments.type, "TEST"),
            ),
          )
          .limit(1);
        if (test?.outcome !== "PASSED")
          return NextResponse.json(
            {
              error:
                "Record a passed admission test before scheduling the interview",
            },
            { status: 409 },
          );
      }
      nextStatus =
        action.type === "TEST" ? "TEST_SCHEDULED" : "INTERVIEW_SCHEDULED";
      title =
        action.type === "TEST"
          ? "Admission test scheduled"
          : "Interview scheduled";
      description = `${new Date(action.scheduledAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} at ${action.location}`;
    } else if (action.action === "recordOutcome") {
      const [appointment] = await db
        .select()
        .from(admissionAppointments)
        .where(
          and(
            eq(admissionAppointments.applicationId, applicationId),
            eq(admissionAppointments.institutionId, institutionId),
            eq(admissionAppointments.type, action.type),
          ),
        )
        .limit(1);
      if (!appointment)
        return NextResponse.json(
          {
            error: `${action.type === "TEST" ? "Test" : "Interview"} has not been scheduled`,
          },
          { status: 409 },
        );
      if (action.type === "TEST" && application.status !== "TEST_SCHEDULED")
        return invalidTransition(application.status);
      if (
        action.type === "INTERVIEW" &&
        application.status !== "INTERVIEW_SCHEDULED"
      )
        return invalidTransition(application.status);
      if (action.outcome === "PASSED") {
        automaticStep = automaticWorkflowStep(
          application,
          action.type === "TEST" ? "TEST_PASSED" : "INTERVIEW_PASSED",
        );
        nextStatus = automaticStep.status;
        title = automaticStep.title;
        description = [automaticStep.description, action.note]
          .filter(Boolean)
          .join(" — ");
      } else {
        nextStatus = "REJECTED";
        title = `${action.type === "TEST" ? "Admission test" : "Interview"} ${action.outcome.toLowerCase()}`;
        description = action.note;
      }
    } else if (action.action === "reviewDocument") {
      if (application.status !== "DOCUMENTS_REQUIRED")
        return invalidTransition(application.status);
      const documents = await db
        .select()
        .from(admissionDocumentRequests)
        .where(
          and(
            eq(admissionDocumentRequests.applicationId, applicationId),
            eq(admissionDocumentRequests.institutionId, institutionId),
          ),
        );
      const document = documents.find((item) => item.id === action.documentId);
      if (!document)
        return NextResponse.json(
          { error: "Requested document not found" },
          { status: 404 },
        );
      if (!document.submittedFileKey)
        return NextResponse.json(
          { error: "The applicant has not submitted this document" },
          { status: 409 },
        );
      const allDocumentsVerified =
        action.status === "VERIFIED" &&
        documents.every(
          (item) => item.id === document.id || item.status === "VERIFIED",
        );
      if (allDocumentsVerified) {
        automaticStep = automaticWorkflowStep(
          application,
          "DOCUMENTS_VERIFIED",
        );
        nextStatus = automaticStep.status;
        title = automaticStep.title;
        description = [automaticStep.description, action.note]
          .filter(Boolean)
          .join(" — ");
      } else {
        nextStatus = "DOCUMENTS_REQUIRED";
        title = (
          action.status === "VERIFIED"
            ? `${document.documentName} verified`
            : `${document.documentName} needs resubmission`
        ).slice(0, 160);
        description = action.note;
      }
    } else if (action.action === "initiateFee") {
      if (!["OFFERED", "FEE_PENDING"].includes(application.status))
        return invalidTransition(application.status);
      if (
        action.dueDate &&
        action.dueDate < new Date().toISOString().slice(0, 10)
      )
        return NextResponse.json(
          { error: "Fee due date cannot be in the past" },
          { status: 400 },
        );
      nextStatus = "FEE_PENDING";
      title = "Admission fee payment requested";
      description = `PKR ${action.amount.toLocaleString("en-PK")}${action.dueDate ? ` due by ${action.dueDate}` : ""}`;
    } else if (action.action === "reviewFee") {
      if (application.status !== "FEE_VERIFICATION")
        return invalidTransition(application.status);
      const [payment] = await db
        .select()
        .from(admissionFeePayments)
        .where(
          and(
            eq(admissionFeePayments.applicationId, applicationId),
            eq(admissionFeePayments.institutionId, institutionId),
          ),
        )
        .limit(1);
      if (!payment?.proofFileKey || payment.status !== "SUBMITTED")
        return NextResponse.json(
          { error: "No fee payment proof is awaiting review" },
          { status: 409 },
        );
      nextStatus =
        action.status === "VERIFIED" ? "FEE_VERIFIED" : "FEE_PENDING";
      title =
        action.status === "VERIFIED"
          ? "Admission fee verified"
          : "Fee proof needs resubmission";
      description = action.note;
    } else if (action.action === "resetApplicantPassword") {
      if (!application.canResetApplicantCredentials) return NextResponse.json({ error: "Shared applicant credentials are managed through the applicant portal" }, { status: 403 });
      if (!application.applicantId)
        return NextResponse.json(
          { error: "No applicant account is linked to this application" },
          { status: 409 },
        );
      const [account] = await db
        .select({
          id: admissionApplicantAccounts.id,
          sessionVersion: admissionApplicantAccounts.sessionVersion,
        })
        .from(admissionApplicantAccounts)
        .where(
          and(
            eq(admissionApplicantAccounts.id, application.applicantId),
            eq(admissionApplicantAccounts.institutionId, institutionId),
          ),
        )
        .limit(1);
      if (!account)
        return NextResponse.json(
          { error: "Applicant account not found" },
          { status: 404 },
        );
      const temporaryPassword = crypto.randomBytes(9).toString("base64url");
      const passwordHash = await hashPassword(temporaryPassword);
      await db
        .update(admissionApplicantAccounts)
        .set({
          passwordHash,
          mustChangePassword: true,
          sessionVersion: account.sessionVersion + 1,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(admissionApplicantAccounts.id, account.id),
            eq(admissionApplicantAccounts.institutionId, institutionId),
          ),
        );
      const resetIp = getClientIp(req);
      await enqueueEmail({
        institutionId,
        to: application.guardianEmail,
        subject: `Applicant password reset - ${application.institutionName}`,
        html: AdmissionCredentialEmail({ institutionName: application.institutionName, accountType: "applicant", loginId: application.guardianEmail, temporaryPassword }),
        dedupeKey: `admission:${applicationId}:applicant-reset:${crypto.randomUUID()}`,
      });
      after(async () => {
        try {
          await logAudit({
            institutionId,
            actorId: session.userId,
            actorRole: session.role,
            action: "RESET_ADMISSION_APPLICANT_PASSWORD",
            target: `Application ${application.applicationNumber}`,
            ip: resetIp,
          });
        } catch (error) {
          console.error("Applicant reset audit failed:", error);
        }
      });
      return NextResponse.json({
        success: true,
        credentials: {
          loginRollNumber: application.guardianEmail,
          temporaryPassword,
        },
      });
    } else if (action.action === "resetStudentPassword") {
      if (application.status !== "ENROLLED")
        return invalidTransition(application.status);
      const [student] = await db
        .select({ id: students.id, loginRollNumber: students.loginRollNumber })
        .from(admissionEnrollments)
        .innerJoin(
          students,
          and(
            eq(students.id, admissionEnrollments.studentId),
            eq(students.institutionId, admissionEnrollments.institutionId),
          ),
        )
        .where(
          and(
            eq(admissionEnrollments.applicationId, applicationId),
            eq(admissionEnrollments.institutionId, institutionId),
          ),
        )
        .limit(1);
      if (!student)
        return NextResponse.json(
          { error: "Enrolled student account not found" },
          { status: 404 },
        );
      const temporaryPassword = crypto.randomBytes(9).toString("base64url");
      const passwordHash = await hashPassword(temporaryPassword);
      await db
        .update(students)
        .set({ passwordHash, mustChangePassword: true })
        .where(
          and(
            eq(students.id, student.id),
            eq(students.institutionId, institutionId),
          ),
        );
      try {
        await Promise.all([
          revokeAllSessions("STUDENT", student.id),
          invalidateUserValidity("STUDENT", student.id),
        ]);
      } catch (sessionError) {
        console.error(
          "Student session revocation after admission reset failed:",
          sessionError,
        );
      }
      const resetIp = getClientIp(req);
      await enqueueEmail({
        institutionId,
        to: application.guardianEmail,
        subject: `Student password reset - ${application.institutionName}`,
        html: AdmissionCredentialEmail({ institutionName: application.institutionName, accountType: "student", loginId: student.loginRollNumber, temporaryPassword }),
        dedupeKey: `admission:${applicationId}:student-reset:${crypto.randomUUID()}`,
      });
      after(async () => {
        try {
          await logAudit({
            institutionId,
            actorId: session.userId,
            actorRole: session.role,
            action: "RESET_ENROLLED_STUDENT_PASSWORD",
            target: `Student ${student.id}`,
            ip: resetIp,
          });
        } catch (error) {
          console.error("Student reset audit failed:", error);
        }
      });
      return NextResponse.json({
        success: true,
        credentials: {
          loginRollNumber: student.loginRollNumber,
          temporaryPassword,
        },
      });
    } else if (action.action === "withdrawApplication") {
      if (
        ["FEE_VERIFICATION", "FEE_VERIFIED", "ENROLLED", "WITHDRAWN"].includes(
          application.status,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "This application can no longer be withdrawn after fee submission or verification",
          },
          { status: 409 },
        );
      }
      const [payment] = await db
        .select({ status: admissionFeePayments.status })
        .from(admissionFeePayments)
        .where(
          and(
            eq(admissionFeePayments.applicationId, applicationId),
            eq(admissionFeePayments.institutionId, institutionId),
          ),
        )
        .limit(1);
      if (payment && ["SUBMITTED", "VERIFIED"].includes(payment.status)) {
        return NextResponse.json(
          {
            error:
              "This application can no longer be withdrawn after fee submission or verification",
          },
          { status: 409 },
        );
      }
      nextStatus = "WITHDRAWN";
      title = "Application withdrawn";
      description = action.reason;
    } else if (action.action === "enrollStudent") {
      if (application.campusId !== null && action.campusId !== application.campusId) return NextResponse.json({ error: "Enroll into the campus selected on the application" }, { status: 400 });
      if (application.status !== "FEE_VERIFIED")
        return invalidTransition(application.status);
      const applicantId = application.applicantId;
      if (!applicantId)
        return NextResponse.json(
          { error: "This application has no linked applicant portal account" },
          { status: 409 },
        );
      if (application.offeringCapacity) {
        const [seatUsage] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(admissionApplications)
          .where(
            and(
              eq(admissionApplications.offeringId, application.offeringId),
              eq(admissionApplications.institutionId, institutionId),
              eq(admissionApplications.status, "ENROLLED"),
            ),
          );
        if ((seatUsage?.count || 0) >= application.offeringCapacity)
          return NextResponse.json(
            { error: "This offering has reached its enrollment capacity" },
            { status: 409 },
          );
      }
      const [
        [payment],
        [existingEnrollment],
        [institution],
        [classRow],
        sectionRows,
        campusRows,
      ] = await Promise.all([
        db
          .select({ status: admissionFeePayments.status })
          .from(admissionFeePayments)
          .where(
            and(
              eq(admissionFeePayments.applicationId, applicationId),
              eq(admissionFeePayments.institutionId, institutionId),
            ),
          )
          .limit(1),
        db
          .select({ id: admissionEnrollments.id })
          .from(admissionEnrollments)
          .where(
            and(
              eq(admissionEnrollments.applicationId, applicationId),
              eq(admissionEnrollments.institutionId, institutionId),
            ),
          )
          .limit(1),
        db
          .select({ type: institutions.type, username: institutions.username, parentInstitutionId: institutions.parentInstitutionId, campusName: institutions.campusName })
          .from(institutions)
          .where(eq(institutions.id, institutionId))
          .limit(1),
        db
          .select({ id: classes.id })
          .from(classes)
          .where(
            and(
              eq(classes.id, action.classId),
              eq(classes.institutionId, institutionId),
              isNull(classes.deletedAt),
              eq(classes.isGraduatedArchive, false),
            ),
          )
          .limit(1),
        action.sectionId
          ? db
              .select({ id: sections.id, classId: sections.classId })
              .from(sections)
              .where(
                and(
                  eq(sections.id, action.sectionId),
                  eq(sections.institutionId, institutionId),
                  isNull(sections.deletedAt),
                ),
              )
              .limit(1)
          : Promise.resolve([]),
        action.campusId
          ? db
              .select({ id: campuses.id })
              .from(campuses)
              .where(
                and(
                  eq(campuses.id, action.campusId),
                  eq(campuses.institutionId, institutionId),
                  isNull(campuses.deletedAt),
                ),
              )
              .limit(1)
          : Promise.resolve([]),
      ]);
      if (payment?.status !== "VERIFIED")
        return NextResponse.json(
          { error: "Verify the admission fee before enrollment" },
          { status: 409 },
        );
      if (existingEnrollment)
        return NextResponse.json(
          { error: "This application is already enrolled" },
          { status: 409 },
        );
      if (!institution || !classRow)
        return NextResponse.json(
          { error: "Select a valid class" },
          { status: 400 },
        );
      if (action.campusId && !campusRows[0])
        return NextResponse.json(
          { error: "Select a valid campus" },
          { status: 400 },
        );
      if (
        action.sectionId &&
        (!sectionRows[0] || sectionRows[0].classId !== action.classId)
      )
        return NextResponse.json(
          { error: "Select a section belonging to the chosen class" },
          { status: 400 },
        );

      let sectionId = sectionRows[0]?.id;
      if (!sectionId) {
        const [existingWholeClass] = await db
          .select({ id: sections.id })
          .from(sections)
          .where(
            and(
              eq(sections.institutionId, institutionId),
              eq(sections.classId, action.classId),
              eq(sections.name, WHOLE_CLASS_SECTION_NAME),
              isNull(sections.deletedAt),
            ),
          )
          .limit(1);
        if (existingWholeClass) sectionId = existingWholeClass.id;
        else {
          const [created] = await db
            .insert(sections)
            .values({
              institutionId,
              classId: action.classId,
              name: WHOLE_CLASS_SECTION_NAME,
            })
            .returning({ id: sections.id });
          sectionId = created.id;
        }
      }
      if (!sectionId)
        return NextResponse.json(
          { error: "Unable to prepare a class section" },
          { status: 500 },
        );

      const loginInstitution = await resolveStudentLoginInstitution(institution);
      const [admissionSequence] = await allocateAdmissionSequences(
        institutionId,
        action.yearOfJoining,
      );
      const loginRollNumber = generateStudentLoginRollNumber({
        institution: loginInstitution,
        yearOfJoining: action.yearOfJoining,
        admissionSequence,
      });
      const temporaryPassword = crypto.randomBytes(9).toString("base64url");
      const passwordHash = await hashPassword(temporaryPassword);
      const enrollmentIp = getClientIp(req);
      const [applicantAccount] = application.applicantId
        ? await db
            .select({
              id: admissionApplicantAccounts.id,
              passwordHash: admissionApplicantAccounts.passwordHash,
            })
            .from(admissionApplicantAccounts)
            .where(and(eq(admissionApplicantAccounts.id, application.applicantId), eq(admissionApplicantAccounts.institutionId, application.intakeInstitutionId)))
            .limit(1)
        : [];

      const parentActivation = applicantAccount?.passwordHash
        ? {
            temporaryPassword: "",
            passwordHash: applicantAccount.passwordHash,
          }
        : await prepareParentActivation(
            institutionId,
            application.guardianEmail,
          );
      let parentLink!: Awaited<ReturnType<typeof syncStudentGuardian>>;
      const birthDate = new Date(`${application.dateOfBirth}T00:00:00Z`);
      const now = new Date();
      let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
      if (
        now.getUTCMonth() < birthDate.getUTCMonth() ||
        (now.getUTCMonth() === birthDate.getUTCMonth() &&
          now.getUTCDate() < birthDate.getUTCDate())
      )
        age -= 1;

      try {
        await db.transaction(async (tx) => {
          if (application.offeringCapacity) {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(${institutionId}, ${application.offeringId})`,
            );
            const [seatUsage] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(admissionApplications)
              .where(
                and(
                  eq(admissionApplications.offeringId, application.offeringId),
                  eq(admissionApplications.institutionId, institutionId),
                  eq(admissionApplications.status, "ENROLLED"),
                ),
              );
            if ((seatUsage?.count || 0) >= application.offeringCapacity)
              throw new Error("ADMISSION_CAPACITY_REACHED");
          }
          const [student] = await tx
            .insert(students)
            .values({
              institutionId,
              campusId: action.campusId,
              name: application.studentName,
              fatherName: null,
              phone: application.guardianPhone,
              gender: application.gender,
              loginRollNumber,
              passwordHash,
              classId: action.classId,
              sectionId,
              yearOfJoining: action.yearOfJoining,
              admissionSequence,
              classRollNumber: action.classRollNumber,
              age: Math.max(1, age),
              emergencyContact: application.guardianPhone,
              parentalWhatsapp: application.guardianPhone,
              guardianEmail: application.guardianEmail.trim().toLowerCase(),
              mustChangePassword: true,
              isActive: true,
            })
            .returning({ id: students.id });
          parentLink = await syncStudentGuardian(tx, {
            institutionId,
            studentId: student.id,
            guardianEmail: application.guardianEmail,
            guardianName: application.guardianName,
            guardianPhone: application.guardianPhone,
            actorId: session.userId,
            actorRole: session.role,
            ip: enrollmentIp,
            activation: parentActivation,
          });
          await tx.insert(admissionEnrollments).values({
            institutionId,
            applicationId,
            studentId: student.id,
            enrolledBy: session.userId,
          });
          await tx
            .update(admissionApplications)
            .set({ status: "ENROLLED", updatedAt: new Date() })
            .where(
              and(
                eq(admissionApplications.id, applicationId),
                eq(admissionApplications.institutionId, institutionId),
                eq(admissionApplications.status, "FEE_VERIFIED"),
              ),
            );
          // Keep applicant access for a seven-day credential handover. Portal and
          // login authorization enforce the expiry through admission_enrollments.
          await tx.insert(admissionApplicationEvents).values({
            institutionId,
            applicationId,
            title: "Enrollment completed",
            description: `Permanent student login ID: ${loginRollNumber}`,
            fromStatus: application.status,
            toStatus: "ENROLLED",
            visibleToApplicant: true,
            actorId: session.userId,
            actorRole: session.role,
          });
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "ADMISSION_CAPACITY_REACHED"
        )
          return NextResponse.json(
            { error: "This offering has reached its enrollment capacity" },
            { status: 409 },
          );
        const databaseError = error as {
          code?: string;
          cause?: { code?: string };
        };
        if ((databaseError.code || databaseError.cause?.code) === "23505")
          return NextResponse.json(
            {
              error:
                "That class roll number is already assigned, or this application was already enrolled",
            },
            { status: 409 },
          );
        throw error;
      }

      await enqueueEmail({
        institutionId,
        to: application.guardianEmail,
        subject: "Student account activation - Credentials",
        html: AdmissionEnrollmentEmail({ institutionName: application.institutionName, studentName: application.studentName, loginId: loginRollNumber, temporaryPassword }),
        dedupeKey: `admission:${applicationId}:student-activation`,
      });
      if (parentLink?.activation && parentLink.guardianEmail) {
        await enqueueEmail({
          institutionId,
          to: parentLink.guardianEmail,
          subject: applicantAccount?.passwordHash
            ? `Parent account active - ${application.institutionName}`
            : `Parent account credentials - ${application.institutionName}`,
          html: ParentAccountActivationEmail({
            institutionName: application.institutionName,
            studentName: application.studentName,
            institutionUsername: application.institutionUsername,
            guardianEmail: parentLink.guardianEmail,
            temporaryPassword: parentLink.activation.temporaryPassword,
            hasExistingPassword: Boolean(applicantAccount?.passwordHash),
          }),
          dedupeKey: `parent:${parentLink.parentId}:initial-activation`,
        });
      }
      if (parentLink?.parentId) {
        await invalidateUserValidity("PARENT", parentLink.parentId);
      }
      after(async () => {
        try {
          await logAudit({
            institutionId,
            actorId: session.userId,
            actorRole: session.role,
            action: "ADMISSION_ENROLL_STUDENT",
            target: `Application ${application.applicationNumber}`,
            ip: enrollmentIp,
          });
        } catch (auditError) {
          console.error("Enrollment audit failed:", auditError);
        }
        try {
          const { invalidateInstitutionRosterCaches } =
            await import("@/lib/redis");
          await invalidateInstitutionRosterCaches(institutionId);
        } catch (cacheError) {
          console.error(
            "Enrollment roster cache invalidation failed:",
            cacheError,
          );
        }
      });
      return NextResponse.json({
        success: true,
        status: "ENROLLED",
        credentials: { loginRollNumber, temporaryPassword },
      });
    } else {
      if (!allowedStatuses.decision.includes(application.status))
        return invalidTransition(application.status);
      if (action.decision === "OFFERED" && application.requiresTest) {
        const [test] = await db
          .select({ outcome: admissionAppointments.outcome })
          .from(admissionAppointments)
          .where(
            and(
              eq(admissionAppointments.applicationId, applicationId),
              eq(admissionAppointments.institutionId, institutionId),
              eq(admissionAppointments.type, "TEST"),
            ),
          )
          .limit(1);
        if (test?.outcome !== "PASSED")
          return NextResponse.json(
            { error: "A passed test result is required before a decision" },
            { status: 409 },
          );
      }
      if (action.decision === "OFFERED" && application.requiresInterview) {
        const [interview] = await db
          .select({ outcome: admissionAppointments.outcome })
          .from(admissionAppointments)
          .where(
            and(
              eq(admissionAppointments.applicationId, applicationId),
              eq(admissionAppointments.institutionId, institutionId),
              eq(admissionAppointments.type, "INTERVIEW"),
            ),
          )
          .limit(1);
        if (interview?.outcome !== "PASSED")
          return NextResponse.json(
            {
              error: "A passed interview result is required before a decision",
            },
            { status: 409 },
          );
      }
      if (action.decision === "OFFERED") {
        automaticStep = automaticWorkflowStep(application, "INTERVIEW_PASSED");
        nextStatus = automaticStep.status;
        title = automaticStep.title;
        description = [automaticStep.description, action.note]
          .filter(Boolean)
          .join(" — ");
      } else {
        nextStatus = "REJECTED";
        title = "Application not accepted";
        description = action.note;
      }
    }

    const transitionApplied = await db.transaction(async (tx) => {
      // Serialize manual decisions with gateway settlement before touching the fee.
      const [current] = await tx.select({ status: admissionApplications.status }).from(admissionApplications)
        .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.institutionId, institutionId))).for("update");
      if (!current || current.status !== application.status) return false;
      if (acceptedCredentials && application.applicantId) {
        const [account] = await tx
          .select({ sessionVersion: admissionApplicantAccounts.sessionVersion })
          .from(admissionApplicantAccounts)
          .where(
            and(
              eq(admissionApplicantAccounts.id, application.applicantId),
              eq(admissionApplicantAccounts.institutionId, institutionId),
            ),
          )
          .limit(1);
        if (!account) throw new Error("Applicant account not found");
        await tx
          .update(admissionApplicantAccounts)
          .set({
            passwordHash: await hashPassword(
              acceptedCredentials.temporaryPassword,
            ),
            mustChangePassword: true,
            sessionVersion: account.sessionVersion + 1,
            failedLoginCount: 0,
            lockedUntil: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(admissionApplicantAccounts.id, application.applicantId),
              eq(admissionApplicantAccounts.institutionId, institutionId),
            ),
          );
      }
      if (automaticStep?.documents) {
        for (const document of automaticStep.documents) {
          await tx
            .insert(admissionDocumentRequests)
            .values({
              institutionId,
              applicationId,
              documentName: document.name,
              instructions: document.instructions,
            })
            .onConflictDoUpdate({
              target: [
                admissionDocumentRequests.applicationId,
                admissionDocumentRequests.documentName,
              ],
              set: {
                instructions: document.instructions,
                status: "REQUESTED",
                updatedAt: new Date(),
              },
            });
        }
      }
      if (automaticStep?.appointment) {
        await tx
          .insert(admissionAppointments)
          .values({
            institutionId,
            applicationId,
            ...automaticStep.appointment,
          })
          .onConflictDoUpdate({
            target: [
              admissionAppointments.applicationId,
              admissionAppointments.type,
            ],
            set: {
              scheduledAt: automaticStep.appointment.scheduledAt,
              location: automaticStep.appointment.location,
              instructions: automaticStep.appointment.instructions,
              outcome: "PENDING",
              outcomeNote: null,
              updatedAt: new Date(),
            },
          });
      }
      if (automaticStep?.fee) {
        await tx
          .insert(admissionFeePayments)
          .values({ institutionId, applicationId, ...automaticStep.fee })
          .onConflictDoUpdate({
            target: admissionFeePayments.applicationId,
            set: {
              ...automaticStep.fee,
              payerReference: null,
              payerSourceBank: null,
              proofFileKey: null,
              status: "PENDING",
              reviewerNote: null,
              verifiedBy: null,
              verifiedAt: null,
              submittedAt: null,
              updatedAt: new Date(),
            },
          });
      }
      if (action.action === "requestDocuments") {
        for (const document of action.documents) {
          await tx
            .insert(admissionDocumentRequests)
            .values({
              institutionId,
              applicationId,
              documentName: document.name,
              instructions: document.instructions,
            })
            .onConflictDoUpdate({
              target: [
                admissionDocumentRequests.applicationId,
                admissionDocumentRequests.documentName,
              ],
              set: {
                instructions: document.instructions,
                status: "REQUESTED",
                updatedAt: new Date(),
              },
            });
        }
      }
      if (action.action === "scheduleAppointment") {
        await tx
          .insert(admissionAppointments)
          .values({
            institutionId,
            applicationId,
            type: action.type,
            scheduledAt: new Date(action.scheduledAt),
            location: action.location,
            instructions: action.instructions,
          })
          .onConflictDoUpdate({
            target: [
              admissionAppointments.applicationId,
              admissionAppointments.type,
            ],
            set: {
              scheduledAt: new Date(action.scheduledAt),
              location: action.location,
              instructions: action.instructions,
              outcome: "PENDING",
              outcomeNote: null,
              updatedAt: new Date(),
            },
          });
      }
      if (action.action === "recordOutcome") {
        await tx
          .update(admissionAppointments)
          .set({
            outcome: action.outcome,
            outcomeNote: action.note,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(admissionAppointments.applicationId, applicationId),
              eq(admissionAppointments.institutionId, institutionId),
              eq(admissionAppointments.type, action.type as AppointmentType),
            ),
          );
      }
      if (action.action === "reviewDocument") {
        await tx
          .update(admissionDocumentRequests)
          .set({
            status: action.status,
            reviewerNote: action.note,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(admissionDocumentRequests.id, action.documentId),
              eq(admissionDocumentRequests.applicationId, applicationId),
              eq(admissionDocumentRequests.institutionId, institutionId),
            ),
          );
      }
      if (action.action === "initiateFee") {
        await tx
          .insert(admissionFeePayments)
          .values({
            institutionId,
            applicationId,
            amount: action.amount,
            dueDate: action.dueDate,
            instructions: action.instructions,
            paymentMethods: [],
          })
          .onConflictDoUpdate({
            target: admissionFeePayments.applicationId,
            set: {
              amount: action.amount,
              dueDate: action.dueDate,
              instructions: action.instructions,
              paymentMethods: [],
              payerReference: null,
              payerSourceBank: null,
              proofFileKey: null,
              status: "PENDING",
              reviewerNote: null,
              verifiedBy: null,
              verifiedAt: null,
              submittedAt: null,
              updatedAt: new Date(),
            },
          });
      }
      if (action.action === "reviewFee") {
        await tx
          .update(admissionFeePayments)
          .set({
            status: action.status,
            reviewerNote: action.note,
            verifiedBy: action.status === "VERIFIED" ? session.userId : null,
            verifiedAt: action.status === "VERIFIED" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(admissionFeePayments.applicationId, applicationId),
              eq(admissionFeePayments.institutionId, institutionId),
            ),
          );
      }
      await tx
        .update(admissionApplications)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(
          and(
            eq(admissionApplications.id, applicationId),
            eq(admissionApplications.institutionId, institutionId),
          ),
        );
      await tx.insert(admissionApplicationEvents).values({
        institutionId,
        applicationId,
        title,
        description,
        fromStatus: application.status,
        toStatus: nextStatus,
        visibleToApplicant: true,
        actorId: session.userId,
        actorRole: session.role,
      });
      return true;
    });
    if (!transitionApplied) return NextResponse.json({ error: "Application changed. Refresh before reviewing it again." }, { status: 409 });

    const actionIp = getClientIp(req);
    await enqueueEmail({
      institutionId,
      to: application.guardianEmail,
      subject: `${title} - ${application.institutionName}`,
      html: AdmissionUpdateEmail({ institutionName: application.institutionName, studentName: application.studentName, applicationNumber: application.applicationNumber, title, description }),
      dedupeKey: `admission:${applicationId}:${action.action}:${crypto.randomUUID()}`,
    });
    if (acceptedCredentials) {
      await enqueueEmail({
        institutionId,
        to: application.guardianEmail,
        subject: `Applicant portal credentials - ${application.institutionName}`,
        html: AdmissionCredentialEmail({ institutionName: application.institutionName, accountType: "applicant", loginId: acceptedCredentials.loginId, temporaryPassword: acceptedCredentials.temporaryPassword }),
        dedupeKey: `admission:${applicationId}:accepted-credentials`,
      });
    }
    after(async () => {
      try {
        await logAudit({
          institutionId,
          actorId: session.userId,
          actorRole: session.role,
          action: `ADMISSION_${action.action.toUpperCase()}`,
          target: `Application ${application.applicationNumber}`,
          ip: actionIp,
        });
      } catch (auditError) {
        console.error("Admission review audit failed:", auditError);
      }
    });
    return NextResponse.json({
      success: true,
      status: nextStatus,
      ...(acceptedCredentials
        ? { applicantCredentials: acceptedCredentials }
        : {}),
    });
  },
);
