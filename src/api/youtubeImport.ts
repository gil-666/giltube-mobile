import { adminJSON, adminRequest } from '@/admin/api';
import { APIError, apiRequest, getAPISession } from '@/api/client';
import { environment } from '@/config/environment';

// Public "Import from YouTube": a signed-in user brings one of their YouTube
// videos to their own GilTube channel. Admins decide who may use it.

export type YouTubeImportAccess = {
  available: boolean;
  reason: '' | 'off' | 'revoked' | 'not_allowed' | 'banned' | 'signed_out';
  daily_limit?: number;
  used_today?: number;
  max_duration_minutes?: number;
  max_height?: number;
};

export type YouTubeImportPreview = {
  youtube_video_id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration_seconds: number;
  youtube_channel: string;
  blocked_reason: string;
  existing_video_id: string;
  daily_limit: number;
  used_today: number;
};

export type YouTubeImportStatus = 'downloading' | 'processing' | 'ready' | 'failed';

export type YouTubeImportItem = {
  id: string;
  video_id: string;
  youtube_video_id: string;
  title: string;
  status: YouTubeImportStatus;
  progress: number;
  error: string;
  thumbnail: string;
  channel_id: string;
  channel_name: string;
  created_at: string;
};

export type YouTubeImportSettings = { mode: 'everyone' | 'allowlist' | 'off'; daily_limit: number; max_duration_minutes: number; max_height: number };
export type YouTubeImportUserAccess = { user_id: string; username: string; email: string; access: 'allowed' | 'revoked'; updated_at: string; import_count: number };
export type YouTubeImportAdminRecent = {
  id: string; user_id: string; username: string; access: '' | 'allowed' | 'revoked'; video_id: string; youtube_video_id: string;
  title: string; status: YouTubeImportStatus; error: string; channel_name: string; created_at: string;
};

/** An API failure that also carries the server's machine-readable reason. */
export class YouTubeImportError extends APIError {
  constructor(message: string, status: number, public readonly reason: string, public readonly videoID: string) {
    super(message, status);
  }
}

// authenticatedFetch drops the JSON body on errors, so these calls read it
// themselves to keep `reason` (revoked, duplicate, daily_limit…).
async function postWithReason<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const token = getAPISession();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${environment.apiURL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new YouTubeImportError(payload?.error || `GilTube request failed (${response.status})`, response.status, payload?.reason || '', payload?.video_id || '');
  }
  return payload as T;
}

export const youtubeImportAPI = {
  access: () => apiRequest<YouTubeImportAccess>('/youtube-import/access'),
  preview: (url: string) => postWithReason<YouTubeImportPreview>('/youtube-import/preview', { url }),
  start: (data: { url: string; channel_id: string; title: string; explicit: boolean }) => postWithReason<{ import_id: string; video_id: string; title: string }>('/youtube-import', data),
  imports: async () => (await apiRequest<{ imports: YouTubeImportItem[] | null }>('/youtube-import/imports'))?.imports ?? [],
  retry: (id: string) => postWithReason<{ import_id: string; video_id: string }>(`/youtube-import/imports/${encodeURIComponent(id)}/retry`, {}),

  adminSettings: () => adminRequest<{ settings: YouTubeImportSettings; users: YouTubeImportUserAccess[] | null; recent: YouTubeImportAdminRecent[] | null }>('/youtube-import/settings'),
  saveAdminSettings: (settings: YouTubeImportSettings) => adminJSON<{ settings: YouTubeImportSettings }>('PUT', '/youtube-import/settings', settings),
  setUserAccess: (user: string, access: '' | 'allowed' | 'revoked') => adminJSON<{ user_id: string; username: string; access: string }>('PUT', '/youtube-import/users', { user, access }),
};

export const youtubeImportKeys = {
  access: ['youtube-import', 'access'] as const,
  imports: ['youtube-import', 'imports'] as const,
  admin: ['admin', 'youtube-import'] as const,
};
