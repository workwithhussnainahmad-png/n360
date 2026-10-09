import { z } from "zod";

function isCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine(isCalendarDate, "Use a valid date");

const optionalDate = z
  .union([z.literal(""), isoDate])
  .transform((value) => value || null);

const optionalText = (maximum: number) =>
  z.union([z.string().trim().max(maximum), z.null()])
    .transform((value) => value || null);
const optionalDateTime = z
  .union([z.literal(""), z.string().datetime({ offset: true })])
  .transform((value) => value || null);
const admissionCycleFields = {
    name: z.string().trim().min(2).max(120),
    academicYear: z.string().trim().min(4).max(20),
    opensOn: optionalDate,
    closesOn: optionalDate,
    instructions: optionalText(3000),
    requiredDocuments: z
      .array(
        z
          .object({
            name: z.string().trim().min(1, "Enter a document name").max(160, "Document names must be 160 characters or fewer"),
            instructions: optionalText(500),
          })
          .strict(),
      )
      .min(1, "Add at least one required document")
      .max(20),
    requiresTest: z.boolean(),
    testScheduledAt: optionalDateTime,
    testLocation: optionalText(300),
    testInstructions: optionalText(1000),
    requiresInterview: z.boolean(),
    interviewScheduledAt: optionalDateTime,
    interviewLocation: optionalText(300),
    interviewInstructions: optionalText(1000),
    admissionFeeAmount: z.number().int().positive().max(100_000_000),
    admissionFeeDueDays: z.number().int().min(1).max(90),
    // Older open browser tabs may still submit this retired field. Accept it
    // during the UI transition, but the API deliberately ignores its value.
    paymentMethods: z.unknown().optional(),
    admissionFeeInstructions: optionalText(1000),
};

type AdmissionCycleData = {
  opensOn: string | null;
  closesOn: string | null;
  requiresTest: boolean;
  testScheduledAt: string | null;
  testLocation: string | null;
  requiresInterview: boolean;
  interviewScheduledAt: string | null;
  interviewLocation: string | null;
};

function validateAdmissionCycleSchedule(
  value: AdmissionCycleData,
  context: z.RefinementCtx,
  requireFuture: boolean,
) {
    if (value.requiresTest && (!value.testScheduledAt || !value.testLocation)) {
      context.addIssue({
        code: "custom",
        message: "Set the common test date and location",
        path: ["testScheduledAt"],
      });
    }
    if (
      requireFuture && value.testScheduledAt &&
      new Date(value.testScheduledAt).getTime() <= Date.now()
    ) {
      context.addIssue({
        code: "custom",
        message: "Test schedule must be in the future",
        path: ["testScheduledAt"],
      });
    }
    if (
      value.requiresInterview &&
      (!value.interviewScheduledAt || !value.interviewLocation)
    ) {
      context.addIssue({
        code: "custom",
        message: "Set the common interview date and location",
        path: ["interviewScheduledAt"],
      });
    }
    if (
      requireFuture && value.interviewScheduledAt &&
      new Date(value.interviewScheduledAt).getTime() <= Date.now()
    ) {
      context.addIssue({
        code: "custom",
        message: "Interview schedule must be in the future",
        path: ["interviewScheduledAt"],
      });
    }
    if (
      value.requiresTest &&
      value.requiresInterview &&
      value.testScheduledAt &&
      value.interviewScheduledAt &&
      value.interviewScheduledAt <= value.testScheduledAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Interview must be scheduled after the admission test",
        path: ["interviewScheduledAt"],
      });
    }
}

function datesAreOrdered(value: AdmissionCycleData) {
  return !value.opensOn || !value.closesOn || value.opensOn <= value.closesOn;
}

export const createAdmissionCycleSchema = z
  .object({
    action: z.literal("createCycle"),
    ...admissionCycleFields,
  })
  .strict()
  .refine(datesAreOrdered, {
    message: "Closing date must be on or after opening date",
    path: ["closesOn"],
  })
  .superRefine((value, context) =>
    validateAdmissionCycleSchedule(value, context, true),
  );

export const updateAdmissionCycleSchema = z
  .object({
    action: z.literal("updateCycle"),
    cycleId: z.number().int().positive(),
    ...admissionCycleFields,
  })
  .strict()
  .refine(datesAreOrdered, {
    message: "Closing date must be on or after opening date",
    path: ["closesOn"],
  })
  .superRefine((value, context) =>
    validateAdmissionCycleSchedule(value, context, false),
  );

export const createAdmissionOfferingSchema = z
  .object({
    action: z.literal("createOffering"),
    cycleId: z.number().int().positive(),
    title: z.string().trim().min(1, "Enter a program or class name").max(120),
    description: optionalText(500),
    capacity: z.number().int().positive().nullable(),
  })
  .strict();

export const updateAdmissionOfferingSchema = z
  .object({
    action: z.literal("updateOffering"),
    offeringId: z.number().int().positive(),
    title: z.string().trim().min(1, "Enter a program or class name").max(120),
    description: optionalText(500),
    capacity: z.number().int().positive().nullable(),
  })
  .strict();

const deleteAdmissionOfferingSchema = z
  .object({
    action: z.literal("deleteOffering"),
    offeringId: z.number().int().positive(),
  })
  .strict();

export const updateAdmissionCycleStatusSchema = z
  .object({
    action: z.literal("setCycleStatus"),
    cycleId: z.number().int().positive(),
    status: z.enum(["DRAFT", "OPEN", "CLOSED"]),
  })
  .strict();

const deleteAdmissionCycleSchema = z
  .object({
    action: z.literal("deleteCycle"),
    cycleId: z.number().int().positive(),
  })
  .strict();

export const admissionConfigurationActionSchema = z.union([
  z.object({ action: z.literal("archiveCycle"), cycleId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("restoreCycle"), cycleId: z.number().int().positive() }).strict(),
  createAdmissionCycleSchema,
  updateAdmissionCycleSchema,
  createAdmissionOfferingSchema,
  updateAdmissionOfferingSchema,
  deleteAdmissionOfferingSchema,
  updateAdmissionCycleStatusSchema,
  deleteAdmissionCycleSchema,
]);

export const campusAdmissionAvailabilitySchema = z.object({
  cycleId: z.number().int().positive(),
  isOpen: z.boolean(),
}).strict();

export const publicAdmissionApplicationSchema = z
  .object({
    offeringId: z.number().int().positive(),
    campusId: z.number().int().positive().nullable().optional(),
    studentName: z.string().trim().min(2).max(255),
    dateOfBirth: isoDate,
    gender: z.enum(["MALE", "FEMALE", "OTHER"]),
    guardianName: z.string().trim().min(2).max(255),
    guardianEmail: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((value) => value.toLowerCase()),
    guardianPhone: z
      .string()
      .trim()
      .min(5)
      .max(50)
      .regex(/^[0-9+() .-]+$/, "Enter a valid phone number"),
    previousInstitution: optionalText(255),
    previousClassMarks: optionalText(100),
    medicalInformation: optionalText(2000),
    notes: optionalText(2000),
  })
  .strict();
