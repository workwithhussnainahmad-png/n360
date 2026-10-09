/** Shared public validation messages. Never include submitted values in errors. */
type Issue = {
  code: string;
  path?: readonly PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  expected?: string;
  inclusive?: boolean;
  format?: string;
  errors?: readonly (readonly Issue[])[];
};

export function fieldLabel(path: string): string {
  const labels: Record<string, string> = {
    emailOrUsername: 'Email or username', classId: 'Class', sectionId: 'Section',
    campusId: 'Campus', studentId: 'Student', subjectIds: 'Subjects',
    classTeacherId: 'Class teacher', customRoleId: 'Role', publicId: 'Uploaded file',
    gatewayName: 'Payment gateway name', classRollNumber: 'Class roll number',
    providerName: 'Payment gateway name', accountTitle: 'Account name', staffId: 'Staff member',
    subjectId: 'Subject', classIds: 'Classes', notificationIds: 'Notifications',
  };
  const parts = path.split('.');
  return parts.map(part => /^\d+$/.test(part) ? `item ${Number(part) + 1}` : labels[part]
    ?? part.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase())).join(' → ') || 'Value';
}

function issueMessage(issue: Issue): string {
  // Keep deliberate domain messages; replace Zod's technical defaults only.
  if (!/^(Too small:|Too big:|Invalid input:|Invalid string:|Invalid option:|Invalid email|Invalid URL|Invalid UUID|Invalid ISO|Invalid format|Invalid number)/i.test(issue.message)) return issue.message;
  if (issue.code === 'too_small') {
    if (issue.origin === 'string') return Number(issue.minimum) === 1 ? 'This value is required.' : `Enter at least ${issue.minimum} characters.`;
    if (issue.origin === 'array') return `Select at least ${issue.minimum} item${Number(issue.minimum) === 1 ? '' : 's'}.`;
    return `Enter a value ${issue.inclusive === false ? 'greater than' : 'of at least'} ${issue.minimum}.`;
  }
  if (issue.code === 'too_big') {
    if (issue.origin === 'string') return `Use no more than ${issue.maximum} characters.`;
    if (issue.origin === 'array') return `Select no more than ${issue.maximum} items.`;
    return `Enter a value ${issue.inclusive === false ? 'less than' : 'no greater than'} ${issue.maximum}.`;
  }
  if (issue.code === 'invalid_type') {
    if (/received undefined|received null/i.test(issue.message)) return 'This value is required.';
    if (issue.expected === 'number') return 'Enter a valid number.';
    if (issue.expected === 'int') return 'Enter a whole number.';
    return 'Enter a valid value.';
  }
  if (issue.code === 'invalid_format') {
    if (issue.format === 'email') return 'Enter a valid email address.';
    if (issue.format === 'url') return 'Enter a valid URL, including https://.';
    if (issue.format === 'date') return 'Enter a valid date.';
    return 'Use the required format.';
  }
  if (issue.code === 'invalid_value') return 'Choose a valid option.';
  return 'Enter a valid value.';
}

export function validationError(error: { issues: readonly Issue[] }) {
  const fieldErrors: Record<string, string[]> = Object.create(null);
  const formErrors: string[] = [];
  const visit = (issue: Issue) => {
    if (issue.code === 'invalid_union' && issue.errors?.length) {
      // Select the closest union branch, rather than showing contradictions from every branch.
      const branch = [...issue.errors].sort((a, b) => a.length - b.length)[0];
      branch.forEach(visit);
      return;
    }
    const key = (issue.path ?? []).map(String).join('.');
    const message = issueMessage(issue);
    const target = key ? (fieldErrors[key] ??= []) : formErrors;
    if (!target.includes(message)) target.push(message);
  };
  error.issues.forEach(visit);
  const messages = [...formErrors, ...Object.entries(fieldErrors).flatMap(([key, values]) => values.map(value => `${fieldLabel(key)}: ${value}`))];
  return { error: messages.slice(0, 5).join(' ') || 'Check the entered values and try again.', code: 'VALIDATION_ERROR', fieldErrors, formErrors };
}

export function apiErrorMessage(data: unknown, status = 0): string {
  const fallback = status === 401 ? 'Your session has expired. Please sign in again.'
    : status === 403 ? 'You do not have permission to perform this action.'
    : status === 413 ? 'The uploaded file or request is too large.'
    : status === 429 ? 'Too many requests. Please wait and try again.'
    : status >= 500 ? 'The server could not complete this request. Please try again.'
    : 'Could not complete this request. Check the entered values and try again.';
  if (data instanceof Error) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(data.message)) return 'Cannot reach the server. Check your internet connection and try again.';
    return apiErrorMessage({ error: data.message }, status);
  }
  if (!data || typeof data !== 'object') return fallback;
  const body = data as Record<string, unknown>;
  if (body.error && typeof body.error === 'object' && 'issues' in body.error && Array.isArray(body.error.issues)) return validationError(body.error as { issues: Issue[] }).error;
  if (Array.isArray(body.details) && body.details.every(issue => issue && typeof issue.code === 'string' && typeof issue.message === 'string')) return validationError({ issues: body.details }).error;
  if (typeof body.error !== 'string' || !body.error.trim()) return fallback;
  const message = body.error.trim();
  // Do not display reverse-proxy HTML, SQL diagnostics, stack traces, or raw JSON errors.
  if (/^\s*[\[{<]|violates .*constraint|SQLSTATE|\bat .*\(.*:\d+:\d+\)|column .*does not exist|relation .*does not exist/i.test(message)) return fallback;
  if (/^(Internal Server Error|An error occurred|Failed to fetch|NetworkError.*|Load failed|Unauthorized|Forbidden|Invalid data|Invalid payload)$/i.test(message)) return fallback;
  return message;
}

export async function responseErrorMessage(response: Response): Promise<string> {
  let data: unknown;
  try { data = await response.clone().json(); } catch { /* Proxy responses may contain HTML or no body. */ }
  return apiErrorMessage(data, response.status);
}

export function nativeValidationMessage(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const validity = field.validity;
  if (validity.valueMissing) return 'This value is required.';
  if (validity.typeMismatch) return field instanceof HTMLInputElement && field.type === 'email' ? 'Enter a valid email address.' : 'Enter a valid URL, including https://.';
  if (validity.tooLong) return `Use no more than ${(field as HTMLInputElement).maxLength} characters.`;
  if (validity.tooShort) return `Enter at least ${(field as HTMLInputElement).minLength} characters.`;
  if (validity.rangeUnderflow) return `Enter a value of at least ${(field as HTMLInputElement).min}.`;
  if (validity.rangeOverflow) return `Enter a value no greater than ${(field as HTMLInputElement).max}.`;
  if (validity.badInput) return 'Enter a valid number.';
  if (validity.stepMismatch) return `Use increments of ${(field as HTMLInputElement).step || '1'}.`;
  if (validity.patternMismatch) return field.getAttribute('title') || 'Use the required format.';
  return field.validationMessage || 'Enter a valid value.';
}
