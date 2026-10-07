import { z } from 'zod';
import { validateInstitutionSlug } from '@/lib/institution-domain';

export const institutionPublicSlugSchema = z.string().transform((value, context) => {
  const validation = validateInstitutionSlug(value);
  if (!validation.ok) {
    context.addIssue({
      code: 'custom',
      message: validation.code === 'RESERVED'
        ? 'This subdomain is reserved'
        : 'Use 2-30 lowercase letters, numbers, or single hyphens; hyphens cannot be first or last',
    });
    return z.NEVER;
  }
  return validation.slug;
});

export const registerInstitutionSchema = z.object({
  name: z.string().min(2),
  mainCampusName: z.string().trim().min(2).max(255),
  type: z.enum(['SCHOOL', 'COLLEGE', 'UNIVERSITY']),
  username: z.string().min(3).max(30).regex(/^[a-z0-9]+$/, "Lowercase alphanumeric only"),
  country: z.string().min(2),
  city: z.string().min(2),
  address: z.string().min(5),
  contactEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  contactPhone: z.string().min(5),
  registrationNumber: z.string().min(2),
  pricingPlan: z.enum(['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE']),
  adminPassword: z.string().min(8),
  // file metadata that client obtained from R2 upload
  logoKey: z.string().min(5),
  proofDocumentKey: z.string().min(5),
}).strict();

export const reviewInstitutionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
}).strict();
