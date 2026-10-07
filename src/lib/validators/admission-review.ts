import { z } from 'zod';

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null);
const appointmentType = z.enum(['TEST', 'INTERVIEW']);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid due date').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Use a valid due date');

const startReviewSchema = z.object({ action: z.literal('startReview') }).strict();

const requestDocumentsSchema = z.object({
  action: z.literal('requestDocuments'),
  documents: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    instructions: optionalText(500),
  }).strict()).min(1).max(20),
}).strict();

const scheduleAppointmentSchema = z.object({
  action: z.literal('scheduleAppointment'),
  type: appointmentType,
  scheduledAt: z.string().datetime({ offset: true }),
  location: z.string().trim().min(2).max(300),
  instructions: optionalText(1000),
}).strict();

const recordOutcomeSchema = z.object({
  action: z.literal('recordOutcome'),
  type: appointmentType,
  outcome: z.enum(['PASSED', 'FAILED', 'ABSENT']),
  note: optionalText(1000),
}).strict();

const admissionDecisionSchema = z.object({
  action: z.literal('decision'),
  decision: z.enum(['OFFERED', 'REJECTED']),
  note: z.string().trim().min(2).max(1000),
}).strict();

const reviewDocumentSchema = z.object({
  action: z.literal('reviewDocument'),
  documentId: z.number().int().positive(),
  status: z.enum(['VERIFIED', 'REJECTED']),
  note: optionalText(500),
}).strict();

const initiateFeeSchema = z.object({
  action: z.literal('initiateFee'),
  amount: z.number().int().positive().max(100_000_000),
  dueDate: z.union([z.literal(''), calendarDate]).transform((value) => value || null),
  instructions: z.string().trim().min(5).max(3000),
}).strict();

const reviewFeeSchema = z.object({
  action: z.literal('reviewFee'),
  status: z.enum(['VERIFIED', 'REJECTED']),
  note: optionalText(500),
}).strict().refine((value) => value.status !== 'REJECTED' || Boolean(value.note), {
  message: 'Explain why the payment proof was rejected',
  path: ['note'],
});

const enrollStudentSchema = z.object({
  action: z.literal('enrollStudent'),
  campusId: z.number().int().positive().nullable(),
  classId: z.number().int().positive(),
  sectionId: z.number().int().positive().nullable(),
  classRollNumber: z.string().trim().min(1).max(100),
  yearOfJoining: z.number().int().min(2000).max(2100),
}).strict();

const withdrawApplicationSchema = z.object({
  action: z.literal('withdrawApplication'),
  reason: z.string().trim().min(2).max(500),
}).strict();

const resetApplicantPasswordSchema = z.object({ action: z.literal('resetApplicantPassword') }).strict();
const resetStudentPasswordSchema = z.object({ action: z.literal('resetStudentPassword') }).strict();

export const admissionReviewActionSchema = z.discriminatedUnion('action', [
  startReviewSchema,
  requestDocumentsSchema,
  scheduleAppointmentSchema,
  recordOutcomeSchema,
  admissionDecisionSchema,
  reviewDocumentSchema,
  initiateFeeSchema,
  reviewFeeSchema,
  enrollStudentSchema,
  withdrawApplicationSchema,
  resetApplicantPasswordSchema,
  resetStudentPasswordSchema,
]);
