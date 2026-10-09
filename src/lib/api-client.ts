import { refreshSession } from './session-refresh';
import { apiErrorMessage } from './validation-errors';

export class ApiError extends Error {
  readonly fieldErrors: Record<string, string[]>;
  constructor(public status: number, public data: unknown) {
    super(apiErrorMessage(data, status));
    this.name = 'ApiError';
    this.fieldErrors = data && typeof data === 'object' && 'fieldErrors' in data && data.fieldErrors && typeof data.fieldErrors === 'object'
      ? data.fieldErrors as Record<string, string[]> : {};
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  if (typeof document !== 'undefined' && document.documentElement.dataset.campusReadOnly === 'true'
    && !['GET', 'HEAD', 'OPTIONS'].includes(options?.method ?? 'GET')
    && !['/api/institution/campus-view', '/api/auth/logout', '/api/auth/refresh'].includes(url)) {
    throw new ApiError(403, { error: 'This campus is read-only. Switch back to your own campus to make changes.' });
  }
  const send = async () => {
    try {
      return await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError(0, { error: 'Cannot reach the server. Check your internet connection and try again.' });
    }
  };
  let res = await send();

  if (res.status === 401 && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login')) {
    await refreshSession();
    if (options?.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');

    // Retry original request
    res = await send();
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  let data: unknown;
  try { data = isJson ? await res.json() : await res.text(); }
  catch { throw new ApiError(res.status, { error: 'The server returned an unreadable response. Please try again.' }); }

  if (!res.ok) {
    throw new ApiError(res.status, isJson ? data : null);
  }

  return data as T;
}

export const api = {
  get: <T>(url: string, options?: RequestInit) => request<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body: unknown, options?: RequestInit) => request<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown, options?: RequestInit) => request<T>(url, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown, options?: RequestInit) => request<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(url: string, options?: RequestInit) => request<T>(url, { ...options, method: 'DELETE' }),
};
