import { APIError } from '@/api/client';

import type { AdminMusicRelease, AdminMusicTrack, MusicReleaseType, MusicStatus } from './types';

type T = (source: string, values?: Record<string, string | number>) => string;

export const RELEASE_TYPES: MusicReleaseType[] = ['single', 'ep', 'album'];
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'];

export function releaseTypeLabel(t: T, type: string) {
  if (type === 'ep') return t('EP');
  if (type === 'album') return t('Album');
  return t('Single');
}

export function statusLabel(t: T, status: MusicStatus | string) {
  return status === 'published' ? t('Published') : t('Draft');
}

export function statusTone(status: MusicStatus | string) {
  return status === 'published' ? 'good' as const : 'neutral' as const;
}

export function releaseRightsReady(release?: AdminMusicRelease) {
  return Boolean(release && release.copyright_text && release.phonogram_text && release.territories && release.rights_confirmed);
}

/** Mirrors musicTrackPublishProblems on the server (and the web table). */
export function trackPublishProblems(t: T, track: AdminMusicTrack, release?: AdminMusicRelease) {
  return [
    !track.audio_url && t('audio'),
    (!track.audio_low_url || !track.audio_medium_url || !track.audio_high_url) && t('streaming qualities'),
    !release?.copyright_text && t('copyright line'),
    !release?.phonogram_text && t('phonogram line'),
    !release?.territories && t('territories'),
    !release?.rights_confirmed && t('rights confirmation'),
  ].filter((value): value is string => Boolean(value));
}

export function releaseRightsProblems(t: T, release: AdminMusicRelease) {
  return [
    !release.copyright_text && t('copyright line'),
    !release.phonogram_text && t('phonogram line'),
    !release.territories && t('territories'),
    !release.rights_confirmed && t('rights confirmation'),
  ].filter((value): value is string => Boolean(value));
}

export function audioFormatLabel(t: T, track: AdminMusicTrack) {
  if (!track.audio_codec) return t('Formats not generated');
  return [
    track.audio_codec.toUpperCase(),
    track.audio_sample_rate ? `${Math.round(track.audio_sample_rate / 100) / 10} kHz` : '',
    track.audio_bit_depth ? `${track.audio_bit_depth}-bit` : '',
    track.audio_lossless ? t('Lossless') : '',
  ].filter(Boolean).join(' · ');
}

export function lyricsStatusLabel(t: T, track: AdminMusicTrack) {
  if (track.synced_lyrics) return t('Timed lyrics');
  if (track.lyrics) return t('Plain lyrics');
  return t('Not synced');
}

export function lyricsTone(track: AdminMusicTrack) {
  if (track.synced_lyrics) return 'good' as const;
  if (track.lyrics) return 'info' as const;
  return 'neutral' as const;
}

export function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function sortTracks(tracks: AdminMusicTrack[]) {
  return [...tracks].sort((left, right) => left.disc_number - right.disc_number || left.track_number - right.track_number || left.title.localeCompare(right.title));
}

export function nextTrackNumber(tracks: AdminMusicTrack[], releaseID: string, discNumber = 1) {
  return Math.max(0, ...tracks.filter((track) => track.release_id === releaseID && track.disc_number === discNumber).map((track) => track.track_number)) + 1;
}

export function inferredTrackTitle(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base.replace(/^\s*(?:\d+[\s._-]+)+/, '').replace(/_+/g, ' ').trim() || base;
}

export function isAllowedAudio(fileName: string) {
  return AUDIO_EXTENSIONS.includes((fileName.split('.').pop() || '').toLowerCase());
}

export function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export function isValidDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** The server answers 409 with a generic sentence; add what the catalog says is missing. */
export function publishErrorMessage(t: T, error: unknown, problems: string[]) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof APIError && error.status === 409 && problems.length) return `${message}\n\n${t('Missing: {fields}', { fields: problems.join(', ') })}`;
  return message;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
