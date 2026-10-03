import { environment } from '@/config/environment';

let sessionToken: string | null = null;

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function setAPISession(token: string | null) {
  sessionToken = token;
}

export function getAPISession() { return sessionToken; }

export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);

  const response = await fetch(`${environment.apiURL}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null);
    const text = payload ? '' : await response.clone().text().catch(() => '');
    throw new APIError(payload?.error || text || `GilTube request failed (${response.status})`, response.status);
  }
  return response;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const payload = await response.json().catch(() => null);
  return payload as T;
}
