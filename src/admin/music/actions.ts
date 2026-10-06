import { musicAPI } from './api';
import { trackPublishProblems } from './helpers';
import type { AdminMusicRelease, AdminMusicTrack } from './types';

type T = (source: string, values?: Record<string, string | number>) => string;

/** LRCLIB sync for every track of a release; tracks without a match are counted, not fatal (web parity). */
export async function syncReleaseLyrics(tracks: AdminMusicTrack[], onTrack?: (trackID: string) => void) {
  let synced = 0;
  let missing = 0;
  for (const track of tracks) {
    onTrack?.(track.id);
    try {
      await musicAPI.syncLyrics(track.id);
      synced += 1;
    } catch {
      missing += 1;
    }
  }
  return { synced, missing };
}

export function syncSummary(t: T, title: string, result: { synced: number; missing: number }) {
  const base = t('Synced lyrics for {count} tracks on {title}.', { count: result.synced, title });
  return result.missing ? `${base} ${t('{count} not found.', { count: result.missing })}` : base;
}

/** Problems that block publishing a whole release (rights + every track). */
export function releasePublishProblems(t: T, release: AdminMusicRelease, tracks: AdminMusicTrack[]) {
  const releaseTracks = tracks.filter((track) => track.release_id === release.id);
  if (!releaseTracks.length) return [t('add at least one track')];
  const problems = new Set<string>();
  releaseTracks.forEach((track) => trackPublishProblems(t, track, release).forEach((problem) => problems.add(problem)));
  return [...problems];
}
