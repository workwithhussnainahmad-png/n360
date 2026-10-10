import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  unique,
  date,
  time,
  jsonb,
  real,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  bigint,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { WebsiteNotices } from "@/lib/public-website-notices";
import type { PublicEventBlock } from "@/lib/public-events";
import type { PageDesign, WebsiteDesign } from "@/lib/public-site-builder";
import { sql } from "drizzle-orm";

// --- ENUMS ---
export const roleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "EMPLOYEE",
  "INSTITUTION",
  "INSTITUTION_ADMIN",
  "STAFF",
  "STUDENT",
  "PARENT",
]);
export const parentAccountStatusEnum = pgEnum("parent_account_status", [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "DISABLED",
]);
export const instTypeEnum = pgEnum("institution_type", [
  "SCHOOL",
  "COLLEGE",
  "UNIVERSITY",
]);
export const instStatusEnum = pgEnum("institution_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "LATE",
  "LEAVE",
]);
export const testTypeEnum = pgEnum("test_type", [
  "DAILY",
  "WEEKLY",
  "QUIZ",
  "MONTHLY",
  "MID",
  "FINAL",
  "PROMOTION",
]);
export const promotionStatusEnum = pgEnum("promotion_status", [
  "PROMOTED",
  "RETAINED",
  "GRADUATED",
]);
export const studentAcademicStatusEnum = pgEnum("student_academic_status", [
  "ACTIVE",
  "GRADUATED",
]);
export const testCreatorRoleEnum = pgEnum("test_creator_role", [
  "INSTITUTION",
  "STAFF",
]);
export const onlineTestModeEnum = pgEnum("online_test_mode", ["MCQ", "MIX"]);
export const onlineQuestionTypeEnum = pgEnum("online_question_type", [
  "MCQ",
  "SHORT",
]);
export const onlineSubmissionStatusEnum = pgEnum("online_submission_status", [
  "IN_PROGRESS",
  "SUBMITTED",
  "AUTO_GRADED",
  "PENDING_REVIEW",
  "GRADED",
  "FAILED",
  "ABANDONED",
]);
export const announcementTargetEnum = pgEnum("announcement_target", [
  "ALL",
  "CAMPUS",
  "CLASS",
  "SECTION",
  "USER",
]);
export const profileRequestStatusEnum = pgEnum("profile_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "ANNOUNCEMENT",
  "EXAM_TIMETABLE",
  "ASSIGNMENT",
  "TEST",
  "MARKS",
  "ATTENDANCE",
  "GENERAL",
  "LEAVE_REQUEST",
  "DIARY",
]);
export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const genderEnum = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "OPEN",
  "WORKING",
  "RESOLVED",
  "FORWARDED",
]);
export const ticketPlatformStatusEnum = pgEnum("ticket_platform_status", [
  "RECEIVED",
  "WORKING",
  "RESOLVED",
]);
export const ticketHistoryActionEnum = pgEnum("ticket_history_action", [
  "CREATED",
  "STATUS_CHANGED",
  "FORWARDED",
  "PLATFORM_STATUS_CHANGED",
  "COMMENT_ADDED",
]);
export const blogStatusEnum = pgEnum("blog_status", ["DRAFT", "PUBLISHED"]);
export const publicEventStatusEnum = pgEnum("public_event_status", ["DRAFT", "PUBLISHED"]);
export const publicEventDurationEnum = pgEnum("public_event_duration", ["ONE_DAY", "THREE_DAYS", "ONE_WEEK", "ONE_MONTH", "FOREVER"]);
export const admissionCycleStatusEnum = pgEnum("admission_cycle_status", [
  "DRAFT",
  "OPEN",
  "CLOSED",
]);
export const admissionApplicationStatusEnum = pgEnum(
  "admission_application_status",
  [
    "SUBMITTED",
    "UNDER_REVIEW",
    "DOCUMENTS_REQUIRED",
    "TEST_SCHEDULED",
    "INTERVIEW_SCHEDULED",
    "DECISION_PENDING",
    "OFFERED",
    "REJECTED",
    "FEE_PENDING",
    "FEE_VERIFICATION",
    "FEE_VERIFIED",
    "REFUND_REQUIRED",
    "ENROLLED",
    "WITHDRAWN",
  ],
);
export const admissionDocumentStatusEnum = pgEnum("admission_document_status", [
  "REQUESTED",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
]);
export const streamingProviderEnum = pgEnum("streaming_provider", ["BUNNY", "MUX"]);
export const admissionAppointmentTypeEnum = pgEnum(
  "admission_appointment_type",
  ["TEST", "INTERVIEW"],
);
export const admissionAppointmentOutcomeEnum = pgEnum(
  "admission_appointment_outcome",
  ["PENDING", "PASSED", "FAILED", "ABSENT"],
);
export const admissionFeePaymentStatusEnum = pgEnum(
  "admission_fee_payment_status",
  ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED"],
);
// --- SUPER ADMIN ---
export const superAdmins = pgTable(
  "super_admins",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    securityQuestion: text("security_question").notNull(),
    securityAnswerHash: text("security_answer_hash").notNull(),
    isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // The login CTE matches `lower(email)`. The unique constraint's B-tree is on the
    // raw column, which the planner cannot use for a function call — so every login
    // sequentially scanned this table. Mirrors staff_lower_email_idx.
    lowerEmailIndex: index("super_admins_lower_email_idx").on(
      sql`lower(${t.email})`,
    ),
  }),
);

// --- EMPLOYEES ---
export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    // See super_admins_lower_email_idx: `lower(email)` needs its own expression index.
    lowerEmailIndex: index("employees_lower_email_idx").on(
      sql`lower(${t.email})`,
    ),
  }),
);

// --- INSTITUTIONS ---
export const institutions = pgTable(
  "institutions",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    type: instTypeEnum("type").notNull(),
    // Additional campuses use the existing tenant boundary for all academic data.
    // Only the root row represents the purchased institution.
    parentInstitutionId: integer("parent_institution_id").references((): AnyPgColumn => institutions.id, { onDelete: "cascade" }),
    campusName: varchar("campus_name", { length: 255 }).default("Main").notNull(),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    username: varchar("username", { length: 30 }).notNull().unique(),
    publicSlug: varchar("public_slug", { length: 30 }),
    publicSiteEnabled: boolean("public_site_enabled").default(false).notNull(),
    admissionsEnabled: boolean("admissions_enabled").default(false).notNull(),
    logoKey: varchar("logo_key", { length: 255 }).notNull(),
    signatureKey: varchar("signature_key", { length: 255 }),
    country: varchar("country", { length: 100 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    address: text("address").notNull(),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 50 }).notNull(),
    registrationNumber: varchar("registration_number", {
      length: 100,
    }).notNull(),
    pricingPlan: varchar("pricing_plan", { length: 20 })
      .$type<"BASIC" | "STANDARD" | "PREMIUM" | "ENTERPRISE">()
      .notNull(),
    proofDocumentKey: varchar("proof_document_key", { length: 255 }).notNull(),
    status: instStatusEnum("status").default("PENDING").notNull(),
    rejectionReason: text("rejection_reason"),
    adminPasswordHash: text("admin_password_hash").notNull(),
    acceptFeeVouchers: boolean("accept_fee_vouchers").default(false).notNull(),
    feeVoucherOpenDay: integer("fee_voucher_open_day"),
    feeVoucherLateDay: integer("fee_voucher_late_day"),
    feeVoucherLateFee: integer("fee_voucher_late_fee").default(0).notNull(),
    feePaymentMethods: jsonb("fee_payment_methods")
      .$type<
        Array<{
          id: string;
          providerName: string;
          accountTitle: string;
          accountNumber: string;
          qrUrl: string | null;
        }>
      >()
      .default([])
      .notNull(),
    allowGraduatedStudentAccess: boolean("allow_graduated_student_access")
      .default(true)
      .notNull(),
    courseStreamingProvider: streamingProviderEnum("course_streaming_provider"),
    courseStreamingCredentials: text("course_streaming_credentials"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    statusCreatedIndex: index("institutions_status_created_idx").on(
      t.status,
      t.createdAt,
    ),
    parentInstitutionIndex: index("institutions_parent_institution_idx").on(t.parentInstitutionId),
    parentNotSelf: check("institutions_parent_not_self", sql`${t.parentInstitutionId} IS NULL OR ${t.parentInstitutionId} <> ${t.id}`),
    publicSlugUniqueIndex: uniqueIndex("institutions_public_slug_lower_unique")
      .on(sql`lower(${t.publicSlug})`)
      .where(sql`${t.publicSlug} IS NOT NULL`),
    // Institution login matches `lower(contact_email)`; this table grows with every
    // tenant, so the sequential scan it replaced got worse over time.
    lowerContactEmailIndex: index("institutions_lower_contact_email_idx").on(
      sql`lower(${t.contactEmail})`,
    ),
  }),
);

// --- INSTITUTION PUBLIC WEBSITES ---
export const institutionPublicProfiles = pgTable(
  "institution_public_profiles",
  {
    institutionId: integer("institution_id")
      .primaryKey()
      .references(() => institutions.id, { onDelete: "cascade" }),
    tagline: varchar("tagline", { length: 160 }),
    description: text("description"),
    heroImageUrl: varchar("hero_image_url", { length: 500 }),
    announcementText: varchar("announcement_text", { length: 240 }),
    announcementLink: varchar("announcement_link", { length: 500 }),
    aboutTitle: varchar("about_title", { length: 120 }),
    mission: text("mission"),
    vision: text("vision"),
    principalName: varchar("principal_name", { length: 120 }),
    principalTitle: varchar("principal_title", { length: 120 }),
    principalMessage: text("principal_message"),
    principalImageUrl: varchar("principal_image_url", { length: 500 }),
    statistics: jsonb("statistics")
      .$type<Array<{ value: string; label: string }>>()
      .default([])
      .notNull(),
    programs: jsonb("programs")
      .$type<Array<{ title: string; description: string }>>()
      .default([])
      .notNull(),
    highlights: jsonb("highlights")
      .$type<Array<{ title: string; description: string }>>()
      .default([])
      .notNull(),
    galleryImages: jsonb("gallery_images")
      .$type<Array<{ url: string; caption: string }>>()
      .default([])
      .notNull(),
    publicEmail: varchar("public_email", { length: 255 }),
    publicPhone: varchar("public_phone", { length: 50 }),
    publicAddress: varchar("public_address", { length: 300 }),
    mapUrl: varchar("map_url", { length: 500 }),
    facebookUrl: varchar("facebook_url", { length: 500 }),
    instagramUrl: varchar("instagram_url", { length: 500 }),
    youtubeUrl: varchar("youtube_url", { length: 500 }),
    websiteNotices: jsonb("website_notices")
      .$type<WebsiteNotices>(),
    accentColor: varchar("accent_color", { length: 7 })
      .default("#233c32")
      .notNull(),
    theme: varchar("theme", { length: 30 }).default("default").notNull(),
    design: jsonb("design").$type<WebsiteDesign>().default({}).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const publicEvents = pgTable(
  "public_events",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    coverImageUrl: varchar("cover_image_url", { length: 500 }),
    eventDate: varchar("event_date", { length: 120 }),
    venue: varchar("venue", { length: 200 }),
    blocks: jsonb("blocks").$type<PublicEventBlock[]>().default([]).notNull(),
    design: jsonb("design").$type<PageDesign>().default({}).notNull(),
    status: publicEventStatusEnum("status").default("DRAFT").notNull(),
    visibilityDuration: publicEventDurationEnum("visibility_duration").default("ONE_WEEK").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    institutionSlugUnique: uniqueIndex("public_events_institution_slug_uidx").on(t.institutionId, t.slug),
    publicLookupIndex: index("public_events_public_lookup_idx").on(t.institutionId, t.status, t.publishedAt, t.expiresAt),
  }),
);

// --- ADMISSIONS ---
export const admissionCycles = pgTable(
  "admission_cycles",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    academicYear: varchar("academic_year", { length: 20 }).notNull(),
    opensOn: date("opens_on"),
    closesOn: date("closes_on"),
    instructions: text("instructions"),
    requiredDocuments: jsonb("required_documents")
      .$type<Array<{ name: string; instructions: string | null }>>()
      .default([])
      .notNull(),
    requiresTest: boolean("requires_test").default(false).notNull(),
    testScheduledAt: timestamp("test_scheduled_at", { withTimezone: true }),
    testLocation: varchar("test_location", { length: 300 }),
    testInstructions: text("test_instructions"),
    requiresInterview: boolean("requires_interview").default(false).notNull(),
    interviewScheduledAt: timestamp("interview_scheduled_at", {
      withTimezone: true,
    }),
    interviewLocation: varchar("interview_location", { length: 300 }),
    interviewInstructions: text("interview_instructions"),
    admissionFeeAmount: integer("admission_fee_amount"),
    admissionFeeDueDays: integer("admission_fee_due_days").default(7).notNull(),
    admissionFeeInstructions: text("admission_fee_instructions"),
    paymentBankName: varchar("payment_bank_name", { length: 120 }),
    paymentAccountNumber: varchar("payment_account_number", { length: 160 }),
    paymentQrUrl: varchar("payment_qr_url", { length: 500 }),
    paymentMethods: jsonb("payment_methods")
      .$type<
        Array<{
          id: string;
          providerName: string;
          accountTitle: string;
          accountNumber: string;
          qrUrl: string | null;
        }>
      >()
      .default([])
      .notNull(),
    status: admissionCycleStatusEnum("status").default("DRAFT").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStatusIndex: index("admission_cycles_institution_status_idx").on(
      t.institutionId,
      t.status,
    ),
    institutionNameUnique: unique(
      "admission_cycles_institution_name_unique",
    ).on(t.institutionId, t.name),
    identityTenantUnique: unique("admission_cycles_id_institution_unique").on(
      t.id,
      t.institutionId,
    ),
    oneOpenCyclePerInstitution: uniqueIndex(
      "admission_cycles_one_open_per_institution_uidx",
    )
      .on(t.institutionId)
      .where(sql`${t.status} = 'OPEN'`),
  }),
);

export const admissionCycleCampuses = pgTable(
  "admission_cycle_campuses",
  {
    cycleId: integer("cycle_id").notNull().references(() => admissionCycles.id, { onDelete: "cascade" }),
    campusId: integer("campus_id").notNull(),
    institutionId: integer("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
    isOpen: boolean("is_open").default(false).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  t => ({
    identity: primaryKey({ columns: [t.cycleId, t.campusId] }),
    campusTenantForeignKey: foreignKey({ columns: [t.campusId, t.institutionId], foreignColumns: [campuses.id, campuses.institutionId], name: "admission_cycle_campuses_campus_tenant_fk" }).onDelete("cascade"),
    institutionCycleIndex: index("admission_cycle_campuses_inst_idx").on(t.institutionId, t.cycleId),
  }),
);

export const admissionOfferings = pgTable(
  "admission_offerings",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id").notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    capacity: integer("capacity"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionCycleIndex: index(
      "admission_offerings_institution_cycle_idx",
    ).on(t.institutionId, t.cycleId),
    cycleTitleUnique: unique("admission_offerings_cycle_title_unique").on(
      t.cycleId,
      t.title,
    ),
    identityTenantCycleUnique: unique(
      "admission_offerings_id_inst_cycle_unique",
    ).on(t.id, t.institutionId, t.cycleId),
    cycleTenantForeignKey: foreignKey({
      columns: [t.cycleId, t.institutionId],
      foreignColumns: [admissionCycles.id, admissionCycles.institutionId],
      name: "admission_offerings_cycle_tenant_fk",
    }).onDelete("cascade"),
  }),
);

export const admissionApplicantAccounts = pgTable(
  "admission_applicant_accounts",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    guardianEmail: varchar("guardian_email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    sessionVersion: integer("session_version").default(0).notNull(),
    failedLoginCount: integer("failed_login_count").default(0).notNull(),
    lockedUntil: timestamp("locked_until"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionEmailUnique: uniqueIndex(
      "admission_applicant_accounts_inst_email_uidx",
    ).on(t.institutionId, sql`lower(${t.guardianEmail})`),
    identityTenantUnique: unique(
      "admission_applicant_accounts_id_inst_unique",
    ).on(t.id, t.institutionId),
  }),
);

export const admissionApplications = pgTable(
  "admission_applications",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    intakeInstitutionId: integer("intake_institution_id").notNull(),
    campusId: integer("campus_id"),
    campusName: varchar("campus_name", { length: 255 }).notNull(),
    cycleId: integer("cycle_id").notNull(),
    offeringId: integer("offering_id").notNull(),
    applicantId: integer("applicant_id"),
    applicationNumber: varchar("application_number", { length: 32 })
      .notNull()
      .unique(),
    studentName: varchar("student_name", { length: 255 }).notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    gender: genderEnum("gender").notNull(),
    guardianName: varchar("guardian_name", { length: 255 }).notNull(),
    guardianEmail: varchar("guardian_email", { length: 255 }).notNull(),
    guardianPhone: varchar("guardian_phone", { length: 50 }).notNull(),
    previousInstitution: varchar("previous_institution", { length: 255 }),
    previousClassMarks: varchar("previous_class_marks", { length: 100 }),
    medicalInformation: text("medical_information"),
    notes: text("notes"),
    status: admissionApplicationStatusEnum("status")
      .default("SUBMITTED")
      .notNull(),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    intakeInstitutionForeignKey: foreignKey({ columns: [t.intakeInstitutionId], foreignColumns: [institutions.id], name: "admission_applications_intake_fk" }).onDelete("restrict"),
    campusTenantForeignKey: foreignKey({ columns: [t.campusId, t.institutionId], foreignColumns: [campuses.id, campuses.institutionId], name: "admission_applications_campus_tenant_fk" }).onDelete("restrict"),
    intakeApplicantIndex: index("admission_applications_intake_applicant_idx").on(t.intakeInstitutionId, t.applicantId, t.submittedAt),
    identityTenantUnique: unique("admission_applications_id_inst_unique").on(
      t.id,
      t.institutionId,
    ),
    institutionStatusSubmittedIndex: index(
      "admission_applications_inst_status_submitted_idx",
    ).on(t.institutionId, t.status, t.submittedAt),
    institutionCycleSubmittedIndex: index(
      "admission_applications_inst_cycle_submitted_idx",
    ).on(t.institutionId, t.cycleId, t.submittedAt),
    institutionEmailIndex: index("admission_applications_inst_email_idx").on(
      t.institutionId,
      t.guardianEmail,
    ),
    applicantSubmittedIndex: index(
      "admission_applications_applicant_submitted_idx",
    ).on(t.applicantId, t.submittedAt),
    studentCycleUnique: uniqueIndex(
      "admission_applications_student_cycle_uidx",
    ).on(
      t.intakeInstitutionId,
      t.cycleId,
      sql`lower(${t.guardianEmail})`,
      sql`lower(${t.studentName})`,
    ),
    applicantTenantForeignKey: foreignKey({
      columns: [t.applicantId, t.intakeInstitutionId],
      foreignColumns: [
        admissionApplicantAccounts.id,
        admissionApplicantAccounts.institutionId,
      ],
      name: "admission_applications_applicant_tenant_fk",
    }).onDelete("restrict"),
    offeringTenantCycleForeignKey: foreignKey({
      columns: [t.offeringId, t.intakeInstitutionId, t.cycleId],
      foreignColumns: [
        admissionOfferings.id,
        admissionOfferings.institutionId,
        admissionOfferings.cycleId,
      ],
      name: "admission_applications_offering_tenant_cycle_fk",
    }).onDelete("restrict"),
  }),
);

export const admissionDocumentRequests = pgTable(
  "admission_document_requests",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").notNull(),
    documentName: varchar("document_name", { length: 160 }).notNull(),
    instructions: varchar("instructions", { length: 500 }),
    status: admissionDocumentStatusEnum("status")
      .default("REQUESTED")
      .notNull(),
    submittedFileKey: varchar("submitted_file_key", { length: 500 }),
    reviewerNote: varchar("reviewer_note", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    applicationStatusIndex: index(
      "admission_document_requests_app_status_idx",
    ).on(t.applicationId, t.status),
    applicationNameUnique: unique(
      "admission_document_requests_app_name_unique",
    ).on(t.applicationId, t.documentName),
    applicationTenantForeignKey: foreignKey({
      columns: [t.applicationId, t.institutionId],
      foreignColumns: [
        admissionApplications.id,
        admissionApplications.institutionId,
      ],
      name: "admission_document_requests_application_tenant_fk",
    }).onDelete("cascade"),
  }),
);

export const admissionAppointments = pgTable(
  "admission_appointments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").notNull(),
    type: admissionAppointmentTypeEnum("type").notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(),
    location: varchar("location", { length: 300 }).notNull(),
    instructions: varchar("instructions", { length: 1000 }),
    outcome: admissionAppointmentOutcomeEnum("outcome")
      .default("PENDING")
      .notNull(),
    outcomeNote: varchar("outcome_note", { length: 1000 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    applicationTypeUnique: unique(
      "admission_appointments_application_type_unique",
    ).on(t.applicationId, t.type),
    institutionScheduleIndex: index(
      "admission_appointments_inst_schedule_idx",
    ).on(t.institutionId, t.scheduledAt),
    applicationTenantForeignKey: foreignKey({
      columns: [t.applicationId, t.institutionId],
      foreignColumns: [
        admissionApplications.id,
        admissionApplications.institutionId,
      ],
      name: "admission_appointments_application_tenant_fk",
    }).onDelete("cascade"),
  }),
);

export const admissionApplicationEvents = pgTable(
  "admission_application_events",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: varchar("description", { length: 1000 }),
    fromStatus: admissionApplicationStatusEnum("from_status"),
    toStatus: admissionApplicationStatusEnum("to_status"),
    visibleToApplicant: boolean("visible_to_applicant").default(true).notNull(),
    actorId: integer("actor_id").notNull(),
    actorRole: roleEnum("actor_role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    applicationCreatedIndex: index(
      "admission_application_events_app_created_idx",
    ).on(t.applicationId, t.createdAt),
    applicationTenantForeignKey: foreignKey({
      columns: [t.applicationId, t.institutionId],
      foreignColumns: [
        admissionApplications.id,
        admissionApplications.institutionId,
      ],
      name: "admission_application_events_application_tenant_fk",
    }).onDelete("cascade"),
  }),
);

export const admissionFeePayments = pgTable(
  "admission_fee_payments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").notNull(),
    amount: integer("amount").notNull(),
    dueDate: date("due_date"),
    instructions: text("instructions").notNull(),
    bankName: varchar("bank_name", { length: 120 }),
    accountNumber: varchar("account_number", { length: 160 }),
    qrUrl: varchar("qr_url", { length: 500 }),
    paymentMethods: jsonb("payment_methods")
      .$type<
        Array<{
          id: string;
          providerName: string;
          accountTitle: string;
          accountNumber: string;
          qrUrl: string | null;
        }>
      >()
      .default([])
      .notNull(),
    payerSourceBank: varchar("payer_source_bank", { length: 120 }),
    paymentAccount: jsonb("payment_account").$type<import("@/lib/payment-account-types").PaymentAccount>(),
    payerReference: varchar("payer_reference", { length: 160 }),
    proofFileKey: varchar("proof_file_key", { length: 500 }),
    status: admissionFeePaymentStatusEnum("status")
      .default("PENDING")
      .notNull(),
    reviewerNote: varchar("reviewer_note", { length: 500 }),
    verifiedBy: integer("verified_by"),
    verifiedAt: timestamp("verified_at"),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    applicationUnique: unique("admission_fee_payments_application_unique").on(
      t.applicationId,
    ),
    institutionStatusIndex: index("admission_fee_payments_inst_status_idx").on(
      t.institutionId,
      t.status,
    ),
    applicationTenantForeignKey: foreignKey({
      columns: [t.applicationId, t.institutionId],
      foreignColumns: [
        admissionApplications.id,
        admissionApplications.institutionId,
      ],
      name: "admission_fee_payments_application_tenant_fk",
    }).onDelete("cascade"),
  }),
);

// --- ACCOUNT DELETIONS ---
export const accountDeletions = pgTable("account_deletions", {
  id: serial("id").primaryKey(),
  institutionName: varchar("institution_name", { length: 255 }).notNull(),
  adminEmail: varchar("admin_email", { length: 255 }).notNull(),
  reason: text("reason"),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

// --- ACADEMIC SESSIONS ---
export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(), // e.g. "2025-2026"
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionCurrentIndex: index(
      "academic_sessions_institution_current_idx",
    ).on(t.institutionId, t.isCurrent),
  }),
);

// --- INSTITUTION HOLIDAYS ---
export const institutionHolidays = pgTable(
  "institution_holidays",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: varchar("name", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionHolidayUnique: unique("institution_holiday_unique").on(
      t.institutionId,
      t.date,
    ),
  }),
);

// --- CAMPUSES ---
export const campuses = pgTable(
  "campuses",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    identityTenantUnique: uniqueIndex("campuses_id_inst_unique").on(t.id, t.institutionId),
    institutionIndex: index("campuses_institution_id_idx").on(t.institutionId),
  }),
);

// --- STAFF ---
export const institutionCustomRoles = pgTable(
  "institution_custom_roles",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    permissions: jsonb("permissions").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionNameUnique: unique(
      "institution_custom_roles_institution_name_unique",
    ).on(t.institutionId, t.name),
  }),
);

export const staff = pgTable(
  "staff",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    campusId: integer("campus_id").references(() => campuses.id, {
      onDelete: "set null",
    }),
    customRoleId: integer("custom_role_id").references(
      () => institutionCustomRoles.id,
      { onDelete: "set null" },
    ),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(), // generated slug email
    phone: varchar("phone", { length: 50 }),
    profilePictureUrl: varchar("profile_picture_url", { length: 255 }),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    expoPushToken: varchar("expo_push_token", { length: 255 }),
    announcementPushNotificationsEnabled: boolean(
      "announcement_push_notifications_enabled",
    )
      .default(true)
      .notNull(),
    courseStreamingProvider: streamingProviderEnum("course_streaming_provider"),
    courseStreamingCredentials: text("course_streaming_credentials"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    institutionIndex: index("staff_institution_id_idx").on(t.institutionId),
    lowerEmailIndex: index("staff_lower_email_idx").on(sql`lower(${t.email})`),
  }),
);

// --- SUBJECTS ---
export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    institutionIndex: index("subjects_institution_id_idx").on(t.institutionId),
  }),
);

// --- STAFF TEACHABLE SUBJECTS ---
export const staffTeachableSubjects = pgTable(
  "staff_teachable_subjects",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
  },
  (t) => ({
    institutionStaffIndex: index("staff_teachable_subjects_inst_staff_idx").on(
      t.institutionId,
      t.staffId,
    ),
  }),
);

// --- CLASSES ---
export const classes = pgTable(
  "classes",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    level: integer("level").default(0).notNull(), // for sorting
    isFinalClass: boolean("is_final_class").default(false).notNull(),
    isGraduatedArchive: boolean("is_graduated_archive")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    institutionIndex: index("classes_institution_id_idx").on(t.institutionId),
  }),
);

// --- SECTIONS ---
export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    classTeacherId: integer("class_teacher_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    institutionIndex: index("sections_institution_id_idx").on(t.institutionId),
    institutionClassIndex: index("sections_institution_class_id_idx").on(
      t.institutionId,
      t.classId,
    ),
  }),
);

// --- STUDENTS ---
export const students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    campusId: integer("campus_id").references(() => campuses.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    fatherName: varchar("father_name", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    gender: varchar("gender", { length: 10 }).default("MALE").notNull(),
    profilePictureUrl: varchar("profile_picture_url", { length: 255 }),
    loginRollNumber: varchar("login_roll_number", { length: 255 })
      .notNull()
      .unique(),
    passwordHash: text("password_hash").notNull(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    yearOfJoining: integer("year_of_joining").notNull(),
    admissionSequence: integer("admission_sequence"),
    academicStatus: studentAcademicStatusEnum("academic_status")
      .default("ACTIVE")
      .notNull(),
    classRollNumber: varchar("class_roll_number", { length: 100 }).notNull(),
    age: integer("age"),
    isActive: boolean("is_active").default(true).notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    expoPushToken: varchar("expo_push_token", { length: 255 }),
    testPushNotificationsEnabled: boolean("test_push_notifications_enabled")
      .default(true)
      .notNull(),
    announcementPushNotificationsEnabled: boolean(
      "announcement_push_notifications_enabled",
    )
      .default(true)
      .notNull(),
    emergencyContact: varchar("emergency_contact", { length: 50 }),
    parentalWhatsapp: varchar("parental_whatsapp", { length: 50 }),
    guardianEmail: varchar("guardian_email", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    instClassRollUnique: unique("inst_class_roll_unique").on(
      t.institutionId,
      t.classId,
      t.classRollNumber,
    ),
    identityTenantUnique: unique("students_id_institution_unique").on(
      t.id,
      t.institutionId,
    ),
    institutionIndex: index("students_institution_id_idx").on(t.institutionId),
    institutionSectionIndex: index("students_institution_section_id_idx").on(
      t.institutionId,
      t.sectionId,
    ),
    lowerLoginRollIndex: index("students_lower_login_roll_idx").on(
      sql`lower(${t.loginRollNumber})`,
    ),
    admissionSequenceUnique: unique(
      "students_institution_year_admission_sequence_unique",
    ).on(t.institutionId, t.yearOfJoining, t.admissionSequence),
    institutionGuardianEmailIndex: index(
      "students_institution_guardian_email_idx",
    ).on(t.institutionId, t.guardianEmail),
  }),
);

// Parent identity is tenant-scoped. One normalized email represents one parent
// account inside an institution and may be linked to several sibling students.
export const parentAccounts = pgTable(
  "parent_accounts",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    passwordHash: text("password_hash"),
    status: parentAccountStatusEnum("status")
      .default("PENDING_ACTIVATION")
      .notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    sessionVersion: integer("session_version").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    institutionEmailUnique: unique(
      "parent_accounts_institution_email_unique",
    ).on(t.institutionId, t.email),
    identityTenantUnique: unique("parent_accounts_id_institution_unique").on(
      t.id,
      t.institutionId,
    ),
    institutionIndex: index("parent_accounts_institution_id_idx").on(
      t.institutionId,
    ),
  }),
);

export const parentStudents = pgTable(
  "parent_students",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    parentId: integer("parent_id")
      .notNull()
      .references(() => parentAccounts.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 50 })
      .default("GUARDIAN")
      .notNull(),
    linkedById: integer("linked_by_id").notNull(),
    linkedByRole: roleEnum("linked_by_role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStudentUnique: unique(
      "parent_students_institution_student_unique",
    ).on(t.institutionId, t.studentId),
    parentStudentUnique: unique("parent_students_parent_student_unique").on(
      t.parentId,
      t.studentId,
    ),
    parentIndex: index("parent_students_parent_id_idx").on(t.parentId),
    studentIndex: index("parent_students_student_id_idx").on(t.studentId),
    parentTenantForeignKey: foreignKey({
      columns: [t.parentId, t.institutionId],
      foreignColumns: [parentAccounts.id, parentAccounts.institutionId],
      name: "parent_students_parent_tenant_fk",
    }).onDelete("cascade"),
    studentTenantForeignKey: foreignKey({
      columns: [t.studentId, t.institutionId],
      foreignColumns: [students.id, students.institutionId],
      name: "parent_students_student_tenant_fk",
    }).onDelete("cascade"),
  }),
);

export const admissionEnrollments = pgTable(
  "admission_enrollments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").notNull(),
    studentId: integer("student_id").notNull(),
    enrolledBy: integer("enrolled_by").notNull(),
    credentialsIssuedAt: timestamp("credentials_issued_at")
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    applicationUnique: unique("admission_enrollments_application_unique").on(
      t.applicationId,
    ),
    studentUnique: unique("admission_enrollments_student_unique").on(
      t.studentId,
    ),
    applicationTenantForeignKey: foreignKey({
      columns: [t.applicationId, t.institutionId],
      foreignColumns: [
        admissionApplications.id,
        admissionApplications.institutionId,
      ],
      name: "admission_enrollments_application_tenant_fk",
    }).onDelete("restrict"),
    studentTenantForeignKey: foreignKey({
      columns: [t.studentId, t.institutionId],
      foreignColumns: [students.id, students.institutionId],
      name: "admission_enrollments_student_tenant_fk",
    }).onDelete("restrict"),
  }),
);

export const studentAdmissionCounters = pgTable(
  "student_admission_counters",
  {
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    admissionYear: integer("admission_year").notNull(),
    nextSequence: integer("next_sequence").notNull().default(1),
  },
  (t) => ({
    primaryKey: primaryKey({ columns: [t.institutionId, t.admissionYear] }),
  }),
);

// --- INSTITUTION GRADING & PROMOTION ---
export const gradingScales = pgTable("grading_scales", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" })
    .unique(),
  passingPercentage: real("passing_percentage").notNull(),
  gradesJson: jsonb("grades_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const studentPromotions = pgTable(
  "student_promotions",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    fromClassId: integer("from_class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    toClassId: integer("to_class_id").references(() => classes.id, {
      onDelete: "set null",
    }),
    status: promotionStatusEnum("status").notNull(),
    fromRollNumber: varchar("from_roll_number", { length: 100 }),
    toRollNumber: varchar("to_roll_number", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStudentIndex: index(
      "student_promotions_institution_student_idx",
    ).on(t.institutionId, t.studentId),
  }),
);

// --- STUDENT PROFILE CHANGE REQUESTS ---
export const studentProfileChangeRequests = pgTable(
  "student_profile_change_requests",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    requestedFields: jsonb("requested_fields").notNull(),
    reason: text("reason").notNull(),
    status: profileRequestStatusEnum("status").default("PENDING").notNull(),
    reviewedBy: integer("reviewed_by").references(() => institutions.id, {
      onDelete: "set null",
    }),
    reviewedByInstitutionAdmin: integer("reviewed_by_institution_admin").references(() => institutionAdmins.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStatusIndex: index(
      "student_profile_requests_inst_status_idx",
    ).on(t.institutionId, t.status),
    studentIndex: index("student_profile_requests_student_idx").on(t.studentId),
  }),
);

// --- STAFF PROFILE CHANGE REQUESTS ---
export const staffProfileChangeRequests = pgTable(
  "staff_profile_change_requests",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    requestedFields: jsonb("requested_fields").notNull(),
    reason: text("reason").notNull(),
    status: profileRequestStatusEnum("status").default("PENDING").notNull(),
    reviewedBy: integer("reviewed_by").references(() => institutions.id, {
      onDelete: "set null",
    }),
    reviewedByInstitutionAdmin: integer("reviewed_by_institution_admin").references(() => institutionAdmins.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStatusIndex: index("staff_profile_requests_inst_status_idx").on(
      t.institutionId,
      t.status,
    ),
    staffIndex: index("staff_profile_requests_staff_idx").on(t.staffId),
  }),
);

// --- LEGACY SECTION GROUPS (retained for existing timetable data) ---
export const sectionGroups = pgTable(
  "section_groups",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionSectionIndex: index("section_groups_institution_section_idx").on(
      t.institutionId,
      t.sectionId,
    ),
  }),
);

// --- STAFF ASSIGNMENTS (TIMETABLE) ---
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    staffId: integer("staff_id").references(() => staff.id, {
      onDelete: "cascade",
    }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id").references(() => subjects.id, {
      onDelete: "cascade",
    }),
    // null = whole-section period (simple timetable); set = elective sub-group period
    groupId: integer("group_id").references(() => sectionGroups.id),
    isBreak: boolean("is_break").default(false).notNull(),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday, 1 = Monday, etc.
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => ({
    // Unchanged: a teacher cannot occupy two slots at the same start time.
    staffTimeSlotUnique: unique("staff_time_slot_unique").on(
      t.institutionId,
      t.staffId,
      t.dayOfWeek,
      t.startTime,
    ),
    // COALESCE so null groupId rows keep one-slot-per-section semantics;
    // different groupIds may share the same section+day+start_time.
    sectionTimeSlotUnique: uniqueIndex("section_time_slot_unique").on(
      t.institutionId,
      t.sectionId,
      sql`COALESCE(${t.groupId}, 0)`,
      t.dayOfWeek,
      t.startTime,
    ),
    institutionStaffIndex: index("staff_assignments_institution_staff_idx").on(
      t.institutionId,
      t.staffId,
    ),
    institutionSectionIndex: index(
      "staff_assignments_institution_section_idx",
    ).on(t.institutionId, t.sectionId),
  }),
);

// --- ASSIGNMENTS ---
export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").references(() => sections.id, {
      onDelete: "cascade",
    }),
    subjectId: integer("subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    referenceFileUrl: text("reference_file_url"),
    referenceFileName: varchar("reference_file_name", { length: 255 }),
    dueAt: timestamp("due_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStaffCreatedIndex: index(
      "assignments_institution_staff_created_idx",
    ).on(t.institutionId, t.staffId, t.createdAt),
    institutionSectionIndex: index("assignments_institution_section_idx").on(
      t.institutionId,
      t.sectionId,
    ),
  }),
);

// --- ATTENDANCES ---
export const attendances = pgTable(
  "attendances",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    studentDateUnique: unique("student_date_unique").on(t.studentId, t.date),
    institutionDateIndex: index("attendances_institution_date_idx").on(
      t.institutionId,
      t.date,
    ),
    institutionSectionDateIndex: index(
      "attendances_institution_section_date_idx",
    ).on(t.institutionId, t.sectionId, t.date),
  }),
);

// --- TESTS ---
export const tests = pgTable(
  "tests",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").references(() => sections.id, {
      onDelete: "cascade",
    }),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    staffId: integer("staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdByRole: testCreatorRoleEnum("created_by_role").notNull(),
    type: testTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    maxMarks: real("max_marks").notNull(),
    date: date("date").notNull(),
    endDate: date("end_date"),
    resultsPublishedAt: timestamp("results_published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionIndex: index("tests_institution_id_idx").on(t.institutionId),
    institutionClassIndex: index("tests_institution_class_id_idx").on(
      t.institutionId,
      t.classId,
    ),
    institutionSectionIndex: index("tests_institution_section_id_idx").on(
      t.institutionId,
      t.sectionId,
    ),
    institutionDateIndex: index("tests_institution_date_idx").on(
      t.institutionId,
      t.date,
    ),
    institutionClassSubjectDateIndex: index(
      "tests_institution_class_subject_date_idx",
    ).on(t.institutionId, t.classId, t.subjectId, t.date),
  }),
);

// --- MARKS ---
export const marks = pgTable(
  "marks",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    testId: integer("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    marksObtained: real("marks_obtained").notNull(),
    totalMarks: real("total_marks").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    studentTestUnique: unique("student_test_unique").on(t.testId, t.studentId),
    institutionStudentCreatedIndex: index(
      "marks_institution_student_created_idx",
    ).on(t.institutionId, t.studentId, t.createdAt),
    institutionTestIndex: index("marks_institution_test_id_idx").on(
      t.institutionId,
      t.testId,
    ),
  }),
);

// --- ONLINE TESTS ---
export const onlineTests = pgTable(
  "online_tests",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    testId: integer("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" })
      .unique(),
    mode: onlineTestModeEnum("mode").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // The student test list (api/student/tests) drives off this table filtered by
    // institution_id and ordered by created_at DESC, id DESC. With only the unique
    // index on test_id, that was a sequential scan plus a sort on every request.
    // The column order matches the query so Postgres can walk this index backwards
    // and stop at the page limit. Ascending is deliberate: a backward scan serves
    // an all-DESC ORDER BY, so no explicit DESC is needed.
    institutionCreatedIndex: index("online_tests_institution_created_idx").on(
      t.institutionId,
      t.createdAt,
      t.id,
    ),
  }),
);

export const onlineTestQuestions = pgTable(
  "online_test_questions",
  {
    id: serial("id").primaryKey(),
    onlineTestId: integer("online_test_id")
      .notNull()
      .references(() => onlineTests.id, { onDelete: "cascade" }),
    questionType: onlineQuestionTypeEnum("question_type").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options"),
    correctOptionIndex: integer("correct_option_index"),
    marks: real("marks").notNull(),
    orderIndex: integer("order_index").notNull(),
  },
  (t) => ({
    onlineTestIndex: index("online_test_questions_online_test_id_idx").on(
      t.onlineTestId,
    ),
  }),
);

export const onlineTestSubmissions = pgTable(
  "online_test_submissions",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    onlineTestId: integer("online_test_id")
      .notNull()
      .references(() => onlineTests.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: onlineSubmissionStatusEnum("status").notNull(),
    answers: jsonb("answers").notNull(),
    mcqScore: real("mcq_score").default(0).notNull(),
    shortScore: real("short_score"),
    totalScore: real("total_score").default(0).notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    violationReason: varchar("violation_reason", { length: 50 }),
    submittedAt: timestamp("submitted_at"),
    gradedAt: timestamp("graded_at"),
    gradedBy: integer("graded_by").references(() => staff.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    studentOnlineTestUnique: unique("student_online_test_unique").on(
      t.onlineTestId,
      t.studentId,
    ),
    institutionStudentIndex: index(
      "online_test_submissions_institution_student_idx",
    ).on(t.institutionId, t.studentId),
    institutionStatusHeartbeatIndex: index(
      "online_test_submissions_institution_status_heartbeat_idx",
    ).on(t.institutionId, t.status, t.lastHeartbeatAt),
  }),
);

// --- ANNOUNCEMENTS ---
export const announcements = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    senderRole: roleEnum("sender_role").notNull(),
    senderId: integer("sender_id").notNull(), // maps to ID of sender in their role table
    targetType: announcementTargetEnum("target_type").notNull(),
    targetCampusId: integer("target_campus_id").references(() => campuses.id, {
      onDelete: "cascade",
    }),
    targetClassId: integer("target_class_id").references(() => classes.id, {
      onDelete: "cascade",
    }),
    targetSectionId: integer("target_section_id").references(
      () => sections.id,
      { onDelete: "cascade" },
    ),
    targetUserRole: roleEnum("target_user_role"),
    targetUserId: integer("target_user_id"),
    automationKey: varchar("automation_key", { length: 255 }).unique(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionCreatedIndex: index("announcements_institution_created_idx").on(
      t.institutionId,
      t.createdAt,
    ),
  }),
);

// --- ANNOUNCEMENT READS ---
export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userRole: roleEnum("user_role").notNull(),
    userId: integer("user_id").notNull(),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (t) => ({
    userAnnouncementUnique: unique("user_announcement_unique").on(
      t.announcementId,
      t.userRole,
      t.userId,
    ),
    userIndex: index("announcement_reads_user_idx").on(
      t.userRole,
      t.userId,
      t.announcementId,
    ),
  }),
);

// --- NOTIFICATIONS ---
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    userRole: roleEnum("user_role").notNull(),
    userId: integer("user_id").notNull(),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    referenceId: integer("reference_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionUserCreatedIndex: index(
      "notifications_institution_user_created_idx",
    ).on(t.institutionId, t.userRole, t.userId, t.createdAt),
    institutionUserUnreadIndex: index(
      "notifications_institution_user_unread_idx",
    ).on(t.institutionId, t.userRole, t.userId, t.isRead, t.createdAt),
  }),
);

// --- EXPO PUSH TICKETS ---
export const expoPushTickets = pgTable(
  "expo_push_tickets",
  {
    id: serial("id").primaryKey(),
    ticketId: varchar("ticket_id", { length: 255 }).notNull().unique(),
    token: varchar("token", { length: 255 }).notNull(),
    userRole: roleEnum("user_role").notNull(),
    userId: integer("user_id").notNull(),
    notificationId: integer("notification_id").references(
      () => notifications.id,
      { onDelete: "set null" },
    ),
    status: varchar("status", { length: 50 }).default("PENDING").notNull(),
    error: text("error"),
    checkedAt: timestamp("checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    statusCreatedAtIndex: index("expo_push_tickets_status_created_at_idx").on(
      t.status,
      t.createdAt,
    ),
  }),
);

// --- SUBMISSIONS ---
export const submissions = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    fileKey: varchar("file_key", { length: 255 }).notNull(),
    fileUrl: text("file_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    studentAssignmentUnique: unique("student_assignment_unique").on(
      t.assignmentId,
      t.studentId,
    ),
    institutionStudentIndex: index("submissions_institution_student_idx").on(
      t.institutionId,
      t.studentId,
    ),
  }),
);

// --- AUDIT LOGS ---
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id"), // null for super admin actions outside institution
    actorId: integer("actor_id").notNull(),
    actorRole: roleEnum("actor_role").notNull(),
    action: varchar("action", { length: 255 }).notNull(),
    target: varchar("target", { length: 255 }).notNull(),
    ip: varchar("ip", { length: 50 }),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (t) => ({
    timestampIndex: index("audit_logs_timestamp_idx").on(t.timestamp),
  }),
);

// --- REFRESH TOKENS ---
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: serial("id").primaryKey(),
    userRole: roleEnum("user_role").notNull(),
    userId: integer("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    replacedByHash: text("replaced_by_hash"),
    reuseDetectedAt: timestamp("reuse_detected_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIndex: index("refresh_tokens_user_idx").on(t.userRole, t.userId),
    activeUserIndex: index("refresh_tokens_active_user_idx")
      .on(t.userRole, t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
    // Serves the hourly prune in lib/token-maintenance.ts. Without it, the
    // `expires_at < cutoff` scan reads the whole table every hour; with it the
    // delete touches only the rows it removes. One extra btree insert per login is
    // far cheaper than an hourly sequential scan of a table that only grows.
    expiresAtIndex: index("refresh_tokens_expires_at_idx").on(t.expiresAt),
  }),
);

// --- ACCOUNT LOCKOUTS ---
export const accountLockouts = pgTable(
  "account_lockouts",
  {
    id: serial("id").primaryKey(),
    userRole: roleEnum("user_role").notNull(),
    userId: integer("user_id").notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at").defaultNow().notNull(),
    lockedUntil: timestamp("locked_until"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountLockoutUserUnique: unique("account_lockout_user_unique").on(
      t.userRole,
      t.userId,
    ),
  }),
);

// --- PASSWORD RESETS ---
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").references(() => institutions.id, {
    onDelete: "cascade",
  }),
  userRole: roleEnum("user_role").notNull(), // Usually INSTITUTION admin for email reset
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- FEE VOUCHERS ---
export const feeVouchers = pgTable(
  "fee_vouchers",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .references(() => institutions.id, { onDelete: "cascade" })
      .notNull(),
    studentId: integer("student_id")
      .references(() => students.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    imageUrl: varchar("image_url", { length: 500 }).notNull(),
    billingMonth: varchar("billing_month", { length: 7 }),
    lateFeeAmount: integer("late_fee_amount").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    studentCreatedIdx: index("fee_vouchers_student_created_idx").on(
      t.studentId,
      t.createdAt,
    ),
    institutionCreatedIdx: index("fee_vouchers_institution_created_idx").on(
      t.institutionId,
      t.createdAt,
    ),
    institutionStudentMonthUnique: unique(
      "fee_vouchers_institution_student_month_unique",
    ).on(t.institutionId, t.studentId, t.billingMonth),
  }),
);

export const feeVoucherCycles = pgTable(
  "fee_voucher_cycles",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .references(() => institutions.id, { onDelete: "cascade" })
      .notNull(),
    studentId: integer("student_id")
      .references(() => students.id, { onDelete: "cascade" })
      .notNull(),
    billingMonth: varchar("billing_month", { length: 7 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<"DUE" | "LATE" | "SUBMITTED">()
      .default("DUE")
      .notNull(),
    lateFeeAmount: integer("late_fee_amount").default(0).notNull(),
    voucherId: integer("voucher_id").references(() => feeVouchers.id, {
      onDelete: "set null",
    }),
    lateMarkedAt: timestamp("late_marked_at"),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStudentMonthUnique: unique(
      "fee_voucher_cycles_institution_student_month_unique",
    ).on(t.institutionId, t.studentId, t.billingMonth),
    institutionMonthStatusIndex: index(
      "fee_voucher_cycles_institution_month_status_idx",
    ).on(t.institutionId, t.billingMonth, t.status),
    voucherUnique: unique("fee_voucher_cycles_voucher_unique").on(t.voucherId),
  }),
);

// --- FEE MANAGEMENT ---
// Amounts are stored as whole PKR to avoid floating-point rounding in receipts.
export const feeHeads = pgTable(
  "fee_heads",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 20 })
      .$type<"RECURRING" | "ONE_TIME">()
      .default("RECURRING")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionNameUnique: unique("fee_heads_institution_name_unique").on(
      t.institutionId,
      t.name,
    ),
    institutionActiveIdx: index("fee_heads_institution_active_idx").on(
      t.institutionId,
      t.isActive,
    ),
  }),
);

export const classFeeItems = pgTable(
  "class_fee_items",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    feeHeadId: integer("fee_head_id")
      .notNull()
      .references(() => feeHeads.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    classHeadUnique: unique("class_fee_items_class_head_unique").on(
      t.institutionId,
      t.classId,
      t.feeHeadId,
    ),
    institutionClassIdx: index("class_fee_items_institution_class_idx").on(
      t.institutionId,
      t.classId,
    ),
  }),
);

export const studentFeeAdjustments = pgTable(
  "student_fee_adjustments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    type: varchar("type", { length: 20 })
      .$type<"DISCOUNT" | "CHARGE">()
      .notNull(),
    amount: integer("amount").notNull(),
    frequency: varchar("frequency", { length: 20 }).$type<"ONCE" | "RECURRING">().default("RECURRING").notNull(),
    startMonth: varchar("start_month", { length: 7 }),
    endMonth: varchar("end_month", { length: 7 }),
    consumedInvoiceId: integer("consumed_invoice_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStudentIdx: index(
      "student_fee_adjustments_institution_student_idx",
    ).on(t.institutionId, t.studentId, t.isActive),
  }),
);

export const feeBillingBatches = pgTable("fee_billing_batches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  institutionId: integer("institution_id").notNull().references(() => institutions.id),
  label: varchar("label", { length: 120 }).notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const feeInvoices = pgTable(
  "fee_invoices",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    billingMonth: varchar("billing_month", { length: 7 }).notNull(),
    billingKey: varchar("billing_key", { length: 36 }).default("MONTHLY").notNull(),
    billingKind: varchar("billing_kind", { length: 20 }).$type<"MONTHLY" | "ONE_TIME">().default("MONTHLY").notNull(),
    billingLabel: varchar("billing_label", { length: 120 }),
    classIdAtIssue: integer("class_id_at_issue"),
    classNameAtIssue: varchar("class_name_at_issue", { length: 255 }),
    sectionIdAtIssue: integer("section_id_at_issue"),
    sectionNameAtIssue: varchar("section_name_at_issue", { length: 255 }),
    dueDate: date("due_date").notNull(),
    status: varchar("status", { length: 20 })
      .$type<"DUE" | "PARTIAL" | "PAID" | "VOID">()
      .default("DUE")
      .notNull(),
    subtotal: integer("subtotal").notNull(),
    discountAmount: integer("discount_amount").default(0).notNull(),
    additionalAmount: integer("additional_amount").default(0).notNull(),
    lateFeeAmount: integer("late_fee_amount").default(0).notNull(),
    totalAmount: integer("total_amount").notNull(),
    paidAmount: integer("paid_amount").default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStudentMonthUnique: unique(
      "fee_invoices_institution_student_billing_unique",
    ).on(t.institutionId, t.studentId, t.billingMonth, t.billingKey),
    institutionMonthStatusIdx: index(
      "fee_invoices_institution_month_status_idx",
    ).on(t.institutionId, t.billingMonth, t.status),
    studentCreatedIdx: index("fee_invoices_student_created_idx").on(
      t.studentId,
      t.createdAt,
    ),
  }),
);

export const feeInvoiceItems = pgTable(
  "fee_invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "cascade" }),
    feeHeadId: integer("fee_head_id").references(() => feeHeads.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 120 }).notNull(),
    type: varchar("type", { length: 20 })
      .$type<"FEE" | "DISCOUNT" | "CHARGE" | "LATE_FEE">()
      .notNull(),
    amount: integer("amount").notNull(),
  },
  (t) => ({
    invoiceIdx: index("fee_invoice_items_invoice_idx").on(t.invoiceId),
  }),
);

export const feePayments = pgTable(
  "fee_payments",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    receiptNumber: varchar("receipt_number", { length: 50 }).notNull(),
    amount: integer("amount").notNull(),
    method: varchar("method", { length: 30 })
      .$type<"CASH" | "BANK" | "EASYPAISA" | "JAZZCASH" | "HBL_PAY" | "OTHER">()
      .notNull(),
    reference: varchar("reference", { length: 120 }),
    notes: text("notes"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    recordedBy: integer("recorded_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionReceiptUnique: unique(
      "fee_payments_institution_receipt_unique",
    ).on(t.institutionId, t.receiptNumber),
    invoiceCreatedIdx: index("fee_payments_invoice_created_idx").on(
      t.invoiceId,
      t.createdAt,
    ),
    institutionReceivedIdx: index("fee_payments_institution_received_idx").on(
      t.institutionId,
      t.receivedAt,
    ),
  }),
);

export const institutionPaymentGateways = pgTable("institution_payment_gateways", {
  institutionId: integer("institution_id").primaryKey().references(() => institutions.id, { onDelete: "cascade" }),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gatewayPaymentAttempts = pgTable("gateway_payment_attempts", {
  id: varchar("id", { length: 20 }).primaryKey(),
  institutionId: integer("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  invoiceId: integer("invoice_id").references(() => feeInvoices.id, { onDelete: "restrict" }),
  applicationId: integer("application_id").references(() => admissionApplications.id, { onDelete: "restrict" }),
  gateway: varchar("gateway", { length: 20 }).$type<"easypaisa" | "jazzcash" | "hblpay">().notNull(),
  environment: varchar("environment", { length: 20 }).$type<"sandbox" | "production">().notNull(),
  merchantId: varchar("merchant_id", { length: 160 }).notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("PKR"),
  status: varchar("status", { length: 20 }).$type<"PENDING" | "PAID" | "REVIEW">().notNull().default("PENDING"),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  returnUrl: text("return_url").notNull(),
  institutionName: text("institution_name").notNull(),
  payerName: text("payer_name").notNull(),
  description: text("description").notNull(),
  receiptNumber: varchar("receipt_number", { length: 50 }).unique(),
  providerReference: varchar("provider_reference", { length: 160 }),
  providerResponseCode: varchar("provider_response_code", { length: 20 }),
  evidenceDigest: varchar("evidence_digest", { length: 64 }),
  qrImage: text("qr_image"),
  lastCheckedAt: timestamp("last_checked_at"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => ({
  invoiceIdx: index("gateway_attempts_invoice_idx").on(t.institutionId, t.invoiceId, t.createdAt),
  applicationIdx: index("gateway_attempts_application_idx").on(t.institutionId, t.applicationId, t.createdAt),
  statusIdx: index("gateway_attempts_status_idx").on(t.institutionId, t.status, t.createdAt),
}));

export const feePaymentSubmissions = pgTable(
  "fee_payment_submissions",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    sourceBankName: varchar("source_bank_name", { length: 120 }).notNull(),
    transactionId: varchar("transaction_id", { length: 160 }).notNull(),
    paymentAccount: jsonb("payment_account").$type<import("@/lib/payment-account-types").PaymentAccount>(),
    submittedByRole: varchar("submitted_by_role", { length: 20 }),
    submittedById: integer("submitted_by_id"),
    proofFileKey: varchar("proof_file_key", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<"SUBMITTED" | "VERIFIED" | "REJECTED">()
      .default("SUBMITTED")
      .notNull(),
    reviewerNote: varchar("reviewer_note", { length: 500 }),
    verifiedBy: integer("verified_by"),
    verifiedAt: timestamp("verified_at"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    invoiceStatusIdx: index("fee_payment_submissions_invoice_status_idx").on(
      t.invoiceId,
      t.status,
    ),
    institutionStatusSubmittedIdx: index(
      "fee_payment_submissions_inst_status_submitted_idx",
    ).on(t.institutionId, t.status, t.submittedAt),
    onePendingPerInvoice: uniqueIndex(
      "fee_payment_submissions_one_pending_invoice_uidx",
    )
      .on(t.invoiceId)
      .where(sql`${t.status} = 'SUBMITTED'`),
  }),
);

// --- PLATFORM REVIEWS ---
export const admissionFeeProofs = pgTable("admission_fee_proofs", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
  applicationId: integer("application_id").notNull().references(() => admissionApplications.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").notNull().references(() => admissionFeePayments.id, { onDelete: "cascade" }),
  paymentAccount: jsonb("payment_account").$type<import("@/lib/payment-account-types").PaymentAccount>(),
  sourceBankName: varchar("source_bank_name", { length: 120 }).notNull(),
  transactionId: varchar("transaction_id", { length: 160 }).notNull(),
  proofFileKey: varchar("proof_file_key", { length: 500 }).notNull(),
  status: varchar("status", { length: 20 }).$type<"SUBMITTED" | "VERIFIED" | "REJECTED">().default("SUBMITTED").notNull(),
  reviewerNote: varchar("reviewer_note", { length: 500 }),
  verifiedBy: integer("verified_by"),
  verifiedAt: timestamp("verified_at"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, t => ({ applicationIdx: index("admission_fee_proofs_application_idx").on(t.institutionId, t.applicationId, t.submittedAt) }));

export const platformReviews = pgTable("platform_reviews", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" })
    .unique(),
  rating: integer("rating").notNull(), // 1 to 5
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- PLATFORM PAGES (FOOTER) ---
export const platformPages = pgTable("platform_pages", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(), // e.g. 'about-us'
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  lastEditedAt: timestamp("last_edited_at").defaultNow().notNull(),
  lastEditedBy: integer("last_edited_by"), // Generic user ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- FEATURED INSTITUTIONS (HOMEPAGE LOGOS) ---
export const featuredInstitutions = pgTable("featured_institutions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  logoKey: varchar("logo_key", { length: 255 }), // Cloudinary public_id or URL (optional)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- BATCH EXAMS (TRANSCRIPTS) ---
export const batchExams = pgTable(
  "batch_exams",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").references(() => sections.id, {
      onDelete: "cascade",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    type: testTypeEnum("type").default("FINAL").notNull(),
    officialPublishedAt: timestamp("official_published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionClassIndex: index("batch_exams_institution_class_idx").on(
      t.institutionId,
      t.classId,
    ),
  }),
);

export const batchExamSubjects = pgTable(
  "batch_exam_subjects",
  {
    id: serial("id").primaryKey(),
    batchExamId: integer("batch_exam_id")
      .notNull()
      .references(() => batchExams.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    maxMarks: real("max_marks").notNull(),
    staffId: integer("staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at"),
    reviewDeadline: timestamp("review_deadline").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    batchExamIndex: index("batch_exam_subjects_batch_exam_id_idx").on(
      t.batchExamId,
    ),
    staffIndex: index("batch_exam_subjects_staff_id_idx").on(t.staffId),
  }),
);

export const batchExamResults = pgTable(
  "batch_exam_results",
  {
    id: serial("id").primaryKey(),
    batchExamSubjectId: integer("batch_exam_subject_id")
      .notNull()
      .references(() => batchExamSubjects.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    marksObtained: real("marks_obtained").notNull(),
    isEdited: boolean("is_edited").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    studentBatchResultUnique: unique("student_batch_result_unique").on(
      t.batchExamSubjectId,
      t.studentId,
    ),
    studentIndex: index("batch_exam_results_student_id_idx").on(t.studentId),
  }),
);

// --- LEAVE REQUESTS ---
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    userRole: roleEnum("user_role").notNull(), // STUDENT or STAFF
    userId: integer("user_id").notNull(),
    reason: text("reason").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    parentPhone: varchar("parent_phone", { length: 50 }), // for students
    status: leaveRequestStatusEnum("status").default("PENDING").notNull(),
    reviewedBy: integer("reviewed_by"), // staff.id or institutions.id depending on who approved it
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    instRoleUserIndex: index("leave_requests_inst_role_user_idx").on(
      t.institutionId,
      t.userRole,
      t.userId,
    ),
    // Institution/staff/student leave request lists all filter on
    // (institution_id, user_role, status = 'PENDING') and sort by created_at desc.
    instRoleStatusIndex: index("leave_requests_inst_role_status_idx").on(
      t.institutionId,
      t.userRole,
      t.status,
      t.createdAt,
    ),
  }),
);

// --- STAFF ATTENDANCES ---
export const staffAttendances = pgTable(
  "staff_attendances",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    staffDateUnique: unique("staff_date_unique").on(t.staffId, t.date),
    institutionDateIndex: index("staff_attendances_inst_date_idx").on(
      t.institutionId,
      t.date,
    ),
  }),
);

// --- SYSTEM SETTINGS ---
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  mobileAppVersion: varchar("mobile_app_version", { length: 50 })
    .notNull()
    .default("1.0.0"),
  softwareVersion: varchar("software_version", { length: 50 })
    .notNull()
    .default("1.0.0"),
  publicSiteBaseDomain: varchar("public_site_base_domain", { length: 253 })
    .notNull()
    .default("nisaab360.app"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- INSTITUTION OWNERS ---
export const institutionOwners = pgTable("institution_owners", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" })
    .unique(),
  name: varchar("name", { length: 255 }).notNull(),
  gender: genderEnum("gender").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  contactNumber: varchar("contact_number", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- INSTITUTION ADMINS ---
export const institutionAdmins = pgTable(
  "institution_admins",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // See super_admins_lower_email_idx.
    lowerEmailIndex: index("institution_admins_lower_email_idx").on(
      sql`lower(${t.email})`,
    ),
  }),
);

// --- TICKETS ---
export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    creatorRole: roleEnum("creator_role").notNull(),
    creatorId: integer("creator_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").default("OPEN").notNull(),
    platformStatus: ticketPlatformStatusEnum("platform_status"),
    isForwarded: boolean("is_forwarded").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    institutionStatusCreatedIndex: index(
      "tickets_institution_status_created_idx",
    ).on(t.institutionId, t.status, t.createdAt),
    forwardedCreatedIndex: index("tickets_forwarded_created_idx").on(
      t.isForwarded,
      t.createdAt,
    ),
  }),
);

// --- TICKET HISTORY ---
export const ticketHistory = pgTable(
  "ticket_history",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actorRole: roleEnum("actor_role").notNull(),
    actorId: integer("actor_id").notNull(),
    action: ticketHistoryActionEnum("action").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    ticketIndex: index("ticket_history_ticket_id_idx").on(t.ticketId),
  }),
);

// --- BLOGS ---
export const blogs = pgTable("blogs", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  excerpt: text("excerpt"),
  status: blogStatusEnum("status").default("DRAFT").notNull(),
  publishedAt: timestamp("published_at"),
  authorRole: roleEnum("author_role").notNull(),
  authorId: integer("author_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- DIARIES ---
export const diaries = pgTable(
  "diaries",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id").references(() => subjects.id, {
      onDelete: "cascade",
    }),
    date: date("date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    classSubjectDateUnique: uniqueIndex(
      "diaries_class_subject_date_not_null_uidx",
    )
      .on(t.classId, t.subjectId, t.date)
      .where(sql`${t.subjectId} is not null`),
    institutionClassDateIndex: index("diaries_institution_class_date_idx").on(
      t.institutionId,
      t.classId,
      t.date,
    ),
  }),
);

// --- INSTITUTION BACKUPS ---
export const institutionBackups = pgTable(
  "institution_backups",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    backupType: varchar("backup_type", { length: 16 })
      .$type<"DAILY" | "MONTHLY" | "MANUAL" | "EXPORT">()
      .notNull(),
    periodKey: varchar("period_key", { length: 40 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<"PENDING" | "RUNNING" | "COMPLETED" | "FAILED">()
      .notNull()
      .default("PENDING"),
    objectKey: text("object_key"),
    fileSize: bigint("file_size", { mode: "number" }),
    sha256: varchar("sha256", { length: 64 }),
    recordCount: integer("record_count"),
    tableCount: integer("table_count"),
    requestedBy: integer("requested_by").references(() => superAdmins.id, {
      onDelete: "set null",
    }),
    requestedByEmployee: integer("requested_by_employee").references(() => employees.id, { onDelete: "set null" }),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    institutionCreatedIndex: index(
      "institution_backups_institution_created_idx",
    ).on(t.institutionId, t.createdAt),
    periodUnique: unique("institution_backups_period_unique").on(
      t.institutionId,
      t.backupType,
      t.periodKey,
    ),
  }),
);

// One current customer-owned Google Drive backup per institution. This is
// configuration/remote-file metadata only; PostgreSQL disaster-recovery
// backups are handled separately by the postgres-backup container.
export const institutionGoogleDriveBackups = pgTable(
  "institution_google_drive_backups",
  {
    institutionId: integer("institution_id")
      .primaryKey()
      .references(() => institutions.id, { onDelete: "cascade" }),
    credentialsEncrypted: text("credentials_encrypted"),
    folderId: varchar("folder_id", { length: 255 }),
    folderName: varchar("folder_name", { length: 255 }),
    backupFileId: varchar("backup_file_id", { length: 255 }),
    backupFileName: varchar("backup_file_name", { length: 255 }),
    archivePasswordEncrypted: text("archive_password_encrypted"),
    lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),
    lastBackupError: text("last_backup_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    backupFileIndex: index("institution_google_drive_backups_file_idx").on(t.backupFileId),
  }),
);

// --- DURABLE EMAIL DELIVERY ---
export const emailOutbox = pgTable("email_outbox", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  html: text("html").notNull(),
  dedupeKey: varchar("dedupe_key", { length: 255 }).unique(),
  status: varchar("status", { length: 16 }).$type<"PENDING" | "PROCESSING" | "SENT" | "FAILED">().notNull().default("PENDING"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pendingIndex: index("email_outbox_pending_idx").on(t.status, t.nextAttemptAt, t.id),
  institutionCreatedIndex: index("email_outbox_institution_created_idx").on(t.institutionId, t.createdAt),
}));

// --- COURSES ---
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 180 }).notNull(),
  lectureCount: integer("lecture_count").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ institutionStaffIndex: index("courses_institution_staff_idx").on(t.institutionId, t.staffId) }));

export const courseClasses = pgTable("course_classes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
}, (t) => ({ courseClassUnique: unique("course_classes_course_class_unique").on(t.courseId, t.classId) }));

export const courseLectures = pgTable("course_lectures", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  videoUrl: varchar("video_url", { length: 1000 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ courseSequenceUnique: unique("course_lectures_course_sequence_unique").on(t.courseId, t.sequence) }));

export const courseLectureProgress = pgTable("course_lecture_progress", {
  id: serial("id").primaryKey(),
  lectureId: integer("lecture_id").notNull().references(() => courseLectures.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at").notNull().defaultNow(),
}, (t) => ({ lectureStudentUnique: unique("course_lecture_progress_lecture_student_unique").on(t.lectureId, t.studentId), studentIndex: index("course_lecture_progress_student_idx").on(t.studentId) }));

// --- OWNER-REQUESTED, SUPER-ADMIN-EXECUTED INSTITUTION RESTORES ---
export const institutionRestoreRequests = pgTable("institution_restore_requests", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 32 }).notNull().default("PREVIEW_PENDING"),
  payloadEncrypted: text("payload_encrypted"),
  archiveSha256: varchar("archive_sha256", { length: 64 }).notNull(),
  backupGeneratedAt: timestamp("backup_generated_at").notNull(),
  preview: jsonb("preview"),
  previewHash: varchar("preview_hash", { length: 64 }),
  approvedAt: timestamp("approved_at"),
  executionRequestedByEmployee: integer("execution_requested_by_employee").references(() => employees.id, { onDelete: "set null" }),
  executionRequestedRole: varchar("execution_requested_role", { length: 16 }),
  executionRequestedBy: integer("execution_requested_by").references(() => superAdmins.id, { onDelete: "set null" }),
  recoveryEncrypted: text("recovery_encrypted"),
  recoveryExpiresAt: timestamp("recovery_expires_at"),
  sourceRestoreId: integer("source_restore_id"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  tenantIndex: index("institution_restore_requests_tenant_idx").on(t.institutionId, t.createdAt.desc()),
  activeUnique: uniqueIndex("institution_restore_one_active_idx").on(t.institutionId).where(sql`${t.status} NOT IN ('COMPLETED','FAILED','REJECTED')`),
  sourceReference: foreignKey({ columns: [t.sourceRestoreId], foreignColumns: [t.id] }).onDelete("set null"),
  statusCheck: check("institution_restore_requests_status_check", sql`${t.status} IN ('PREVIEW_PENDING','PREVIEW_RUNNING','AWAITING_APPROVAL','APPROVED','EXECUTION_PENDING','EXECUTION_RUNNING','CACHE_PENDING','COMPLETED','FAILED','REJECTED')`),
}));

// --- CENTRAL DATABASE BACKUPS ---
// Platform-owned disaster-recovery backups uploaded to the administrator-controlled
// Google Drive. One row per backup run. Separate from institution Google Drive backups.
export const centralDatabaseBackups = pgTable(
  "central_database_backups",
  {
    id: serial("id").primaryKey(),
    // Deterministic idempotency key: "central-YYYY-MM-DD-HH-MM-<uuid-slice>".
    // Used to deduplicate retried curl calls from the backup container.
    runId: varchar("run_id", { length: 128 }).notNull().unique(),
    // Dated filename: database-2026-09-21-00-00.sql.gz.enc
    fileName: varchar("file_name", { length: 255 }).notNull(),
    driveFileId: varchar("drive_file_id", { length: 255 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    // SHA-256 hex of the encrypted file computed locally before upload.
    sha256: varchar("sha256", { length: 64 }),
    status: varchar("status", { length: 16 })
      .$type<"PENDING" | "UPLOADING" | "COMPLETED" | "FAILED">()
      .notNull()
      .default("PENDING"),
    // Best-effort secondary B2 upload status (does not affect Drive status).
    b2Status: varchar("b2_status", { length: 16 })
      .$type<"SKIPPED" | "UPLOADED" | "FAILED">(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    statusCreatedIndex: index("central_database_backups_status_created_idx").on(t.status, t.createdAt),
    runIdIndex: uniqueIndex("central_database_backups_run_id_idx").on(t.runId),
  }),
);

// Singleton super-admin-controlled encryption secret for central database dumps.
// The value is encrypted with the server credential key before storage.
export const centralBackupSettings = pgTable("central_backup_settings", {
  id: integer("id").primaryKey().default(1),
  databasePasswordEncrypted: text("database_password_encrypted"),
  updatedByEmployee: integer("updated_by_employee").references(() => employees.id, { onDelete: "set null" }),
  updatedBy: integer("updated_by").references(() => superAdmins.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
