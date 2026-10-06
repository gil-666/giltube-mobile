import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { adminJSON, adminRequest, apiJSON } from '@/admin/api';
import { useIsAdmin } from '@/admin/ui';

import { isIngestActive } from './helpers';

import type { AudioJob, AudioSource, IngestMediaType, MediaIngest, PickerChannel, PickerEpisode, PickerMovie, PickerSeries, SeriesPreviewFile, SubtitleSource, TrackImportRequest, TrackImportResult, TranscodeAction, TranscodeJob } from './types';

export const ingestKeys = {
  list: ['admin', 'ingest', 'list'] as const,
  audioSources: (id: string) => ['admin', 'ingest', id, 'audio-sources'] as const,
  subtitleSources: (id: string) => ['admin', 'ingest', id, 'subtitle-sources'] as const,
  channels: ['admin', 'ingest', 'channels'] as const,
  series: ['admin', 'ingest', 'series'] as const,
  movies: ['admin', 'ingest', 'movies'] as const,
  episodes: (seriesID: string) => ['admin', 'ingest', 'episodes', seriesID] as const,
};

export const transcodeKeys = {
  list: (status: string) => ['admin', 'transcode', 'list', status] as const,
};

const enc = encodeURIComponent;

export async function listIngests() {
  const data = await adminRequest<{ items?: MediaIngest[] }>('/media-ingests');
  return data?.items ?? [];
}

export function createIngest(body: { media_type: IngestMediaType; title: string; year?: number; season_count?: number; source_url: string }) {
  return adminJSON<{ id: string; status: string }>('POST', '/media-ingests', body);
}

export function createUploadedIngest(body: { media_type: IngestMediaType; title?: string; year?: number; season_count?: number; files: { upload_id: string; file_name: string }[] }) {
  return adminJSON<{ id: string; status: string; file_count: number }>('POST', '/media-ingests/uploads', body);
}

export const retryIngest = (id: string) => adminJSON<{ status: string }>('POST', `/media-ingests/${enc(id)}/retry`);
export const pauseIngest = (id: string) => adminJSON<{ status: string }>('POST', `/media-ingests/${enc(id)}/pause`);
export const deleteIngest = (id: string) => adminJSON<{ message: string }>('DELETE', `/media-ingests/${enc(id)}`);
export const deleteIngestFiles = (id: string) => adminJSON<{ status: string }>('DELETE', `/media-ingests/${enc(id)}/files`);

export function attachIngest(id: string, body: { channel_id: string; title?: string; description?: string; file_path?: string; hidden?: boolean; series_id?: string; season_number?: number; episode_number?: number; episode_title?: string; episode_synopsis?: string }) {
  return adminJSON<Record<string, unknown>>('POST', `/media-ingests/${enc(id)}/attach`, body);
}

export function previewIngestSeries(id: string) {
  return adminRequest<{ season_count: number; files?: SeriesPreviewFile[] }>(`/media-ingests/${enc(id)}/series-preview`);
}

export function bulkAttachIngestSeries(id: string, body: { channel_id: string; title?: string; description?: string; hidden?: boolean; series_id?: string; episodes: { file_path: string; season_number: number; episode_number: number; episode_title?: string; episode_synopsis?: string }[] }) {
  return adminJSON<{ status: string; series_id: string; episode_count: number }>('POST', `/media-ingests/${enc(id)}/series-bulk-attach`, body);
}

export async function listAudioSources(id: string) {
  const data = await adminRequest<{ sources?: AudioSource[] }>(`/media-ingests/${enc(id)}/audio-sources`);
  return data?.sources ?? [];
}

export async function listSubtitleSources(id: string) {
  const data = await adminRequest<{ sources?: SubtitleSource[] }>(`/media-ingests/${enc(id)}/subtitle-sources`);
  return data?.sources ?? [];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Queues an audio extraction and polls its job until it finishes. `onStatus`
 * reports the job state; `isCancelled` lets the caller stop polling when the
 * screen goes away (the job keeps running on the server).
 */
export async function importAudioTrack(id: string, body: TrackImportRequest, onStatus?: (status: string) => void, isCancelled?: () => boolean): Promise<TrackImportResult> {
  const queued = await adminJSON<{ job_id?: string; status?: string } & TrackImportResult>('POST', `/media-ingests/${enc(id)}/audio-tracks`, body);
  const jobID = String(queued?.job_id || '');
  if (!jobID) return queued ?? {};
  onStatus?.(queued.status || 'queued');
  while (!isCancelled?.()) {
    await wait(1200);
    if (isCancelled?.()) break;
    const job = await adminRequest<AudioJob>(`/media-ingests/${enc(id)}/audio-jobs/${enc(jobID)}`);
    onStatus?.(job?.status || '');
    if (job?.status === 'completed') return job.result ?? {};
    if (job?.status === 'failed') throw new Error(job.error || 'Failed to extract audio.');
  }
  throw new Error('Stopped waiting for the audio extraction.');
}

export function importSubtitleTrack(id: string, body: TrackImportRequest) {
  return adminJSON<TrackImportResult>('POST', `/media-ingests/${enc(id)}/subtitle-tracks`, body);
}

export async function listTranscodeJobs(status: string) {
  const data = await adminRequest<{ items?: TranscodeJob[] }>(`/transcode-jobs?status=${enc(status)}`);
  return data?.items ?? [];
}

export function runTranscodeAction(videoID: string, action: TranscodeAction) {
  return adminJSON<Record<string, unknown>>('POST', `/transcode-jobs/${enc(videoID)}/${action}`);
}

/** The ingest list; polls every 8 s while this screen is focused and something is still moving. */
export function useIngestList() {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  return useQuery({
    queryKey: ingestKeys.list,
    queryFn: listIngests,
    enabled: isAdmin,
    refetchInterval: (query) => focused && query.state.data?.some(isIngestActive) ? 8000 : false,
  });
}

// Picker data shared by the ingest screens.
export function useIngestChannels(enabled = true) {
  return useQuery({ queryKey: ingestKeys.channels, enabled, queryFn: async () => (await adminRequest<PickerChannel[] | null>('/channels')) ?? [] });
}

export function useIngestSeriesList(enabled = true) {
  return useQuery({ queryKey: ingestKeys.series, enabled, queryFn: async () => (await apiJSON<{ series?: PickerSeries[] }>('GET', '/series'))?.series ?? [] });
}

export function useIngestMovies(enabled = true) {
  return useQuery({ queryKey: ingestKeys.movies, enabled, queryFn: async () => (await apiJSON<{ movies?: PickerMovie[] }>('GET', '/movies'))?.movies ?? [] });
}

export async function fetchSeriesEpisodes(seriesID: string) {
  const data = await apiJSON<{ episodes?: PickerEpisode[] }>('GET', `/series/${enc(seriesID)}`);
  return data?.episodes ?? [];
}

export function useIngestEpisodes(seriesID: string) {
  return useQuery({ queryKey: ingestKeys.episodes(seriesID), enabled: !!seriesID, queryFn: () => fetchSeriesEpisodes(seriesID) });
}
