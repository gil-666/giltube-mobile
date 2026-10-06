import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { musicAPI } from '@/api/music';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { ArtistAvatar, LosslessBadge, MusicCover } from '@/music/components/Artwork';
import { formatLongDuration, isLosslessRelease, losslessSpecs, progressFraction, releaseTypeLabel, releaseYear, trackCountLabel } from '@/music/components/format';
import { musicKeys } from '@/music/components/hooks';
import { MusicBackBar, MusicState } from '@/music/components/ScreenParts';
import { TrackActionsSheet } from '@/music/components/TrackActionsSheet';
import { TrackRow } from '@/music/components/TrackRow';
import { useMusicDownloads } from '@/music/MusicDownloadsProvider';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { musicImage } from '@/music/quality';
import { useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { MusicRelease, MusicTrack } from '@/types/api';

export default function ReleaseScreen() {
  const styles = useStyles();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useI18n();
  const { contentInset } = useMiniPlayerLayout();
  const release = useQuery({ queryKey: musicKeys.release(slug), queryFn: () => musicAPI.release(slug), enabled: !!slug });
  const { current, playing, playQueue, togglePlay } = useMusicPlayer();
  const { getDownload, activity } = useMusicDownloads();
  const [sheetTrack, setSheetTrack] = useState<MusicTrack | null>(null);

  if (!release.data) {
    return <View style={styles.screen}>
      <MusicBackBar />
      {release.isLoading ? <MusicState kind="loading" /> : <MusicState kind="error" title={t('Release not found')} body={release.error?.message} onRetry={() => void release.refetch()} />}
    </View>;
  }

  const { release: info, tracks } = release.data;
  const playTrack = (index: number) => {
    if (current?.id === tracks[index]?.id) togglePlay();
    else playQueue(tracks, index);
  };

  return <View style={styles.screen}>
    <MusicBackBar overArtwork />
    <FlatList
      data={tracks}
      keyExtractor={(track) => track.id}
      contentContainerStyle={{ paddingBottom: contentInset + 12 }}
      refreshControl={<RefreshControl refreshing={release.isRefetching} onRefresh={() => void release.refetch()} tintColor={colors.accentBright} colors={[colors.accentBright]} />}
      ListHeaderComponent={<ReleaseHeader release={info} tracks={tracks} />}
      renderItem={({ item, index }) => <TrackRow
        track={item}
        number={item.track_number || index + 1}
        current={current?.id === item.id}
        playing={playing}
        downloaded={!!getDownload(item.id)}
        downloading={activity[item.id] && activity[item.id]!.status !== 'failed' ? progressFraction(activity[item.id]!.progress) : undefined}
        subtitle={item.artist_name !== info.artist_name ? item.artist_name : undefined}
        onPress={() => playTrack(index)}
        onMore={() => setSheetTrack(item)}
      />}
      ListEmptyComponent={<Text style={styles.noTracks}>{t('No tracks are available yet.')}</Text>}
      ListFooterComponent={<ReleaseFooter release={info} />}
    />
    <TrackActionsSheet track={sheetTrack} onClose={() => setSheetTrack(null)} hide={['release']} />
  </View>;
}

function ReleaseHeader({ release, tracks }: { release: MusicRelease; tracks: MusicTrack[] }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const { current, playing, playQueue, togglePlay } = useMusicPlayer();
  const isCurrent = !!current && current.release_id === release.id;
  const total = tracks.reduce((sum, track) => sum + Number(track.duration_seconds || 0), 0);
  const meta = [releaseYear(release), trackCountLabel(tracks.length, t), total ? formatLongDuration(total, t) : ''].filter(Boolean).join(' · ');
  const lossless = isLosslessRelease(release, tracks);
  const specs = losslessSpecs(release, tracks);
  const coverSize = Math.min(width - 110, 270);

  return <View>
    <View style={[styles.hero, { paddingTop: insets.top + 58 }]}>
      <Image source={musicImage(release.cover_url, 'sm')} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={45} />
      <LinearGradient colors={[withAlpha(colors.canvas, 0.3), withAlpha(colors.canvas, 0.78), colors.canvas]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.coverShadow, { width: coverSize }]}><MusicCover url={release.cover_url} size="lg" rounded={radii.lg} /></View>
      <Text style={styles.kind}>{releaseTypeLabel(release.release_type, t).toUpperCase()}</Text>
      <Text style={styles.title}>{release.title}</Text>
      <PressableScale accessibilityRole="link" onPress={() => router.push(`/music/artists/${release.artist_slug}`)} style={styles.byline}>
        <ArtistAvatar url={release.artist_avatar_url} name={release.artist_name} size={24} />
        <Text numberOfLines={1} style={styles.artist}>{release.artist_name}</Text>
      </PressableScale>
      {!!meta && <Text style={styles.meta}>{meta}</Text>}
      {lossless && <View style={styles.losslessRow}><LosslessBadge label={specs ? `${t('Lossless')} · ${specs}` : t('Lossless')} /></View>}
    </View>
    <View style={styles.actions}>
      <PressableScale disabled={!tracks.length} accessibilityRole="button" accessibilityLabel={t(isCurrent && playing ? 'Pause' : 'Play')} onPress={() => (isCurrent ? togglePlay() : playQueue(tracks, 0))} style={styles.play}>
        <Ionicons name={isCurrent && playing ? 'pause' : 'play'} size={26} color={colors.onAccent} style={isCurrent && playing ? undefined : styles.playIcon} />
      </PressableScale>
      <PressableScale disabled={!tracks.length} accessibilityRole="button" accessibilityLabel={t('Shuffle')} onPress={() => playQueue(tracks, Math.floor(Math.random() * tracks.length), { shuffle: true })} style={styles.secondary}>
        <Ionicons name="shuffle" size={19} color={colors.text} />
        <Text style={styles.secondaryText}>{t('Shuffle')}</Text>
      </PressableScale>
      <DownloadButton release={release} tracks={tracks} />
    </View>
  </View>;
}

/** Download the release, show progress, and offer removal when (partly) downloaded. */
function DownloadButton({ release, tracks }: { release: MusicRelease; tracks: MusicTrack[] }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { downloadTracks, removeRelease, getDownload, activity } = useMusicDownloads();
  const downloaded = tracks.filter((track) => getDownload(track.id)).length;
  const active = tracks.filter((track) => !getDownload(track.id) && activity[track.id] && activity[track.id]!.status !== 'failed');
  const failed = tracks.some((track) => activity[track.id]?.status === 'failed');
  const complete = tracks.length > 0 && downloaded === tracks.length;
  const progress = tracks.length ? (downloaded + active.reduce((sum, track) => sum + progressFraction(activity[track.id]!.progress), 0)) / tracks.length : 0;

  const confirmRemove = () => Alert.alert(t('Remove downloads?'), t('“{title}” will no longer play offline.', { title: release.title }), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Remove'), style: 'destructive', onPress: () => void removeRelease(release.id) },
  ]);
  const start = () => void downloadTracks(tracks).catch((error) => Alert.alert(t('Download failed'), error instanceof Error ? error.message : t('Please try again.')));
  const onPress = () => {
    if (complete) confirmRemove();
    else if (!active.length) start();
  };

  let icon: keyof typeof Ionicons.glyphMap = 'arrow-down-circle-outline';
  let label = t('Download');
  if (complete) { icon = 'checkmark-circle'; label = t('Downloaded'); }
  else if (active.length) { icon = 'cloud-download-outline'; label = `${Math.round(progress * 100)}%`; }
  else if (failed) { icon = 'refresh'; label = t('Retry'); }
  else if (downloaded) { label = `${downloaded}/${tracks.length}`; }

  return <PressableScale
    disabled={!tracks.length}
    accessibilityRole="button"
    accessibilityLabel={complete ? t('Downloaded. Tap to remove.') : t('Download release')}
    onPress={onPress}
    onLongPress={downloaded ? confirmRemove : undefined}
    style={[styles.secondary, complete && styles.downloaded]}
  >
    {active.length > 0 && <View style={[styles.downloadFill, { width: `${progress * 100}%` }]} />}
    <Ionicons name={icon} size={19} color={complete ? colors.success : colors.text} />
    <Text style={[styles.secondaryText, complete && styles.downloadedText]}>{label}</Text>
  </PressableScale>;
}

function ReleaseFooter({ release }: { release: MusicRelease }) {
  const styles = useStyles();
  const { t, dateTime } = useI18n();
  const date = release.release_date && Number.isFinite(new Date(release.release_date).getTime()) ? dateTime(release.release_date, { dateStyle: 'long', timeZone: 'UTC' }) : '';
  const lines = [date, release.label, release.copyright_text, release.phonogram_text].filter(Boolean) as string[];
  if (!lines.length && !release.territories) return null;
  return <View style={styles.footer}>
    {lines.map((line) => <Text key={line} style={styles.footerLine}>{line}</Text>)}
    {!!release.territories && <Text style={styles.footerLine}>{t('Available in: {territories}', { territories: release.territories })}</Text>}
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  hero: { alignItems: 'center', overflow: 'hidden', paddingHorizontal: 24, paddingBottom: 18 },
  coverShadow: { borderRadius: radii.lg, shadowColor: colors.black, shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
  kind: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginTop: 22 },
  title: { color: colors.text, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.7, textAlign: 'center', marginTop: 5 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, maxWidth: '100%' },
  artist: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 7, textAlign: 'center' },
  losslessRow: { marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright, shadowColor: colors.accentBright, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  playIcon: { marginLeft: 3 },
  secondary: { height: 44, paddingHorizontal: 16, borderRadius: radii.pill, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surfaceStrong },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  downloaded: { backgroundColor: withAlpha(colors.success, 0.14) },
  downloadedText: { color: colors.success },
  downloadFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: withAlpha(colors.success, 0.22) },
  noTracks: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
  footer: { gap: 4, paddingHorizontal: 18, paddingTop: 22 },
  footerLine: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
}));
