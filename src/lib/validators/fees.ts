import { z } from "zod";

const positiveMoney = z.coerce.number().int().positive().max(10_000_000);
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a valid billing month");
export const feeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("removeHead"),
    feeHeadId: z.coerce.number().int().positive(),
  }),
  z.object({
    action: z.literal("updateHeadKind"),
    feeHeadId: z.coerce.number().int().positive(),
    kind: z.enum(["RECURRING", "ONE_TIME"]),
  }),
  z.object({
    action: z.literal("createHead"),
    name: z.string().trim().min(2).max(100),
    kind: z.enum(["RECURRING", "ONE_TIME"]).default("RECURRING"),
  }),
  z.object({
    action: z.literal("setClassFee"),
    classId: z.coerce.number().int().positive(),
    feeHeadId: z.coerce.number().int().positive(),
    amount: z.coerce.number().int().min(0).max(10_000_000),
  }),
  z.object({
    action: z.literal("addAdjustment"),
    studentId: z.coerce.number().int().positive(),
    label: z.string().trim().min(2).max(120),
    type: z.enum(["DISCOUNT", "CHARGE"]),
    amount: positiveMoney,
    frequency: z.enum(["ONCE", "RECURRING"]).default("ONCE"),
    startMonth: month.optional(),
    endMonth: month.optional(),
  }),
  z.object({
    action: z.literal("previewMonth"),
    billingMonth: month,
    dueDate: z.string().date(),
  }),
  z.object({
    action: z.literal("issueOneTime"),
    batchId: z.string().uuid(),
    label: z.string().trim().min(2).max(120),
    feeHeadId: z.coerce.number().int().positive(),
    classId: z.coerce.number().int().positive().optional(),
    studentIds: z.array(z.number().int().positive()).min(1).max(5000).optional(),
    amount: positiveMoney,
    billingMonth: month,
    dueDate: z.string().date(),
  }),
  z.object({
    action: z.literal("generateMonth"),
    billingMonth: month,
    dueDate: z.string().date(),
    expectedPreviewHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }),
  z.object({
    action: z.literal("recordPayment"),
    invoiceId: z.coerce.number().int().positive(),
    amount: positiveMoney,
    method: z.enum(["CASH", "BANK", "EASYPAISA", "JAZZCASH", "OTHER"]),
    reference: z.string().trim().max(120).optional().default(""),
    notes: z.string().trim().max(500).optional().default(""),
  }),
  z
    .object({
      action: z.literal("reviewStudentPayment"),
      submissionId: z.coerce.number().int().positive(),
      status: z.enum(["VERIFIED", "REJECTED"]),
      note: z.string().trim().max(500).optional().default(""),
    })
    .refine((value) => value.status !== "REJECTED" || value.note.length >= 2, {
      message: "Explain why the payment was rejected",
      path: ["note"],
    }),
  z.object({
    action: z.literal("removeAdjustment"),
    adjustmentId: z.coerce.number().int().positive(),
  }),
  z.object({
    action: z.literal("getAdjustmentsByRollNumber"),
    rollNumber: z.string().trim().min(1).max(50),
  }),
]);
