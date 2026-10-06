import { mediaOrigin } from '@/config/environment';
import type { MusicTrack } from '@/types/api';

// The account's music quality (users.music_quality, from /account/me) is only
// a preference: the client picks the file. The same choice is used for
// streaming and for downloads.

export type MusicQualityPreference = 'auto' | 'low' | 'medium' | 'high' | 'maximum';
export type MusicFileQuality = 'low' | 'medium' | 'high' | 'master';

export const MUSIC_QUALITY_PREFERENCES: MusicQualityPreference[] = ['auto', 'low', 'medium', 'high', 'maximum'];

export function normalizeMusicQuality(value: unknown): MusicQualityPreference {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (MUSIC_QUALITY_PREFERENCES as string[]).includes(text) ? text as MusicQualityPreference : 'auto';
}

/**
 * The file quality to use. "auto" has no connection signal in the app, so it
 * means High (320 kbps AAC); "maximum" means the original master (lossless when
 * the upload was).
 */
export function fileQualityFor(preference: MusicQualityPreference): MusicFileQuality {
  switch (preference) {
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'maximum': return 'master';
    default: return 'high';
  }
}

const FALLBACKS: Record<MusicFileQuality, MusicFileQuality[]> = {
  master: ['master', 'high', 'medium', 'low'],
  high: ['high', 'medium', 'low', 'master'],
  medium: ['medium', 'high', 'low', 'master'],
  low: ['low', 'medium', 'high', 'master'],
};

const pathFor = (track: MusicTrack, quality: MusicFileQuality) => ({
  master: track.audio_url,
  high: track.audio_high_url,
  medium: track.audio_medium_url,
  low: track.audio_low_url,
}[quality] || '');

const absolute = (path: string) => (/^https?:\/\//i.test(path) ? path : `${mediaOrigin}${path.startsWith('/') ? '' : '/'}${path}`);

export interface MusicSource {
  url: string;
  quality: MusicFileQuality;
  /** True when this file is the lossless master. */
  lossless: boolean;
  /** File extension for downloads, e.g. "m4a" or "flac". */
  extension: string;
}

/** The best available file for a track at the wanted quality (with fallbacks), or null. */
export function musicSource(track: MusicTrack, wanted: MusicFileQuality): MusicSource | null {
  for (const quality of FALLBACKS[wanted]) {
    const path = pathFor(track, quality);
    if (!path) continue;
    const extension = (path.split('?')[0]!.match(/\.([a-z0-9]+)$/i)?.[1] || 'm4a').toLowerCase();
    return { url: absolute(path), quality, lossless: quality === 'master' && !!track.audio_lossless, extension };
  }
  return null;
}

/** Absolute URL for a release cover / artist image at a size variant (sm, md or lg). */
export function musicImage(url: string | undefined, size: 'sm' | 'md' | 'lg' = 'md'): string {
  if (!url) return '';
  return absolute(url.replace(/_(sm|md|lg)\.jpg/, `_${size}.jpg`));
}
