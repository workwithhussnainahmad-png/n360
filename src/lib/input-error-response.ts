import { ZodError } from 'zod';
import { ActionInputError } from './action-input-error';
import { databaseInputError } from './database-input-error';
import { apiErrorMessage, validationError } from './validation-errors';

export function inputErrorResponse(error: unknown) {
  const databaseError = databaseInputError(error);
  if (databaseError) return databaseError;
  if (error instanceof ZodError) return { status: 400, body: validationError(error) };
  if (error instanceof ActionInputError) {
    const explicitStatus = 'status' in error && typeof error.status === 'number' ? error.status : null;
    const status = explicitStatus && explicitStatus >= 400 && explicitStatus < 500 ? explicitStatus
      : /^Unauthorized/.test(error.message) ? 401 : /^Forbidden/.test(error.message) ? 403 : 400;
    return { status, body: { error: apiErrorMessage(error, status) } };
  }
  return null;
}
