import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { useMusicDownloads } from '@/music/MusicDownloadsProvider';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { openVideo } from '@/player/navigation';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { MusicTrack } from '@/types/api';

import { MusicCover } from './Artwork';
import { notify } from './hooks';

type Destination = 'track' | 'release' | 'artist';

/**
 * Actions for one track: play next, add to queue, download / remove download,
 * go to track / release / artist, watch the official video.
 */
export function TrackActionsSheet({ track, onClose, hide = [] }: { track: MusicTrack | null; onClose: () => void; hide?: Destination[] }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { playNext, addToQueue } = useMusicPlayer();
  const { downloadTracks, remove, getDownload, activity } = useMusicDownloads();
  const downloaded = track ? !!getDownload(track.id) : false;
  const pending = track ? activity[track.id] : undefined;

  const run = (action: () => void) => () => { onClose(); action(); };
  const go = (path: string) => run(() => router.push(path as never));

  return <SwipeSheet visible={!!track} title={t('Track')} onClose={onClose}>
    {!!track && <>
      <View style={styles.header}>
        <MusicCover url={track.cover_url} size="sm" style={styles.cover} />
        <View style={styles.headerCopy}>
          <Text numberOfLines={2} style={styles.title}>{track.title}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>{track.artist_name} · {track.release_title}</Text>
        </View>
      </View>
      <Action icon="return-down-forward-outline" label={t('Play next')} onPress={run(() => { playNext(track); notify(t('{title} will play next.', { title: track.title })); })} />
      <Action icon="list-outline" label={t('Add to queue')} onPress={run(() => { notify(addToQueue(track) ? t('{title} was added to the queue.', { title: track.title }) : t('{title} is already in the queue.', { title: track.title })); })} />
      {downloaded
        ? <Action icon="trash-outline" label={t('Remove download')} onPress={run(() => setTimeout(() => Alert.alert(t('Remove download?'), t('“{title}” will no longer play offline.', { title: track.title }), [{ text: t('Cancel'), style: 'cancel' }, { text: t('Remove'), style: 'destructive', onPress: () => void remove(track.id) }]), 350))} />
        : pending && pending.status !== 'failed'
          ? <Action icon="cloud-download-outline" label={t('Downloading…')} disabled onPress={() => undefined} />
          : <Action icon="arrow-down-circle-outline" label={pending?.status === 'failed' ? t('Retry download') : t('Download')} onPress={run(() => { void downloadTracks([track]).catch((error) => Alert.alert(t('Download failed'), error instanceof Error ? error.message : t('Please try again.'))); })} />}
      {!!track.official_video_id && <Action icon="videocam-outline" label={t('Watch video')} onPress={run(() => openVideo(track.official_video_id!))} />}
      {!hide.includes('track') && <Action icon="musical-note-outline" label={t('Go to track')} onPress={go(`/music/tracks/${track.slug}`)} />}
      {!hide.includes('release') && !!track.release_slug && <Action icon="disc-outline" label={t('Go to release')} onPress={go(`/music/releases/${track.release_slug}`)} />}
      {!hide.includes('artist') && !!track.artist_slug && <Action icon="person-outline" label={t('Go to artist')} onPress={go(`/music/artists/${track.artist_slug}`)} />}
    </>}
  </SwipeSheet>;
}

function Action({ icon, label, onPress, disabled = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  return <PressableScale disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}>
    <Ionicons name={icon} size={21} color={colors.text} />
    <Text style={styles.actionLabel}>{label}</Text>
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  cover: { width: 52, height: 52, borderRadius: radii.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  action: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
}));
