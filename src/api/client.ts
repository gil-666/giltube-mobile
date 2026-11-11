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

// The catalog language ('es' or '' for English) sent with movie, series and
// search requests, so titles and synopses come back translated.
let contentLanguage = '';

export function setContentLanguage(language: string) {
  contentLanguage = language;
}

/** path with ?lang= for the current catalog language. */
export function localizedPath(path: string) {
  if (!contentLanguage) return path;
  return `${path}${path.includes('?') ? '&' : '?'}lang=${contentLanguage}`;
}

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
