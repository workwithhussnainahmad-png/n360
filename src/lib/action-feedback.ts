import { unstable_rethrow } from 'next/navigation';
import { apiErrorMessage } from './validation-errors';
import { inputErrorResponse } from './input-error-response';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function actionFeedback<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await action() }; }
  catch (error) {
    // Redirect/notFound must keep Next's control flow.
    unstable_rethrow(error);
    const inputError = inputErrorResponse(error);
    if (inputError) return { ok: false, ...inputError.body };
    if (error instanceof Error && /^(Forbidden|Unauthorized|PASSWORD_CHANGE_REQUIRED|This campus is read-only)/.test(error.message)) {
      return { ok: false, error: error.message === 'PASSWORD_CHANGE_REQUIRED' ? 'Change your password before continuing.' : apiErrorMessage(error, error.message === 'Unauthorized' ? 401 : 403) };
    }
    console.error('Form action failed:', error);
    return { ok: false, error: 'The server could not save your changes. Please try again.' };
  }
}
