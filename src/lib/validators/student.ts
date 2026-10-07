import { z } from 'zod';

export const createStudentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  campusId: z.coerce.number().min(1),
  classId: z.coerce.number().min(1),
  sectionId: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.coerce.number().min(1).optional()
  ),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  yearOfJoining: z.coerce.number().min(2000).max(2100),
  classRollNumber: z.string().min(1),
  phone: z.string().trim().max(50).optional(),
  guardianEmail: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.string().trim().email().max(255).optional(),
  ),
  age: z.coerce.number().optional(),
});

export const updateStudentProfileSchema = z.object({
  fatherName: z.string().trim().min(2).max(255).optional(),
  emergencyContact: z.string().trim().max(50).optional(),
  parentalWhatsapp: z.string().trim().max(50).optional(),
  profilePictureUrl: z.string().url().max(255).optional(),
  age: z.coerce.number().min(1).max(100).optional(),
}).strict();

export const studentProfileChangeRequestSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  fatherName: z.string().trim().max(255).optional(),
  classId: z.coerce.number().min(1).optional(),
  sectionId: z.coerce.number().min(1).optional(),
  reason: z.string().trim().min(10).max(1000),
}).strict().refine((data) => {
  return Boolean(data.firstName || data.lastName || data.fatherName || data.classId || data.sectionId);
}, {
  message: "Select at least one profile field to update",
});

export const reviewStudentProfileChangeRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNote: z.string().trim().max(1000).optional(),
}).strict();
