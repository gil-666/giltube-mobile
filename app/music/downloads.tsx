import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { MusicCover, QualityChip } from '@/music/components/Artwork';
import { fileQualityLabel, formatBytes, trackCountLabel } from '@/music/components/format';
import { MusicQualityPicker } from '@/music/components/MusicQualityPicker';
import { MusicBackBar } from '@/music/components/ScreenParts';
import { TrackActionsSheet } from '@/music/components/TrackActionsSheet';
import { TrackRow } from '@/music/components/TrackRow';
import { useMusicDownloads, type MusicDownload } from '@/music/MusicDownloadsProvider';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { MusicTrack } from '@/types/api';

interface ReleaseGroup { releaseID: string; title: string; slug: string; artist: string; cover: string; items: MusicDownload[]; bytes: number }

export default function MusicDownloadsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { contentInset } = useMiniPlayerLayout();
  const { downloads, totalBytes, removeRelease, activity } = useMusicDownloads();
  const { current, playing, playQueue } = useMusicPlayer();
  const [sheetTrack, setSheetTrack] = useState<MusicTrack | null>(null);

  // Grouped by release (most recently downloaded release first), tracks in album order.
  const groups = useMemo(() => {
    const byRelease = new Map<string, ReleaseGroup>();
    downloads.forEach((download) => {
      const { track } = download;
      const group = byRelease.get(track.release_id) || { releaseID: track.release_id, title: track.release_title, slug: track.release_slug, artist: track.artist_name, cover: track.cover_url, items: [], bytes: 0 };
      group.items.push(download);
      group.bytes += download.bytes || 0;
      byRelease.set(track.release_id, group);
    });
    return [...byRelease.values()].map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => (a.track.disc_number || 1) - (b.track.disc_number || 1) || a.track.track_number - b.track.track_number),
    }));
  }, [downloads]);
  const allTracks = useMemo(() => groups.flatMap((group) => group.items.map((item) => item.track)), [groups]);
  const inProgress = Object.values(activity).filter((item) => item.status !== 'failed').length;

  const confirmRemoveRelease = (group: ReleaseGroup) => Alert.alert(t('Remove downloads?'), t('“{title}” will no longer play offline.', { title: group.title }), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Remove'), style: 'destructive', onPress: () => void removeRelease(group.releaseID) },
  ]);
  const confirmRemoveAll = () => Alert.alert(t('Remove all music downloads?'), t('This frees {size} on this device.', { size: formatBytes(totalBytes) }), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Remove all'), style: 'destructive', onPress: () => void Promise.all(groups.map((group) => removeRelease(group.releaseID))) },
  ]);

  return <View style={styles.screen}>
    <MusicBackBar />
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: contentInset + 12 }}>
      <Text style={styles.heading}>{t('Music downloads')}</Text>
      <Text style={styles.subheading}>{t('Downloaded music plays without a connection.')}</Text>

      {downloads.length > 0 ? <View style={styles.summary}>
        <View style={styles.summaryStats}>
          <View style={styles.storageIcon}><Ionicons name="phone-portrait-outline" size={20} color={colors.success} /></View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{formatBytes(totalBytes)}</Text>
            <Text style={styles.summaryMeta}>{trackCountLabel(downloads.length, t)} · {t(groups.length === 1 ? '{count} release' : '{count} releases', { count: groups.length })}{inProgress ? ` · ${t('{count} downloading', { count: inProgress })}` : ''}</Text>
          </View>
        </View>
        <View style={styles.summaryActions}>
          <PressableScale accessibilityRole="button" onPress={() => playQueue(allTracks, 0)} style={styles.play}>
            <Ionicons name="play" size={18} color={colors.onAccent} />
            <Text style={styles.playText}>{t('Play all')}</Text>
          </PressableScale>
          <PressableScale accessibilityRole="button" onPress={() => playQueue(allTracks, Math.floor(Math.random() * allTracks.length), { shuffle: true })} style={styles.secondary}>
            <Ionicons name="shuffle" size={18} color={colors.text} />
            <Text style={styles.secondaryText}>{t('Shuffle')}</Text>
          </PressableScale>
          <PressableScale accessibilityRole="button" accessibilityLabel={t('Remove all')} onPress={confirmRemoveAll} style={styles.iconButton}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </PressableScale>
        </View>
      </View> : <View style={styles.empty}>
        <View style={styles.emptyIcon}><Ionicons name="arrow-down-circle-outline" size={28} color={colors.accentBright} /></View>
        <Text style={styles.emptyTitle}>{inProgress ? t('Downloading…') : t('No music downloaded yet')}</Text>
        <Text style={styles.emptyBody}>{t('Open an album or track and tap Download to listen offline.')}</Text>
        <PressableScale onPress={() => router.push('/music')} style={styles.browse}><Text style={styles.browseText}>{t('Browse music')}</Text></PressableScale>
      </View>}

      {groups.map((group) => {
        const qualities = [...new Set(group.items.map((item) => fileQualityLabel(item.quality, item.lossless, t)))];
        const tracks = group.items.map((item) => item.track);
        return <View key={group.releaseID} style={styles.group}>
          <View style={styles.groupHeader}>
            <PressableScale accessibilityRole="link" onPress={() => router.push(`/music/releases/${group.slug}`)} style={styles.groupLink}>
              <MusicCover url={group.cover} size="sm" style={styles.groupCover} />
              <View style={styles.groupCopy}>
                <Text numberOfLines={1} style={styles.groupTitle}>{group.title}</Text>
                <Text numberOfLines={1} style={styles.groupMeta}>{group.artist} · {trackCountLabel(group.items.length, t)} · {formatBytes(group.bytes)}</Text>
                <View style={styles.chips}>{qualities.map((label) => <QualityChip key={label} label={label} highlight={label === t('Lossless')} />)}</View>
              </View>
            </PressableScale>
            <PressableScale accessibilityRole="button" accessibilityLabel={t('Remove downloads')} onPress={() => confirmRemoveRelease(group)} style={styles.iconButton}>
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </PressableScale>
          </View>
          {group.items.map((item, index) => <TrackRow
            key={item.track.id}
            track={item.track}
            number={item.track.track_number || index + 1}
            current={current?.id === item.track.id}
            playing={playing}
            downloaded
            subtitle={`${item.track.artist_name} · ${formatBytes(item.bytes)}`}
            onPress={() => playQueue(tracks, index)}
            onMore={() => setSheetTrack(item.track)}
          />)}
        </View>;
      })}

      <View style={styles.quality}>
        <Text style={styles.qualityNote}>{t('Downloads use the music quality from your account settings. Higher quality takes more space.')}</Text>
        <MusicQualityPicker />
      </View>
    </ScrollView>
    <TrackActionsSheet track={sheetTrack} onClose={() => setSheetTrack(null)} />
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  heading: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1, paddingHorizontal: 18 },
  subheading: { color: colors.textMuted, fontSize: 13, marginTop: 4, paddingHorizontal: 18 },
  summary: { marginHorizontal: 16, marginTop: 18, padding: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  summaryStats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storageIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.success, 0.12) },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  summaryMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  summaryActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  play: { flex: 1, height: 42, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accentBright },
  playText: { color: colors.onAccent, fontSize: 14, fontWeight: '900' },
  secondary: { flex: 1, height: 42, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surfaceStrong },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  empty: { alignItems: 'center', marginHorizontal: 16, marginTop: 18, paddingVertical: 28, paddingHorizontal: 20, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.accentBright, 0.12) },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 12 },
  emptyBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5, textAlign: 'center' },
  browse: { marginTop: 16, height: 40, paddingHorizontal: 20, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: colors.accentBright },
  browseText: { color: colors.onAccent, fontSize: 13, fontWeight: '900' },
  group: { marginTop: 22 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 6 },
  groupLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupCover: { width: 60, height: 60, borderRadius: radii.sm },
  groupCopy: { flex: 1, minWidth: 0 },
  groupTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  groupMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  chips: { flexDirection: 'row', gap: 5, marginTop: 6 },
  quality: { marginHorizontal: 16, marginTop: 30, gap: 10 },
  qualityNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
}));
