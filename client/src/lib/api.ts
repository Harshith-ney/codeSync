import { clearSession } from './auth';

const BASE = '/api';
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/demo', '/auth/refresh', '/auth/logout'];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401 && !AUTH_PATHS.includes(path)) {
    const refreshRes = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (refreshRes.ok) {
      return request<T>(path, options);
    }
    clearSession();
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || res.statusText);
  }

  return res.json().catch(() => ({})) as Promise<T>;
}

export const api = {
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  get: <T>(path: string) => request<T>(path),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
