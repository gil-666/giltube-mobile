import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { apiRequest } from '@/api/client';
import type { Channel } from '@/types/api';

export interface GeelSound {
  track_id: string;
  title: string;
  slug: string;
  artist_name: string;
  artist_slug: string;
  cover_url: string;
  audio_url: string;
  duration_seconds: number;
  start_ms?: number;
  usage_count?: number;
}

export interface Geel {
  id: string;
  title: string;
  description: string;
  views: number;
  likes: number;
  dislikes: number;
  comments_count: number;
  liked: boolean;
  disliked: boolean;
  hls_path: string;
  thumbnail_url: string;
  explicit: boolean;
  duration_seconds: number;
  display_width: number;
  display_height: number;
  created_at: string;
  channel_id: string;
  channel: Channel & { user_id: string };
  sound?: GeelSound;
}

export interface GeelReaction { likes: number; dislikes?: number; liked: boolean; disliked?: boolean }

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

// An anonymous id for this install, so the feed can skip what it already
// showed to guests (signed-in viewers are known by their account).
const viewerKey = 'giltube.geels.viewer.v1';
let viewerPromise: Promise<string> | null = null;
export function geelViewerID() {
  viewerPromise ??= (async () => {
    try {
      const saved = await SecureStore.getItemAsync(viewerKey);
      if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
      const id = Crypto.randomUUID();
      await SecureStore.setItemAsync(viewerKey, id);
      return id;
    } catch {
      return '';
    }
  })();
  return viewerPromise;
}

export const geelsAPI = {
  feed: async (options: { limit?: number; exclude?: string[]; start?: string; channel?: string; sound?: string; actor?: string } = {}) =>
    apiRequest<{ items: Geel[]; has_more: boolean }>(`/geels${query({
      viewer: await geelViewerID(),
      limit: options.limit ?? 6,
      exclude: options.exclude?.slice(-400).join(','),
      start: options.start,
      channel: options.channel,
      sound: options.sound,
      channel_id: options.actor,
    })}`),
  get: (id: string, actor?: string) => apiRequest<Geel>(`/geels/${encodeURIComponent(id)}${query({ channel_id: actor })}`),
  react: (id: string, reaction: 'like' | 'dislike', on: boolean, actor: string) =>
    apiRequest<GeelReaction>(`/videos/${encodeURIComponent(id)}/${reaction}?channel_id=${encodeURIComponent(actor)}`, { method: on ? 'POST' : 'DELETE' }),
  /** Reports how much of a Geel was watched (0–1). */
  view: async (id: string, ratio: number) => apiRequest<unknown>(`/geels/${encodeURIComponent(id)}/view${query({
    viewer: await geelViewerID(),
    ratio: Math.min(Math.max(ratio, 0), 1).toFixed(3),
  })}`, { method: 'POST' }).catch(() => undefined),
  sounds: (q = '', limit = 30) => apiRequest<{ sounds: GeelSound[] }>(`/geels/sounds${query({ q, limit })}`),
  sound: (trackID: string) => apiRequest<{ sound: GeelSound; usable: boolean }>(`/geels/sounds/${encodeURIComponent(trackID)}`),
};
