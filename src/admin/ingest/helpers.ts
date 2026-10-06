import type { AudioStream, MediaIngest, PickerEpisode, SeriesPreviewFile, SubtitleStream, TrackSource } from './types';

type Translate = (source: string, values?: Record<string, string | number>) => string;
type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

// Rules mirror MediaIngestAdminPanel.vue so the phone offers the same actions.
export const isAttachableStatus = (status: string) => ['downloaded', 'paused', 'finished'].includes(status);
export const hasIngestPath = (item: MediaIngest) => Boolean(item.content_path || item.save_path);
export const canOpenAttach = (item: MediaIngest) => isAttachableStatus(item.status) && hasIngestPath(item);
export const canPreviewSeries = (item: MediaIngest) => item.media_type === 'series' && isAttachableStatus(item.status);
export const canUseAsTrackSource = (item: MediaIngest) => hasIngestPath(item) && !['queued', 'downloading'].includes(item.status);

export function canRetry(item: MediaIngest) {
  if (!item.attached_video_id) return ['failed', 'paused', 'queued'].includes(item.status);
  return item.status === 'failed' || item.video_status === 'failed';
}
export const canPause = (item: MediaIngest) => !item.attached_video_id && ['queued', 'downloading'].includes(item.status);
export const canDeleteFiles = (item: MediaIngest) => ['downloaded', 'finished'].includes(item.status) && (Boolean(item.qbittorrent_hash) || item.source_url.startsWith('upload://'));
export const canDelete = (item: MediaIngest) => !item.attached_video_id && !['attaching', 'transcoding', 'finished'].includes(item.status);

const activeStatuses = ['queued', 'downloading', 'attaching', 'transcoding'];
export const isIngestActive = (item: MediaIngest) => activeStatuses.includes(item.status) || ['processing', 'queued', 'transcoding'].includes(item.video_status);

export function displayProgress(item: MediaIngest) {
  if (item.status === 'finished') return 100;
  const download = Math.round((item.progress || 0) * 100);
  if (item.status === 'transcoding') return Math.max(0, Math.min(100, item.video_progress || download));
  return Math.max(0, Math.min(100, download));
}

export function ingestTone(status: string): Tone {
  switch (status) {
    case 'finished': return 'good';
    case 'transcoding':
    case 'attaching': return 'info';
    case 'failed': return 'bad';
    case 'paused': return 'warn';
    default: return 'neutral';
  }
}

export function ingestStatusLabel(t: Translate, status: string) {
  const labels: Record<string, string> = {
    queued: 'Queued', downloading: 'Downloading', downloaded: 'Downloaded', paused: 'Paused', attaching: 'Attaching',
    transcoding: 'Transcoding', finished: 'Finished', failed: 'Failed', files_deleted: 'Files deleted',
  };
  return labels[status] ? t(labels[status]) : status;
}

export function formatSpeed(bytesPerSecond: number) {
  if (!bytesPerSecond) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatEta(seconds: number) {
  if (!seconds || seconds < 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

export function audioStreamLabel(stream: AudioStream) {
  const language = stream.tags?.language || 'und';
  const title = stream.tags?.title || '';
  const rate = stream.sample_rate ? `${Math.round(Number(stream.sample_rate) / 1000)} kHz` : '';
  const layout = stream.channels ? `${stream.channels} ch` : '';
  return [`#${stream.index}`, title || language, stream.codec_name?.toUpperCase(), layout, rate].filter(Boolean).join(' · ');
}

export function subtitleStreamLabel(t: Translate, stream: SubtitleStream) {
  const language = stream.tags?.language || 'und';
  const title = stream.tags?.title || '';
  const flags = [stream.disposition?.forced ? t('Forced') : '', stream.disposition?.default ? t('Source default') : ''].filter(Boolean);
  return [`#${stream.index}`, title || language, stream.codec_name?.toUpperCase(), ...flags].filter(Boolean).join(' · ');
}

// ---- Series preview editing ----

/** Renumbers episodes 1..n inside each season, keeping the current order. */
export function normalizeSeriesPreview(files: SeriesPreviewFile[]) {
  const maxSeason = Math.max(1, ...files.map((file) => Number(file.season_number || 1)));
  const ordered: SeriesPreviewFile[] = [];
  for (let season = 1; season <= maxSeason; season += 1) {
    files.filter((file) => Number(file.season_number || 1) === season).forEach((file, index) => {
      ordered.push({ ...file, season_number: season, episode_number: index + 1 });
    });
  }
  return ordered;
}

export function moveSeriesPreviewFile(files: SeriesPreviewFile[], filePath: string, direction: -1 | 1) {
  const file = files.find((entry) => entry.file_path === filePath);
  if (!file) return files;
  const sameSeason = files.filter((entry) => Number(entry.season_number) === Number(file.season_number));
  const seasonIndex = sameSeason.findIndex((entry) => entry.file_path === filePath);
  const target = seasonIndex + direction;
  if (seasonIndex < 0 || target < 0 || target >= sameSeason.length) return files;
  const next = [...files];
  const currentIndex = next.findIndex((entry) => entry.file_path === filePath);
  const targetIndex = next.findIndex((entry) => entry.file_path === sameSeason[target].file_path);
  const [removed] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, removed);
  return normalizeSeriesPreview(next);
}

// ---- Bulk episode ↔ source linking ----

export type BulkMatchKind = 'number' | 'title' | 'order' | '';
export type BulkRowStatus = '' | 'importing' | 'done' | 'error';
export type BulkTrackRow = {
  targetId: string;
  targetTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  sourcePath: string;
  streamIndex: number;
  included: boolean;
  matchKind: BulkMatchKind;
  status: BulkRowStatus;
  error: string;
};

const normalizeLinkText = (value: string) => value
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function numberedSourceMatch(sourceName: string, episode: PickerEpisode) {
  const name = sourceName.replace(/\.[^.]+$/, '');
  const seasonEpisode = name.match(/(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?:[^a-z0-9]|$)/i)
    || name.match(/(?:^|[^0-9])(\d{1,2})x(\d{1,3})(?:[^0-9]|$)/i);
  if (seasonEpisode) {
    return Number(seasonEpisode[1]) === Number(episode.season_number) && Number(seasonEpisode[2]) === Number(episode.episode_number);
  }
  const episodeOnly = name.match(/(?:episode|episodio|capitulo|chapter|ep)[ ._-]*(\d{1,3})(?:[^0-9]|$)/i)
    || name.match(/^(\d{1,3})(?:[ ._-]|$)/);
  return Boolean(episodeOnly && Number(episodeOnly[1]) === Number(episode.episode_number));
}

/**
 * Guesses which source file belongs to each episode: SxxEyy / episode numbers
 * first, then the episode title, then plain order when the counts line up.
 * `twoWayTitle` matches the audio panel (either name may contain the other);
 * subtitles only accept a source name containing the episode title.
 */
export function inferBulkRows<S>(episodes: PickerEpisode[], sources: TrackSource<S & { index: number }>[], completed: string[], twoWayTitle: boolean): BulkTrackRow[] {
  const used = new Set<string>();
  const sorted = [...episodes].sort((a, b) => Number(a.season_number) - Number(b.season_number) || Number(a.episode_number) - Number(b.episode_number));
  return sorted.map((episode, episodeIndex) => {
    let source = sources.find((candidate) => !used.has(candidate.file_path) && numberedSourceMatch(candidate.relative_path, episode));
    let matchKind: BulkMatchKind = source ? 'number' : '';
    if (!source) {
      const episodeTitle = normalizeLinkText(String(episode.title || ''));
      if (episodeTitle.length >= 3) {
        source = sources.find((candidate) => {
          if (used.has(candidate.file_path)) return false;
          const sourceTitle = normalizeLinkText(candidate.relative_path);
          return sourceTitle.includes(episodeTitle) || (twoWayTitle && episodeTitle.includes(sourceTitle));
        });
        if (source) matchKind = 'title';
      }
    }
    if (!source && sources.length === sorted.length) {
      const ordered = sources[episodeIndex];
      if (ordered && !used.has(ordered.file_path)) { source = ordered; matchKind = 'order'; }
    }
    if (source) used.add(source.file_path);
    const done = Boolean(source && completed.includes(`${source.file_path}:${episode.id}`));
    return {
      targetId: episode.id,
      targetTitle: episode.title || `Episode ${episode.episode_number}`,
      seasonNumber: Number(episode.season_number || 1),
      episodeNumber: Number(episode.episode_number || 1),
      sourcePath: source?.file_path || '',
      streamIndex: source?.streams?.[0]?.index ?? -1,
      included: Boolean(source) && !done,
      matchKind,
      status: done ? 'done' : '',
      error: '',
    };
  });
}

export function bulkRowState(t: Translate, row: BulkTrackRow) {
  if (row.status === 'importing') return t('Importing…');
  if (row.status === 'done') return t('Done');
  if (row.status === 'error') return t('Failed');
  if (row.matchKind === 'number') return t('Matched by episode number');
  if (row.matchKind === 'title') return t('Matched by title');
  if (row.matchKind === 'order') return t('Matched by order');
  return t('No match — choose a file');
}

export const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) ? error.message : fallback;
