import { apiRequest } from '@/api/client';

const ADMIN_PREFIX = '/admin';

// Admin endpoints live under /api/v1/admin; apiURL already ends in /api/v1.
// All calls carry the session bearer token.
export function adminRequest<T>(path: string, init: RequestInit = {}) {
  return apiRequest<T>(`${ADMIN_PREFIX}${path}`, init);
}

export function adminJSON<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return adminRequest<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function adminForm<T>(method: 'POST' | 'PUT', path: string, form: FormData) {
  return adminRequest<T>(path, { method, body: form });
}

// Non-admin API routes (e.g. /videos/:id) used by admin screens.
export function apiJSON<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return apiRequest<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
