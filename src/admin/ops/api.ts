import { Directory, File, Paths } from 'expo-file-system';

import { adminJSON, adminRequest } from '@/admin/api';
import { APIError, getAPISession } from '@/api/client';
import { sendForm } from '@/api/upload';
import { environment } from '@/config/environment';

// Types and calls for the Workers, YouTube mirror, Featured and Playback intro
// admin screens. Shapes mirror the Go handlers in internal/api.

export type WorkerJob = { video_id: string; video_title: string; progress: number; started_at: string };
export type WorkerNode = {
  id: string; name: string; platform: string; arch: string; encoder: string; encoder_kind: string; is_gpu: boolean;
  roles: string[]; roles_locked: boolean; version: string; status: 'online' | 'offline' | 'revoked'; managed: boolean;
  disabled: boolean; scheduling_disabled: boolean; effective_enabled: boolean; fallback_active: boolean; is_primary: boolean;
  last_ip: string; started_at: string; last_seen: string; current_job?: WorkerJob;
};
export type WorkerRelease = { filename: string; version: string; os: 'linux' | 'windows' | 'darwin'; arch: 'amd64' | 'arm64'; size: number; sha256: string; download_url: string };
export type EnrollmentCode = { code: string; expires_at: string };

export type MirrorChannel = { youtube_channel_id: string; youtube_channel_title: string; youtube_channel_url: string; giltube_channel_id: string; giltube_channel_name: string; created_at: string; updated_at: string };
export type MirrorImportResult = { video_id: string; existing?: boolean; retried?: boolean; message?: string };
export type MirrorImportRequest = { url: string; giltube_channel_id: string; explicit: boolean; hidden: boolean; create_new_channel: boolean; copy_channel_info: boolean };
export type MirrorChannelRequest = { youtube_channel_id: string; youtube_channel_title: string; youtube_channel_url: string; giltube_channel_id: string; create_new_channel: boolean };

/** Import failures for unlinked channels carry the detected YouTube channel. */
export class MirrorImportError extends APIError {
  constructor(message: string, status: number, public readonly youtubeChannelID: string, public readonly youtubeChannelTitle: string) {
    super(message, status);
  }
}

export type AdminChannel = { id: string; name: string; username: string; status: string; video_count: number };

export type FeaturedType = 'video' | 'live' | 'movie' | 'series';
export type FeaturedItem = {
  id: string; content_type: FeaturedType; content_id: string; header: string; description: string; action_text: string;
  position: number; enabled: boolean; notifications_enabled: boolean; title: string; image_url: string; channel_id: string;
  channel_name: string; target_url: string; is_live: boolean; scheduled_for: string | null;
};
export type FeaturedCandidate = { id: string; content_type: FeaturedType; title: string; image_url: string; channel_id: string; channel_name: string; scheduled_for: string | null };
export type FeaturedPayload = { content_type: FeaturedType; content_id: string; header: string; description: string; action_text: string; position: number; enabled: boolean; notifications_enabled: boolean; scheduled_for?: string };

export type PlaybackIntro = { enabled: boolean; allow_skip: boolean; url: string; version: string; size: number; content_type: string; updated_at: string };

const id = (value: string) => encodeURIComponent(value);

export const opsAPI = {
  workers: async () => (await adminRequest<{ workers?: WorkerNode[] }>('/workers'))?.workers ?? [],
  releases: async () => (await adminRequest<{ releases?: WorkerRelease[] }>('/workers/releases'))?.releases ?? [],
  createEnrollmentCode: () => adminJSON<EnrollmentCode>('POST', '/workers/enrollment-codes'),
  revokeWorker: (workerID: string) => adminJSON('POST', `/workers/${id(workerID)}/revoke`),
  enableWorker: (workerID: string) => adminJSON('POST', `/workers/${id(workerID)}/enable`),
  setScheduling: (workerID: string, enabled: boolean) => adminJSON('POST', `/workers/${id(workerID)}/scheduling`, { enabled }),
  setRoles: (workerID: string, roles: string[]) => adminJSON('PUT', `/workers/${id(workerID)}/roles`, { roles }),
  deleteWorker: (workerID: string) => adminJSON('DELETE', `/workers/${id(workerID)}`),

  channels: async () => (await adminRequest<AdminChannel[] | null>('/channels')) ?? [],
  mirrorChannels: async () => (await adminRequest<{ mappings?: MirrorChannel[] }>('/youtube-mirrors/channels'))?.mappings ?? [],
  saveMirrorChannel: (body: MirrorChannelRequest) => adminJSON<{ giltube_channel_id: string; created_channel: boolean }>('POST', '/youtube-mirrors/channels', body),
  deleteMirrorChannel: (youtubeChannelID: string) => adminJSON('DELETE', `/youtube-mirrors/channels/${id(youtubeChannelID)}`),
  importMirrorVideo: async (body: MirrorImportRequest) => {
    // Fetched directly so the detected channel in an error body is kept.
    const token = getAPISession();
    const response = await fetch(`${environment.apiURL}/admin/youtube-mirrors/import`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new MirrorImportError(payload?.error || `GilTube request failed (${response.status})`, response.status, payload?.youtube_channel_id || '', payload?.youtube_channel_title || '');
    }
    return payload as MirrorImportResult;
  },

  featured: async () => (await adminRequest<{ items?: FeaturedItem[] }>('/featured'))?.items ?? [],
  featuredCandidates: async (type: FeaturedType, query: string) => (await adminRequest<{ items?: FeaturedCandidate[] }>(`/featured/candidates?type=${id(type)}&q=${id(query)}`))?.items ?? [],
  createFeatured: (body: FeaturedPayload) => adminJSON<{ id: string }>('POST', '/featured', body),
  updateFeatured: (featuredID: string, body: FeaturedPayload) => adminJSON('PUT', `/featured/${id(featuredID)}`, body),
  deleteFeatured: (featuredID: string) => adminJSON('DELETE', `/featured/${id(featuredID)}`),

  playbackIntro: () => adminRequest<PlaybackIntro>('/playback-intro'),
  updatePlaybackIntro: (settings: { enabled?: boolean; allow_skip?: boolean }) => adminJSON<PlaybackIntro>('PUT', '/playback-intro', settings),
  deletePlaybackIntro: () => adminJSON<PlaybackIntro>('DELETE', '/playback-intro'),
  /** The backend takes one multipart `video` field and reads the extension from its file name. */
  uploadPlaybackIntro: async (asset: { uri: string; name: string }) => {
    const extension = (/\.(mp4|m4v|webm)$/i.exec(asset.name)?.[1] || 'mp4').toLowerCase();
    const directory = new Directory(Paths.cache, 'giltube-playback-intro');
    directory.create({ intermediates: true, idempotent: true });
    const staged = new File(directory, `intro.${extension}`);
    try {
      await new File(asset.uri).copy(staged, { overwrite: true });
      const form = new FormData();
      form.append('video', staged);
      return await sendForm('/admin/playback-intro', form) as PlaybackIntro;
    } finally {
      if (staged.exists) staged.delete();
    }
  },
};

/** Parses "YYYY-MM-DD HH:MM" in local time; returns null when malformed. */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 ? null : date;
}

export function formatLocalDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
