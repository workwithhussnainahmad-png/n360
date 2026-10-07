export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    const message = typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'An error occurred';
    super(message);
  }
}

let isRefreshing = false;
let failedQueue: { resolve: () => void, reject: (err: any) => void }[] = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  if (typeof document !== 'undefined' && document.documentElement.dataset.campusReadOnly === 'true'
    && !['GET', 'HEAD', 'OPTIONS'].includes(options?.method ?? 'GET')
    && !['/api/institution/campus-view', '/api/auth/logout', '/api/auth/refresh'].includes(url)) {
    throw new ApiError(403, { error: 'This campus is read-only. Switch back to your own campus to make changes.' });
  }
  let res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401 && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login')) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!refreshRes.ok) throw new Error('Session expired');
        
        processQueue(null);
      } catch (err: any) {
        processQueue(err);
        throw err;
      } finally {
        isRefreshing = false;
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      });
    }

    // Retry original request
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    throw new ApiError(res.status, isJson ? data : { error: data });
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
