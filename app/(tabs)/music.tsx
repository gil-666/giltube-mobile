import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { musicAPI } from '@/api/music';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { ArtistAvatar, LosslessBadge, MusicCover } from '@/music/components/Artwork';
import { formatBytes, releaseMeta, trackCountLabel } from '@/music/components/format';
import { musicKeys, usePlayRelease, useReleaseTilePlayback } from '@/music/components/hooks';
import { ReleaseTile } from '@/music/components/ReleaseTile';
import { MusicIconButton, MusicState } from '@/music/components/ScreenParts';
import { Shelf, ShelfSkeleton, SkeletonBlock } from '@/music/components/Shelf';
import { useMusicDownloads } from '@/music/MusicDownloadsProvider';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { musicImage } from '@/music/quality';
import { useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import { useSiteTheme } from '@/theme/ThemeProvider';
import type { MusicArtist, MusicRelease } from '@/types/api';

const LOGO_LIGHT_TEXT = require('../../assets/images/giltube-music-logo-full.png');
const LOGO_DARK_TEXT = require('../../assets/images/giltube-music-logo-full-dark.png');

export default function MusicHomeScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { scheme } = useSiteTheme();
  const { contentInset } = useMiniPlayerLayout();
  const { downloads, totalBytes } = useMusicDownloads();
  const home = useQuery({ queryKey: musicKeys.home, queryFn: musicAPI.home });
  const tiles = useReleaseTilePlayback();

  const releases = useMemo(() => home.data?.releases || [], [home.data?.releases]);
  const artists = useMemo(() => home.data?.artists || [], [home.data?.artists]);
  const newest = releases[0];
  const artistShelves = useMemo(() => {
    const byArtist = new Map<string, MusicRelease[]>();
    releases.forEach((release) => byArtist.set(release.artist_id, [...(byArtist.get(release.artist_id) || []), release]));
    return artists
      .map((artist) => ({ artist, releases: byArtist.get(artist.id) || [] }))
      .filter((shelf) => shelf.releases.length > 0);
  }, [artists, releases]);

  const releaseTile = (release: MusicRelease, showArtist = true) => <ReleaseTile key={release.id} release={release} showArtist={showArtist} onPlay={tiles.onPlay} busy={tiles.busyID === release.id} playing={tiles.isPlaying(release)} />;

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <Image source={scheme === 'light' ? LOGO_DARK_TEXT : LOGO_LIGHT_TEXT} style={styles.logo} contentFit="contain" accessibilityLabel="GilTube Music" />
      <View style={styles.headerActions}>
        <MusicIconButton icon="arrow-down-circle-outline" label={t('Music downloads')} onPress={() => router.push('/music/downloads')} />
        <MusicIconButton icon="search" label={t('Search music')} onPress={() => router.push('/music/search')} />
      </View>
    </View>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: contentInset + 12 }}
      refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => void home.refetch()} tintColor={colors.accentBright} colors={[colors.accentBright]} />}
    >
      {home.isLoading && <HomeSkeleton />}
      {home.isError && !home.data && <MusicState kind="error" title={t('Couldn’t load music')} body={home.error.message} onRetry={() => void home.refetch()} />}
      {!!home.data && !releases.length && !artists.length && <MusicState kind="empty" title={t('No music yet')} body={t('New releases will show up here.')} />}

      {!!newest && <Hero release={newest} />}

      {!!downloads.length && <PressableScale accessibilityRole="link" onPress={() => router.push('/music/downloads')} style={styles.downloads}>
        <View style={styles.downloadsIcon}><Ionicons name="arrow-down-circle" size={22} color={colors.success} /></View>
        <View style={styles.downloadsCopy}>
          <Text style={styles.downloadsTitle}>{t('Downloads')}</Text>
          <Text style={styles.downloadsMeta}>{trackCountLabel(downloads.length, t)} · {formatBytes(totalBytes)} · {t('Plays offline')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={19} color={colors.textDim} />
      </PressableScale>}

      {releases.length > 1 && <Shelf title={t('New releases')}>{releases.slice(0, 14).map((release) => releaseTile(release))}</Shelf>}

      {!!artists.length && <Shelf title={t('Artists')} gap={16}>
        {artists.map((artist) => <ArtistTile key={artist.id} artist={artist} />)}
      </Shelf>}

      {artistShelves.map(({ artist, releases: own }) => <Shelf
        key={artist.id}
        title={artist.name}
        subtitle={t('Artist')}
        leading={<ArtistAvatar url={artist.avatar_url} name={artist.name} size={36} />}
        onTitlePress={() => router.push(`/music/artists/${artist.slug}`)}
      >
        {own.map((release) => releaseTile(release, false))}
      </Shelf>)}
    </ScrollView>
  </View>;
}

function Hero({ release }: { release: MusicRelease }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { current, playing, togglePlay } = useMusicPlayer();
  const { playRelease, busyID } = usePlayRelease();
  const isCurrent = current?.release_id === release.id;
  const coverSize = Math.min(width - 96, 280);
  const busy = busyID === release.id;
  return <Animated.View entering={FadeIn.duration(380)} style={styles.hero}>
    <Image source={musicImage(release.cover_url, 'sm')} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
    <LinearGradient colors={[withAlpha(colors.canvas, 0.25), withAlpha(colors.canvas, 0.7), colors.screen === 'transparent' ? withAlpha(colors.canvas, 0) : colors.screen]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    <PressableScale accessibilityRole="link" accessibilityLabel={release.title} onPress={() => router.push(`/music/releases/${release.slug}`)} style={[styles.heroCoverShadow, { width: coverSize }]}>
      <MusicCover url={release.cover_url} size="lg" rounded={radii.lg} />
    </PressableScale>
    <Text style={styles.heroKicker}>{t('NEW RELEASE')}</Text>
    <Text numberOfLines={2} style={styles.heroTitle}>{release.title}</Text>
    <PressableScale onPress={() => router.push(`/music/artists/${release.artist_slug}`)}><Text numberOfLines={1} style={styles.heroArtist}>{release.artist_name}</Text></PressableScale>
    <View style={styles.heroMetaRow}>
      <Text style={styles.heroMeta}>{releaseMeta(release, t)}</Text>
      {release.has_lossless_audio && <LosslessBadge label={t('Lossless')} compact />}
    </View>
    <View style={styles.heroActions}>
      <PressableScale disabled={busy} accessibilityRole="button" onPress={() => (isCurrent ? togglePlay() : void playRelease(release))} style={styles.heroPlay}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name={isCurrent && playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />}
        <Text style={styles.heroPlayText}>{t(isCurrent && playing ? 'Pause' : 'Play')}</Text>
      </PressableScale>
      <PressableScale disabled={busy} accessibilityRole="button" onPress={() => void playRelease(release, { shuffle: true })} style={styles.heroShuffle}>
        <Ionicons name="shuffle" size={20} color={colors.text} />
        <Text style={styles.heroShuffleText}>{t('Shuffle')}</Text>
      </PressableScale>
    </View>
  </Animated.View>;
}

function ArtistTile({ artist }: { artist: MusicArtist }) {
  const styles = useStyles();
  const { t } = useI18n();
  return <PressableScale accessibilityRole="link" accessibilityLabel={artist.name} onPress={() => router.push(`/music/artists/${artist.slug}`)} style={styles.artistTile}>
    <ArtistAvatar url={artist.avatar_url} name={artist.name} size={104} />
    <Text numberOfLines={1} style={styles.artistName}>{artist.name}</Text>
    <Text numberOfLines={1} style={styles.artistMeta}>{artist.channel_name || t('Artist')}</Text>
  </PressableScale>;
}

function HomeSkeleton() {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const coverSize = Math.min(width - 96, 280);
  return <View>
    <View style={[styles.hero, styles.heroSkeleton]}>
      <SkeletonBlock width={coverSize} height={coverSize} radius={radii.lg} />
      <View style={styles.heroSkeletonLines}>
        <SkeletonBlock width={90} height={10} radius={4} />
        <SkeletonBlock width={200} height={24} radius={6} />
        <SkeletonBlock width={130} height={14} radius={4} />
      </View>
    </View>
    <ShelfSkeleton />
    <ShelfSkeleton tileWidth={104} round />
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  logo: { width: 124, height: 37 },
  headerActions: { flexDirection: 'row', gap: 8 },
  hero: { alignItems: 'center', overflow: 'hidden', paddingTop: 26, paddingBottom: 26, paddingHorizontal: 24, marginTop: 8 },
  heroCoverShadow: { borderRadius: radii.lg, shadowColor: colors.black, shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
  heroKicker: { color: colors.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.8, marginTop: 22 },
  heroTitle: { color: colors.text, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', marginTop: 6 },
  heroArtist: { color: colors.text, opacity: 0.85, fontSize: 15, fontWeight: '700', marginTop: 4 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  heroMeta: { color: colors.textMuted, fontSize: 12 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  heroPlay: { minWidth: 128, height: 46, paddingHorizontal: 20, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.accentBright },
  heroPlayText: { color: colors.onAccent, fontSize: 15, fontWeight: '900' },
  heroShuffle: { minWidth: 128, height: 46, paddingHorizontal: 20, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: withAlpha(colors.text, 0.12) },
  heroShuffleText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  heroSkeleton: { gap: 18 },
  heroSkeletonLines: { alignItems: 'center', gap: 9 },
  downloads: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, padding: 13, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  downloadsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.success, 0.12) },
  downloadsCopy: { flex: 1, minWidth: 0 },
  downloadsTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  downloadsMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  artistTile: { width: 104, alignItems: 'center' },
  artistName: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  artistMeta: { color: colors.textDim, fontSize: 11, marginTop: 2, textAlign: 'center' },
}));
