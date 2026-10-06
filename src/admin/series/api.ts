import type { QueryClient } from '@tanstack/react-query';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

import { adminForm, adminJSON, adminRequest } from '@/admin/api';
import { appendContentRating, type ContentRatingInput } from '@/admin/ContentRatingEditor';
import { apiRequest } from '@/api/client';
import { sendForm, uploadFileChunks } from '@/api/upload';

// Every series video (trailers + hidden episodes) is uploaded to this channel,
// the same constant the web admin uses.
export const GILTUBE_SERIES_CHANNEL_ID = '17e36c9d-4235-4c9c-9c70-1858e538719a';

export interface AdminSeries {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  genres: string[] | null;
  seasons: number;
  directors: string[] | null;
  cast: string[] | null;
  poster_url: string;
  backdrop_url: string;
  trailer_video_id: string;
  channel_id: string;
  is_featured: boolean;
  explicit: boolean;
  episode_count: number;
  content_rating?: { rating?: string; descriptors?: string[]; source?: string; tmdb_id?: number };
}

export interface AdminEpisodeVideo {
  id: string;
  title: string;
  status: string;
  hls_path: string;
  thumbnail_url: string;
  explicit?: boolean;
  original_filename?: string;
}

export interface AdminEpisode {
  id: string;
  series_id: string;
  video_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  synopsis: string;
  intro_start_seconds: number;
  intro_end_seconds: number;
  content_warning: boolean;
  video: AdminEpisodeVideo;
}

export interface AdminSeriesDetail {
  series: AdminSeries;
  episodes: AdminEpisode[] | null;
}

export interface MetadataEpisode { season_number: number; episode_number: number; title: string; synopsis: string }

export interface MetadataResult {
  source: string;
  source_id: string;
  title: string;
  synopsis: string;
  genre: string;
  genres: string[] | null;
  directors: string[] | null;
  cast: string[] | null;
  release_year: number;
  seasons: number;
  poster_url: string;
  backdrop_url: string;
  episodes?: MetadataEpisode[] | null;
}

export interface IntroDetectionStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  summary?: { seasons_analyzed: number; applied: number; suggested: number; unmatched: number } | null;
  error?: string;
}

export interface IntroSuggestion {
  id: string;
  episode_id: string;
  video_id: string;
  video_hls_path: string;
  series_id: string;
  series_title: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  username: string;
  intro_start_seconds: number;
  intro_end_seconds: number;
  current_intro_start_seconds: number;
  current_intro_end_seconds: number;
  note: string;
  source: string;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface SubtitleTrack { id: string; label: string; language: string; default: boolean; delay_ms: number }

export interface SeriesFormValues {
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  genres: string;
  seasons: number;
  directors: string;
  cast: string;
  isFeatured: boolean;
  explicit: boolean;
  posterUrl: string;
  backdropUrl: string;
  poster: DocumentPickerAsset | null;
  backdrop: DocumentPickerAsset | null;
}

export interface EpisodeDetails {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string;
  introStartSeconds: number;
  introEndSeconds: number;
}

export const seriesKeys = {
  list: ['admin', 'series', 'list'] as const,
  detail: (id: string) => ['admin', 'series', 'detail', id] as const,
  detection: (id: string) => ['admin', 'series', 'detect-intros', id] as const,
  suggestions: (status: string) => ['admin', 'series', 'intro-suggestions', status] as const,
};

/** Refreshes the admin series data plus every public series surface. */
export function invalidateSeries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin', 'series'] }),
    queryClient.invalidateQueries({ queryKey: ['series'] }),
    queryClient.invalidateQueries({ queryKey: ['series-detail'] }),
    queryClient.invalidateQueries({ queryKey: ['series-context'] }),
    queryClient.invalidateQueries({ queryKey: ['series-trailer-context'] }),
    queryClient.invalidateQueries({ queryKey: ['series-progress'] }),
  ]);
}

export const listToText = (value?: string[] | null) => (value || []).join(', ');

export function seriesFormFrom(item?: AdminSeries | null): SeriesFormValues {
  return {
    title: item?.title || '',
    slug: item?.slug || '',
    synopsis: item?.synopsis || '',
    genre: item?.genre || 'Drama',
    genres: listToText(item?.genres),
    seasons: item?.seasons || 1,
    directors: listToText(item?.directors),
    cast: listToText(item?.cast),
    isFeatured: !!item?.is_featured,
    explicit: !!item?.explicit,
    posterUrl: item?.poster_url || '',
    backdropUrl: item?.backdrop_url || '',
    poster: null,
    backdrop: null,
  };
}

function seriesFormData(values: SeriesFormValues, rating: ContentRatingInput) {
  const form = new FormData();
  form.append('title', values.title.trim());
  if (values.slug.trim()) form.append('slug', values.slug.trim());
  if (values.synopsis) form.append('synopsis', values.synopsis);
  if (values.genre) form.append('genre', values.genre);
  if (values.genres) form.append('genres', values.genres);
  if (values.seasons) form.append('seasons', String(values.seasons));
  if (values.directors) form.append('directors', values.directors);
  if (values.cast) form.append('cast', values.cast);
  form.append('channel_id', GILTUBE_SERIES_CHANNEL_ID);
  if (values.isFeatured) form.append('is_featured', 'true');
  form.append('explicit', values.explicit ? 'true' : 'false');
  if (values.posterUrl.trim()) form.append('poster_url', values.posterUrl.trim());
  if (values.backdropUrl.trim()) form.append('backdrop_url', values.backdropUrl.trim());
  // Expo's fetch accepts expo-file-system File objects as multipart parts.
  if (values.poster) form.append('poster', new File(values.poster.uri));
  if (values.backdrop) form.append('backdrop', new File(values.backdrop.uri));
  appendContentRating(form, rating);
  return form;
}

type SavedSeries = { id: string; slug: string; poster_url: string; backdrop_url: string };

export const seriesAPI = {
  list: () => apiRequest<{ series: AdminSeries[] }>('/series'),
  detail: (id: string) => adminRequest<AdminSeriesDetail>(`/series/${encodeURIComponent(id)}`),
  create: (values: SeriesFormValues, rating: ContentRatingInput) => adminForm<SavedSeries>('POST', '/series', seriesFormData(values, rating)),
  update: (id: string, values: SeriesFormValues, rating: ContentRatingInput) => adminForm<SavedSeries>('PUT', `/series/${encodeURIComponent(id)}`, seriesFormData(values, rating)),
  remove: (id: string) => adminJSON<{ message: string }>('DELETE', `/series/${encodeURIComponent(id)}`),
  setTrailer: (id: string, videoID: string) => adminJSON<{ message: string }>('POST', `/series/${encodeURIComponent(id)}/trailer`, { video_id: videoID }),
  addEpisode: (id: string, videoID: string, details: EpisodeDetails) => adminJSON<{ message: string }>('POST', `/series/${encodeURIComponent(id)}/episodes`, {
    video_id: videoID,
    season_number: details.seasonNumber,
    episode_number: details.episodeNumber,
    title: details.title,
    synopsis: details.synopsis,
    intro_start_seconds: details.introStartSeconds || 0,
    intro_end_seconds: details.introEndSeconds || 0,
  }),
  updateEpisode: (episodeID: string, details: EpisodeDetails, flags: { explicit?: boolean; contentWarning?: boolean } = {}) => adminJSON<{ message: string; episode?: AdminEpisode }>('PUT', `/series/episodes/${encodeURIComponent(episodeID)}`, {
    season_number: details.seasonNumber,
    episode_number: details.episodeNumber,
    title: details.title || '',
    synopsis: details.synopsis || '',
    intro_start_seconds: details.introStartSeconds || 0,
    intro_end_seconds: details.introEndSeconds || 0,
    ...(typeof flags.explicit === 'boolean' ? { explicit: flags.explicit } : {}),
    ...(typeof flags.contentWarning === 'boolean' ? { content_warning: flags.contentWarning } : {}),
  }),
  reorder: (id: string, episodes: { id: string; seasonNumber: number; episodeNumber: number }[], preserveSlotMetadata = true) => adminJSON<{ message: string }>('PUT', `/series/${encodeURIComponent(id)}/episodes/order`, {
    episodes: episodes.map((episode) => ({ id: episode.id, season_number: episode.seasonNumber, episode_number: episode.episodeNumber })),
    preserve_slot_metadata: preserveSlotMetadata,
  }),
  detection: (id: string) => adminRequest<IntroDetectionStatus>(`/series/${encodeURIComponent(id)}/detect-intros`),
  startDetection: (id: string) => adminJSON<IntroDetectionStatus>('POST', `/series/${encodeURIComponent(id)}/detect-intros`),
  episodeSubtitles: (episodeID: string) => adminRequest<{ subtitles: SubtitleTrack[] | null }>(`/series/episodes/${encodeURIComponent(episodeID)}/subtitles`),
  updateSubtitle: (episodeID: string, track: SubtitleTrack, delayMs: number) => {
    const form = new FormData();
    if (track.label) form.append('label', track.label);
    if (track.language) form.append('language', track.language);
    if (track.default) form.append('default', 'true');
    form.append('delay_ms', String(delayMs));
    return adminForm<{ subtitles: SubtitleTrack[] | null }>('PUT', `/series/episodes/${encodeURIComponent(episodeID)}/subtitles/${encodeURIComponent(track.id)}`, form);
  },
  searchMetadata: (query: string) => adminRequest<{ results: MetadataResult[] | null }>(`/metadata/search?type=series&query=${encodeURIComponent(query)}`),
  metadataDetails: (sourceID: string) => adminRequest<{ result: MetadataResult }>(`/metadata/details?type=series&source_id=${encodeURIComponent(sourceID)}`),
  introSuggestions: (status: string) => adminRequest<{ suggestions: IntroSuggestion[] | null }>(`/intro-suggestions?status=${encodeURIComponent(status)}`),
  reviewSuggestion: (id: string, action: 'approve' | 'reject') => adminJSON<{ status: string }>('POST', `/intro-suggestions/${encodeURIComponent(id)}/${action}`),
};

/**
 * Same flow as the web admin: chunked upload to /videos/upload-chunk, then
 * /videos/finalize-upload on the series channel. Returns the new video id.
 */
export async function uploadSeriesVideo(asset: DocumentPickerAsset, input: { title: string; description: string; hidden: boolean }, onProgress: (percent: number) => void) {
  const { sessionID, fileName } = await uploadFileChunks(asset, (fraction) => onProgress(Math.round(fraction * 95)));
  const form = new FormData();
  form.append('title', input.title);
  form.append('description', input.description);
  form.append('channel_id', GILTUBE_SERIES_CHANNEL_ID);
  form.append('uploadSessionId', sessionID);
  form.append('fileName', fileName);
  if (input.hidden) form.append('hidden', 'true');
  const result = await sendForm('/videos/finalize-upload', form) as { video_id?: string; id?: string; video?: { id?: string } } | null;
  onProgress(100);
  const videoID = result?.video_id || result?.id || result?.video?.id || '';
  if (!videoID) throw new Error('Upload finalized but no video id was returned');
  return videoID;
}

export function sortEpisodes(episodes: AdminEpisode[]) {
  return [...episodes].sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
}

export function episodeDetailsFrom(episode: AdminEpisode): EpisodeDetails {
  return {
    seasonNumber: episode.season_number || 1,
    episodeNumber: episode.episode_number || 1,
    title: episode.title || '',
    synopsis: episode.synopsis || '',
    introStartSeconds: episode.intro_start_seconds || 0,
    introEndSeconds: episode.intro_end_seconds || 0,
  };
}

/** m:ss.cc, matching the web admin's formatDuration. */
export function formatDuration(seconds: number) {
  const total = Math.max(0, seconds || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
