import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { apiRequest } from '@/api/client';
import { sendForm, uploadFileChunks } from '@/api/upload';
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
  /** 9:16 poster (thumbnails are 16:9 crops); empty until generated. */
  poster_url?: string;
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
  compositionStatus: (videoID: string) => apiRequest<{ composition: string; error: string; status: string; progress: number }>(`/geels/compose/${encodeURIComponent(videoID)}`),
};

export interface GeelClip { uri: string; duration: number; speed: number; mirror?: boolean }

export interface GeelPost {
  clips: GeelClip[];
  channelID: string;
  caption: string;
  hidden: boolean;
  explicit: boolean;
  soundTrackID?: string;
  soundStartMS: number;
  soundVolume: number;
  originalVolume: number;
  coverMS: number;
}

/** Uploads each clip, then asks the server to put the Geel together. */
export async function postGeel(post: GeelPost, onProgress: (fraction: number) => void) {
  const totalSeconds = post.clips.reduce((sum, clip) => sum + clip.duration, 0) || 1;
  let done = 0;
  const segments: { upload_id: string; speed: number; mirror: boolean }[] = [];
  for (const [index, clip] of post.clips.entries()) {
    const share = clip.duration / totalSeconds;
    const { sessionID } = await uploadFileChunks({ uri: clip.uri, name: `geel-clip-${index}.mp4` }, (fraction) => onProgress(0.95 * (done + share * fraction)));
    done += share;
    segments.push({ upload_id: sessionID, speed: clip.speed, mirror: !!clip.mirror });
  }
  const form = new FormData();
  form.append('channel_id', post.channelID);
  form.append('description', post.caption.trim());
  form.append('title', post.caption.trim().split('\n')[0].slice(0, 100));
  form.append('segments', JSON.stringify(segments));
  form.append('original_volume', post.originalVolume.toFixed(2));
  form.append('cover_ms', String(Math.max(0, Math.round(post.coverMS))));
  if (post.soundTrackID) {
    form.append('sound_track_id', post.soundTrackID);
    form.append('sound_start_ms', String(Math.max(0, Math.round(post.soundStartMS))));
    form.append('sound_volume', post.soundVolume.toFixed(2));
  }
  if (post.hidden) form.append('hidden', 'true');
  if (post.explicit) form.append('explicit', 'true');
  const result = await sendForm('/geels/compose', form) as { video_id: string };
  onProgress(1);
  return result;
}
