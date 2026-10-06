import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';

import { musicAPI } from '@/api/music';
import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import type { MusicRelease } from '@/types/api';

/** Shared react-query keys for the music catalog. */
export const musicKeys = {
  home: ['music-home'] as const,
  release: (slug: string) => ['music-release', slug] as const,
  artist: (slug: string) => ['music-artist', slug] as const,
  track: (slug: string) => ['music-track', slug] as const,
};

/** Loads a release's tracks (cached) and plays them. `busyID` is the release being loaded. */
export function usePlayRelease() {
  const client = useQueryClient();
  const { playQueue } = useMusicPlayer();
  const { t } = useI18n();
  const [busyID, setBusyID] = useState('');
  const playRelease = useCallback(async (release: Pick<MusicRelease, 'id' | 'slug'>, options?: { shuffle?: boolean }) => {
    setBusyID(release.id);
    try {
      const data = await client.fetchQuery({ queryKey: musicKeys.release(release.slug), queryFn: () => musicAPI.release(release.slug), staleTime: 60_000 });
      if (data.tracks.length) playQueue(data.tracks, options?.shuffle ? Math.floor(Math.random() * data.tracks.length) : 0, options);
    } catch (error) {
      Alert.alert(t('Couldn’t play this release'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusyID('');
    }
  }, [client, playQueue, t]);
  return { playRelease, busyID };
}

/**
 * For release tiles: play a release, or toggle play/pause when it's already the
 * current one. `isPlaying(release)` tells a tile to show a pause icon.
 */
export function useReleaseTilePlayback() {
  const { playRelease, busyID } = usePlayRelease();
  const { current, playing, togglePlay } = useMusicPlayer();
  const onPlay = useCallback((release: MusicRelease) => {
    if (current?.release_id === release.id) togglePlay();
    else void playRelease(release);
  }, [current?.release_id, playRelease, togglePlay]);
  const isPlaying = (release: MusicRelease) => playing && current?.release_id === release.id;
  return { onPlay, isPlaying, busyID };
}

/** A short confirmation (toast on Android; silent on iOS where there is no toast). */
export function notify(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
}
