import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { musicAPI } from '@/api/music';
import { PressableScale } from '@/components/PressableScale';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { ArtistAvatar } from '@/music/components/Artwork';
import { musicKeys, usePlayRelease, useReleaseTilePlayback } from '@/music/components/hooks';
import { ReleaseTile } from '@/music/components/ReleaseTile';
import { MusicBackBar, MusicState } from '@/music/components/ScreenParts';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { musicImage } from '@/music/quality';
import { useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { MusicArtist, MusicRelease } from '@/types/api';

export default function ArtistScreen() {
  const styles = useStyles();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useI18n();
  const { contentInset } = useMiniPlayerLayout();
  const artist = useQuery({ queryKey: musicKeys.artist(slug), queryFn: () => musicAPI.artist(slug), enabled: !!slug });
  const tiles = useReleaseTilePlayback();

  if (!artist.data) {
    return <View style={styles.screen}>
      <MusicBackBar />
      {artist.isLoading ? <MusicState kind="loading" /> : <MusicState kind="error" title={t('Artist not found')} body={artist.error?.message} onRetry={() => void artist.refetch()} />}
    </View>;
  }

  const { artist: info, releases } = artist.data;
  return <View style={styles.screen}>
    <MusicBackBar overArtwork />
    <FlatList
      data={releases}
      keyExtractor={(release) => release.id}
      numColumns={2}
      columnWrapperStyle={styles.columns}
      contentContainerStyle={{ paddingBottom: contentInset + 12 }}
      refreshControl={<RefreshControl refreshing={artist.isRefetching} onRefresh={() => void artist.refetch()} tintColor={colors.accentBright} colors={[colors.accentBright]} />}
      ListHeaderComponent={<ArtistHeader artist={info} releases={releases} />}
      ListEmptyComponent={<Text style={styles.empty}>{t('No releases yet.')}</Text>}
      renderItem={({ item }) => <View style={styles.cell}>
        <ReleaseTile release={item} width="100%" showArtist={false} onPlay={tiles.onPlay} busy={tiles.busyID === item.id} playing={tiles.isPlaying(item)} />
      </View>}
    />
  </View>;
}

function ArtistHeader({ artist, releases }: { artist: MusicArtist; releases: MusicRelease[] }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [bioOpen, setBioOpen] = useState(false);
  const { current, playing, togglePlay } = useMusicPlayer();
  const { playRelease, busyID } = usePlayRelease();
  const newest = releases[0];
  const isCurrent = !!newest && current?.release_id === newest.id;
  const banner = musicImage(artist.banner_url, 'lg');

  return <View>
    <View style={[styles.banner, { height: insets.top + 190 }]}>
      {banner ? <Image source={banner} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Image source={musicImage(artist.avatar_url, 'sm')} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />}
      <LinearGradient colors={['rgba(0,0,0,.25)', withAlpha(colors.canvas, 0.4), colors.canvas]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    </View>
    <View style={styles.identity}>
      <ArtistAvatar url={artist.avatar_url} name={artist.name} size={112} style={styles.avatar} />
      <Text style={styles.label}>{t('ARTIST')}</Text>
      <View style={styles.nameRow}>
        <Text style={styles.name}>{artist.name}</Text>
        <VerifiedBadge verified={artist.verified} size={20} />
      </View>
      {!!artist.primary_channel_id && <PressableScale accessibilityRole="link" onPress={() => router.push({ pathname: '/channel/[id]', params: { id: artist.primary_channel_id } })} style={styles.channel}>
        <Ionicons name="tv-outline" size={15} color={colors.highlight} />
        <Text numberOfLines={1} style={styles.channelText}>{artist.channel_name ? t('{name} on GilTube', { name: artist.channel_name }) : t('View channel')}</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.highlight} />
      </PressableScale>}
      {!!newest && <View style={styles.actions}>
        <PressableScale disabled={busyID === newest.id} accessibilityRole="button" onPress={() => (isCurrent ? togglePlay() : void playRelease(newest))} style={styles.play}>
          {busyID === newest.id ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name={isCurrent && playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />}
          <Text style={styles.playText}>{t(isCurrent && playing ? 'Pause' : 'Play')}</Text>
        </PressableScale>
        <PressableScale disabled={!!busyID} accessibilityRole="button" onPress={() => void playRelease(newest, { shuffle: true })} style={styles.shuffle}>
          <Ionicons name="shuffle" size={19} color={colors.text} />
          <Text style={styles.shuffleText}>{t('Shuffle')}</Text>
        </PressableScale>
      </View>}
      {!!artist.bio && <PressableScale accessibilityRole="button" accessibilityLabel={t(bioOpen ? 'Show less' : 'Show more')} onPress={() => setBioOpen((open) => !open)} style={styles.bio}>
        <Text numberOfLines={bioOpen ? undefined : 3} style={styles.bioText}>{artist.bio}</Text>
        <Text style={styles.more}>{t(bioOpen ? 'Show less' : 'Show more')}</Text>
      </PressableScale>}
    </View>
    {releases.length > 0 && <Text style={styles.section}>{t('Releases')}</Text>}
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  banner: { overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  identity: { alignItems: 'center', paddingHorizontal: 22, marginTop: -64 },
  avatar: { borderWidth: 4, borderColor: colors.canvas },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  name: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', flexShrink: 1 },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, maxWidth: '100%' },
  channelText: { color: colors.highlight, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  play: { minWidth: 124, height: 46, paddingHorizontal: 20, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.accentBright },
  playText: { color: colors.onAccent, fontSize: 15, fontWeight: '900' },
  shuffle: { minWidth: 124, height: 46, paddingHorizontal: 20, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.surfaceStrong },
  shuffleText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  bio: { alignSelf: 'stretch', marginTop: 20, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface },
  bioText: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  more: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 6 },
  section: { color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.4, paddingHorizontal: 18, marginTop: 28, marginBottom: 14 },
  columns: { paddingHorizontal: 18, gap: 14 },
  cell: { flex: 1, maxWidth: '50%', marginBottom: 22 },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
}));
