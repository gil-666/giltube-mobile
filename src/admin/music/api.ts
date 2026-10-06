import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { useCallback } from 'react';

import { adminJSON, adminRequest } from '@/admin/api';
import { useIsAdmin } from '@/admin/ui';
import { sendForm, uploadFileChunks } from '@/api/upload';

import type {
  AdminMusicArtist,
  AdminMusicChannel,
  AdminMusicOverview,
  AdminMusicRelease,
  AdminMusicTrack,
  AdminMusicVideoOption,
  LocalMusicFile,
  MusicArtistInput,
  MusicReleaseInput,
  MusicTrackInput,
} from './types';

// Thin wrappers over /api/v1/admin/music/* mirroring the web's
// app/service/music.ts, plus the react-query keys the screens share.

const id = (value: string) => encodeURIComponent(value);

export const musicKeys = {
  all: ['admin', 'music'] as const,
  overview: ['admin', 'music', 'overview'] as const,
  artists: ['admin', 'music', 'artists'] as const,
  releases: ['admin', 'music', 'releases'] as const,
  tracks: ['admin', 'music', 'tracks'] as const,
  channels: ['admin', 'music', 'channels'] as const,
  videos: (query: string) => ['admin', 'music', 'videos', query] as const,
};

function imageForm(field: string, image: LocalMusicFile) {
  const form = new FormData();
  form.append(field, new File(image.uri));
  return form;
}

export const musicAPI = {
  overview: () => adminRequest<AdminMusicOverview>('/music/overview'),
  channels: async () => (await adminRequest<AdminMusicChannel[] | null>('/channels')) || [],
  artists: async () => (await adminRequest<AdminMusicArtist[] | null>('/music/artists')) || [],
  releases: async () => (await adminRequest<AdminMusicRelease[] | null>('/music/releases')) || [],
  tracks: async () => (await adminRequest<AdminMusicTrack[] | null>('/music/tracks')) || [],
  videos: async (query: string) => (await adminRequest<AdminMusicVideoOption[] | null>(`/videos?limit=12${query ? `&q=${encodeURIComponent(query)}` : ''}`)) || [],

  createArtist: (input: MusicArtistInput) => adminJSON<AdminMusicArtist>('POST', '/music/artists', input),
  updateArtist: (artistID: string, input: MusicArtistInput) => adminJSON<AdminMusicArtist>('PUT', `/music/artists/${id(artistID)}`, input),
  uploadArtistAvatar: (artistID: string, image: LocalMusicFile) => sendForm(`/admin/music/artists/${id(artistID)}/avatar`, imageForm('avatar', image)) as Promise<AdminMusicArtist>,
  deleteArtist: (artistID: string) => adminJSON<unknown>('DELETE', `/music/artists/${id(artistID)}`),

  createRelease: (input: MusicReleaseInput) => adminJSON<AdminMusicRelease>('POST', '/music/releases', input),
  updateRelease: (releaseID: string, input: MusicReleaseInput) => adminJSON<AdminMusicRelease>('PUT', `/music/releases/${id(releaseID)}`, input),
  uploadReleaseCover: (releaseID: string, image: LocalMusicFile) => sendForm(`/admin/music/releases/${id(releaseID)}/cover`, imageForm('cover', image)) as Promise<{ cover_url: string }>,
  coverFromTrack: (releaseID: string, trackID: string) => adminJSON<{ cover_url: string }>('POST', `/music/releases/${id(releaseID)}/cover/from-track`, { track_id: trackID }),
  publishRelease: (releaseID: string) => adminJSON<{ status: string }>('POST', `/music/releases/${id(releaseID)}/publish`),
  unpublishRelease: (releaseID: string) => adminJSON<{ status: string }>('POST', `/music/releases/${id(releaseID)}/unpublish`),
  deleteRelease: (releaseID: string) => adminJSON<unknown>('DELETE', `/music/releases/${id(releaseID)}`),

  createTrack: (input: MusicTrackInput) => adminJSON<AdminMusicTrack>('POST', '/music/tracks', input),
  updateTrack: (trackID: string, input: MusicTrackInput) => adminJSON<AdminMusicTrack>('PUT', `/music/tracks/${id(trackID)}`, input),
  syncLyrics: (trackID: string) => adminJSON<AdminMusicTrack>('POST', `/music/tracks/${id(trackID)}/lyrics/sync`),
  setVideo: (trackID: string, videoID: string) => adminJSON<{ video_id: string }>('POST', `/music/tracks/${id(trackID)}/video`, { video_id: videoID }),
  clearVideo: (trackID: string) => adminJSON<unknown>('DELETE', `/music/tracks/${id(trackID)}/video`),
  publishTrack: (trackID: string) => adminJSON<{ status: string }>('POST', `/music/tracks/${id(trackID)}/publish`),
  unpublishTrack: (trackID: string) => adminJSON<{ status: string }>('POST', `/music/tracks/${id(trackID)}/unpublish`),
  deleteTrack: (trackID: string) => adminJSON<unknown>('DELETE', `/music/tracks/${id(trackID)}`),

  /**
   * Same flow as the web: upload the master through the shared chunked
   * /videos/upload-chunk session, then ask the track to finalize it (the
   * server probes it and encodes the low/medium/high AAC qualities).
   * Progress is 0–100; the last 5% covers server-side processing.
   */
  uploadTrackAudio: async (trackID: string, audio: LocalMusicFile, onProgress?: (percent: number) => void) => {
    const { sessionID, fileName } = await uploadFileChunks(audio, (fraction) => onProgress?.(Math.min(95, Math.round(fraction * 95))));
    const form = new FormData();
    form.append('uploadSessionId', sessionID);
    form.append('fileName', fileName);
    const result = await sendForm(`/admin/music/tracks/${id(trackID)}/audio/finalize`, form);
    onProgress?.(100);
    return result as Partial<AdminMusicTrack>;
  },
};

/** Everything the music screens read; all lists load at once like the web page. */
export function useMusicCatalog() {
  const enabled = useIsAdmin();
  const overview = useQuery({ queryKey: musicKeys.overview, queryFn: musicAPI.overview, enabled });
  const artists = useQuery({ queryKey: musicKeys.artists, queryFn: musicAPI.artists, enabled });
  const releases = useQuery({ queryKey: musicKeys.releases, queryFn: musicAPI.releases, enabled });
  const tracks = useQuery({ queryKey: musicKeys.tracks, queryFn: musicAPI.tracks, enabled });
  const queries = [overview, artists, releases, tracks];
  return {
    overview: overview.data,
    artists: artists.data || [],
    releases: releases.data || [],
    tracks: tracks.data || [],
    loading: queries.some((query) => query.isLoading),
    error: queries.find((query) => query.error)?.error,
    refreshing: queries.some((query) => query.isRefetching),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

export function useMusicChannels() {
  return useQuery({ queryKey: musicKeys.channels, queryFn: musicAPI.channels, enabled: useIsAdmin() });
}

/** Refreshes the admin music lists and the public music views the app caches. */
export function useInvalidateMusic() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: musicKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['channel-music'] }),
    ]);
  }, [queryClient]);
}
