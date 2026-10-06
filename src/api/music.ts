import type { ChannelMusic, MusicArtist, MusicRelease, MusicTrack } from '@/types/api';

import { apiRequest } from './client';

// GilTube Music is a public, read-only catalog (no auth, no pagination, no
// server-side search). Audio and artwork are plain files under /music-assets
// served with Range support; see src/music/quality.ts for picking a file.

const encode = encodeURIComponent;

export const musicAPI = {
  /** Published artists (with at least one track) and releases, newest first. */
  home: () => apiRequest<{ artists: MusicArtist[], releases: MusicRelease[] }>('/music'),
  artist: (slug: string) => apiRequest<{ artist: MusicArtist, releases: MusicRelease[] }>(`/music/artists/${encode(slug)}`),
  release: (slug: string) => apiRequest<{ release: MusicRelease, tracks: MusicTrack[] }>(`/music/releases/${encode(slug)}`),
  track: (slug: string) => apiRequest<{ track: MusicTrack }>(`/music/tracks/${encode(slug)}`),
  /** The official track for a music video; 404 when the video isn't one. */
  forVideo: (videoID: string) => apiRequest<{ track: MusicTrack }>(`/music-videos/${encode(videoID)}`),
  channel: (channelID: string) => apiRequest<ChannelMusic>(`/channels/${encode(channelID)}/music`),
};
