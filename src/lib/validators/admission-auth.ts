import { z } from 'zod';

const SCRIPT_LIKE_INPUT = /<\s*\/?\s*script\b|javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/i;
const safePassword = (minimum: number) => z.string().min(minimum).max(128).refine((value) => !SCRIPT_LIKE_INPUT.test(value), 'Invalid characters in login field');

export const admissionApplicantLoginSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: safePassword(8),
}).strict();

export const admissionApplicantChangePasswordSchema = z.object({
  currentPassword: safePassword(8),
  newPassword: safePassword(10),
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  message: 'New password must be different from the temporary password',
  path: ['newPassword'],
});
