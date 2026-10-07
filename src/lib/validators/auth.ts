import { z } from 'zod';

/**
 * Upper bounds are far above any legitimate value; they exist so a single request
 * cannot hand a multi-megabyte string to argon2 (memory-hard, and marshalled
 * across a worker_threads boundary) or into a Valkey rate-limit key.
 */
const MAX_IDENTIFIER = 255;
const MAX_PASSWORD = 1024;
const SCRIPT_LIKE_INPUT = /<\s*\/?\s*script\b|javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/i;
const safeLoginField = (maximum: number) => z.string().min(1).max(maximum).refine((value) => !SCRIPT_LIKE_INPUT.test(value), 'Invalid characters in login field');

export const loginSchema = z.object({
  emailOrUsername: safeLoginField(MAX_IDENTIFIER),
  password: safeLoginField(MAX_PASSWORD),
  roleHint: z.enum(['SUPER_ADMIN', 'EMPLOYEE', 'INSTITUTION', 'STAFF', 'STUDENT', 'PARENT']).optional(),
  institutionUsername: safeLoginField(30).optional(),
  securityAnswer: safeLoginField(MAX_IDENTIFIER).optional(),
  returnTokens: z.boolean().optional(),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: safeLoginField(MAX_PASSWORD),
  newPassword: safeLoginField(MAX_PASSWORD).refine(val => val.length >= 8, 'Password must contain at least 8 characters').refine(val => val !== '1234567890', {
    message: "Password cannot be the default '1234567890'",
  }),
  returnTokens: z.boolean().optional(),
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  message: 'New password must be different from the current password',
  path: ['newPassword'],
});
