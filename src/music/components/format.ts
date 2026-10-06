import type { MusicFileQuality } from '@/music/quality';
import type { MusicRelease, MusicTrack } from '@/types/api';

type T = (source: string, values?: Record<string, string | number>) => string;

/** "3:07" */
export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "1 hr 4 min", "38 min 12 s", "45 s" */
export function formatLongDuration(seconds: number, t: T) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return `${t('{count} hr', { count: hours })} ${t('{count} min', { count: minutes })}`;
  if (minutes) return `${t('{count} min', { count: minutes })} ${t('{count} s', { count: rest })}`;
  return t('{count} s', { count: rest });
}

export function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function releaseTypeLabel(type: MusicRelease['release_type'] | string, t: T) {
  if (type === 'ep') return t('EP');
  if (type === 'album') return t('Album');
  return t('Single');
}

export function trackCountLabel(count: number, t: T) {
  return t(count === 1 ? '{count} track' : '{count} tracks', { count });
}

/** "Album · 9 tracks" */
export function releaseMeta(release: MusicRelease, t: T) {
  return `${releaseTypeLabel(release.release_type, t)} · ${trackCountLabel(release.track_count, t)}`;
}

/** Label for a downloaded / playing file quality. */
export function fileQualityLabel(quality: MusicFileQuality, lossless: boolean, t: T) {
  if (quality === 'master') return lossless ? t('Lossless') : t('Original');
  if (quality === 'high') return '320 kbps';
  if (quality === 'medium') return '256 kbps';
  return '128 kbps';
}

export function releaseYear(release: MusicRelease) {
  if (!release.release_date) return '';
  const year = new Date(release.release_date).getFullYear();
  return Number.isFinite(year) ? String(year) : '';
}

export function isLosslessRelease(release: MusicRelease, tracks: MusicTrack[] = []) {
  return Boolean(release.has_lossless_audio || release.max_audio_bit_depth || release.max_audio_sample_rate || tracks.some((track) => track.audio_lossless));
}

/** "24-bit · 96 kHz" when known. */
export function losslessSpecs(release: MusicRelease, tracks: MusicTrack[] = []) {
  const lossless = tracks.filter((track) => track.audio_lossless);
  const bitDepth = Number(release.max_audio_bit_depth || Math.max(0, ...lossless.map((track) => Number(track.audio_bit_depth || 0))));
  const sampleRate = Number(release.max_audio_sample_rate || Math.max(0, ...lossless.map((track) => Number(track.audio_sample_rate || 0))));
  const specs: string[] = [];
  if (bitDepth) specs.push(`${bitDepth}-bit`);
  if (sampleRate) {
    const khz = sampleRate / 1000;
    specs.push(`${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`);
  }
  return specs.join(' · ');
}

/** Download progress as 0–1 (accepts 0–1 or 0–100 values). */
export function progressFraction(progress: number) {
  const value = Number(progress) || 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

/** Tracks in disc / track order. */
export function sortTracks(tracks: MusicTrack[]) {
  return [...tracks].sort((a, b) => (a.disc_number || 1) - (b.disc_number || 1) || a.track_number - b.track_number);
}
