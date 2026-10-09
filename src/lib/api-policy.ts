import type { NextRequest } from 'next/server';
import { applyCorsHeaders } from './cors';
import { stripSessionHeaders } from './session-header';
import { ARCHIVED_ADMISSION_MESSAGE, isArchivedAdmissionError } from './admission-archive-error';
import { inputErrorResponse } from './input-error-response';

/** Keep API transport policy in guarded routes so hot endpoints can skip Proxy. */
export function withApiPolicy<TContext>(handler: (req: NextRequest, context: TContext) => Promise<Response>) {
  return async (req: NextRequest, context: TContext) => {
    stripSessionHeaders(req.headers);
    try {
      return applyCorsHeaders(req, await handler(req, context));
    } catch (error) {
      const inputError = inputErrorResponse(error);
      if (inputError) return applyCorsHeaders(req, Response.json(inputError.body, { status: inputError.status }));
      if (isArchivedAdmissionError(error)) return applyCorsHeaders(req, Response.json({ error: ARCHIVED_ADMISSION_MESSAGE }, { status: 409 }));
      throw error;
    }
  };
}
