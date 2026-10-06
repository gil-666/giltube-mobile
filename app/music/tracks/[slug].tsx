import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { musicAPI } from '@/api/music';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { ExplicitBadge, LosslessBadge, MusicCover } from '@/music/components/Artwork';
import { formatDuration, progressFraction } from '@/music/components/format';
import { musicKeys, notify } from '@/music/components/hooks';
import { MusicBackBar, MusicState } from '@/music/components/ScreenParts';
import { useMusicDownloads } from '@/music/MusicDownloadsProvider';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { musicImage } from '@/music/quality';
import { openVideo } from '@/player/navigation';
import { useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { MusicTrack } from '@/types/api';

export default function TrackScreen() {
  const styles = useStyles();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useI18n();
  const { contentInset } = useMiniPlayerLayout();
  const track = useQuery({ queryKey: musicKeys.track(slug), queryFn: () => musicAPI.track(slug), enabled: !!slug });

  if (!track.data) {
    return <View style={styles.screen}>
      <MusicBackBar />
      {track.isLoading ? <MusicState kind="loading" /> : <MusicState kind="error" title={t('Track not found')} body={track.error?.message} onRetry={() => void track.refetch()} />}
    </View>;
  }

  return <View style={styles.screen}>
    <MusicBackBar overArtwork />
    <ScrollView
      contentContainerStyle={{ paddingBottom: contentInset + 12 }}
      refreshControl={<RefreshControl refreshing={track.isRefetching} onRefresh={() => void track.refetch()} tintColor={colors.accentBright} colors={[colors.accentBright]} />}
    >
      <TrackDetails track={track.data.track} />
    </ScrollView>
  </View>;
}

function TrackDetails({ track }: { track: MusicTrack }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const { current, playing, playQueue, togglePlay, addToQueue } = useMusicPlayer();
  const { downloadTracks, remove, getDownload, activity } = useMusicDownloads();
  const isCurrent = current?.id === track.id;
  const downloaded = !!getDownload(track.id);
  const pending = activity[track.id];
  const downloading = !downloaded && !!pending && pending.status !== 'failed';
  const coverSize = Math.min(width - 130, 250);

  const toggleDownload = () => {
    if (downloaded) {
      Alert.alert(t('Remove download?'), t('“{title}” will no longer play offline.', { title: track.title }), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Remove'), style: 'destructive', onPress: () => void remove(track.id) },
      ]);
    } else if (!downloading) {
      void downloadTracks([track]).catch((error) => Alert.alert(t('Download failed'), error instanceof Error ? error.message : t('Please try again.')));
    }
  };

  const details: [string, string | undefined][] = [
    [t('Release'), track.release_title],
    [t('Duration'), formatDuration(track.duration_seconds)],
    [t('Track'), track.disc_number > 1 ? `${track.disc_number}-${track.track_number}` : String(track.track_number || '')],
    [t('Language'), track.language],
    ['ISRC', track.isrc],
    [t('Record label'), track.release_label],
    [t('Copyright'), track.release_copyright_text],
    [t('Recording copyright'), track.release_phonogram_text],
    [t('Available territories'), track.release_territories],
  ];

  return <View>
    <View style={[styles.hero, { paddingTop: insets.top + 58 }]}>
      <Image source={musicImage(track.cover_url, 'sm')} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={45} />
      <LinearGradient colors={[withAlpha(colors.canvas, 0.3), withAlpha(colors.canvas, 0.78), colors.canvas]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <PressableScale accessibilityRole="link" accessibilityLabel={track.release_title} onPress={() => router.push(`/music/releases/${track.release_slug}`)} style={[styles.coverShadow, { width: coverSize }]}>
        <MusicCover url={track.cover_url} size="md" rounded={radii.lg} />
      </PressableScale>
      <Text style={styles.kind}>{t('TRACK')}</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{track.title}</Text>
        {track.explicit && <ExplicitBadge />}
      </View>
      <PressableScale accessibilityRole="link" onPress={() => router.push(`/music/artists/${track.artist_slug}`)}><Text numberOfLines={1} style={styles.artist}>{track.artist_name}</Text></PressableScale>
      <PressableScale accessibilityRole="link" onPress={() => router.push(`/music/releases/${track.release_slug}`)} style={styles.albumLink}>
        <Ionicons name="disc-outline" size={14} color={colors.highlight} />
        <Text numberOfLines={1} style={styles.albumText}>{track.release_title}</Text>
      </PressableScale>
      {track.audio_lossless && <View style={styles.losslessRow}><LosslessBadge label={t('Lossless')} compact /></View>}
    </View>

    <View style={styles.actions}>
      <PressableScale accessibilityRole="button" accessibilityLabel={t(isCurrent && playing ? 'Pause' : 'Play')} onPress={() => (isCurrent ? togglePlay() : playQueue([track], 0))} style={styles.play}>
        <Ionicons name={isCurrent && playing ? 'pause' : 'play'} size={26} color={colors.onAccent} style={isCurrent && playing ? undefined : styles.playIcon} />
      </PressableScale>
      <Action icon="list-outline" label={t('Queue')} onPress={() => notify(addToQueue(track) ? t('{title} was added to the queue.', { title: track.title }) : t('{title} is already in the queue.', { title: track.title }))} />
      <Action
        icon={downloaded ? 'checkmark-circle' : downloading ? 'cloud-download-outline' : 'arrow-down-circle-outline'}
        label={downloaded ? t('Downloaded') : downloading ? `${Math.round(progressFraction(pending!.progress) * 100)}%` : t('Download')}
        active={downloaded}
        onPress={toggleDownload}
      />
      {!!track.official_video_id && <Action icon="videocam-outline" label={t('Video')} onPress={() => openVideo(track.official_video_id!)} />}
    </View>

    <View style={styles.details}>
      {details.filter(([, value]) => !!value).map(([label, value]) => <View key={label} style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>)}
    </View>
  </View>;
}

function Action({ icon, label, onPress, active = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  const styles = useStyles();
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.action, active && styles.actionActive]}>
    <Ionicons name={icon} size={19} color={active ? colors.success : colors.text} />
    <Text numberOfLines={1} style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text>
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  hero: { alignItems: 'center', overflow: 'hidden', paddingHorizontal: 24, paddingBottom: 18 },
  coverShadow: { borderRadius: radii.lg, shadowColor: colors.black, shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
  kind: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginTop: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, maxWidth: '100%' },
  title: { flexShrink: 1, color: colors.text, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center' },
  artist: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 6 },
  albumLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, maxWidth: '100%' },
  albumText: { color: colors.highlight, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  losslessRow: { marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright },
  playIcon: { marginLeft: 3 },
  action: { height: 42, paddingHorizontal: 14, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceStrong },
  actionActive: { backgroundColor: withAlpha(colors.success, 0.14) },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  actionTextActive: { color: colors.success },
  details: { marginHorizontal: 18, marginTop: 18, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 },
  detailRow: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  detailValue: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 3 },
}));
