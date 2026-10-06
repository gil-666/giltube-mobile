import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { musicAPI } from '@/api/music';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { ArtistAvatar } from '@/music/components/Artwork';
import { musicKeys, useReleaseTilePlayback } from '@/music/components/hooks';
import { ReleaseTile } from '@/music/components/ReleaseTile';
import { MusicState } from '@/music/components/ScreenParts';
import { useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { MusicArtist } from '@/types/api';

const normalize = (value: string | undefined) => (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const matches = (query: string, ...fields: (string | undefined)[]) => {
  const words = query.split(/\s+/).filter(Boolean);
  const text = fields.map(normalize).join(' ');
  return words.every((word) => text.includes(word));
};

export default function MusicSearchScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const { t } = useI18n();
  const { contentInset } = useMiniPlayerLayout();
  const [text, setText] = useState(typeof params.q === 'string' ? params.q : '');
  const home = useQuery({ queryKey: musicKeys.home, queryFn: musicAPI.home });
  const tiles = useReleaseTilePlayback();
  const query = normalize(text);

  const { artists, releases } = useMemo(() => {
    const allArtists = home.data?.artists || [];
    const allReleases = home.data?.releases || [];
    if (!query) return { artists: allArtists, releases: allReleases };
    return {
      artists: allArtists.filter((artist) => matches(query, artist.name, artist.channel_name)),
      releases: allReleases.filter((release) => matches(query, release.title, release.artist_name, release.release_type)),
    };
  }, [home.data, query]);

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <PressableScale accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/music'))} style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </PressableScale>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={18} color={colors.textDim} />
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder={t('Artists, albums and singles')}
          placeholderTextColor={colors.textDim}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={colors.highlight}
          style={styles.input}
        />
        {!!text && <Pressable accessibilityRole="button" accessibilityLabel={t('Clear search')} hitSlop={10} onPress={() => setText('')}>
          <Ionicons name="close-circle" size={18} color={colors.textDim} />
        </Pressable>}
      </View>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: contentInset + 12 }}>
      {home.isLoading && <MusicState kind="loading" />}
      {home.isError && !home.data && <MusicState kind="error" title={t('Couldn’t load music')} body={home.error.message} onRetry={() => void home.refetch()} />}
      {!!home.data && <>
        {!!artists.length && <>
          <Text style={styles.section}>{query ? t('Artists') : t('Browse artists')}</Text>
          {artists.map((artist) => <ArtistRow key={artist.id} artist={artist} />)}
        </>}
        {!!releases.length && <>
          <Text style={styles.section}>{query ? t('Releases') : t('Browse releases')}</Text>
          <View style={styles.grid}>
            {releases.map((release) => <View key={release.id} style={styles.cell}>
              <ReleaseTile release={release} width="100%" onPlay={tiles.onPlay} busy={tiles.busyID === release.id} playing={tiles.isPlaying(release)} />
            </View>)}
          </View>
        </>}
        {!!query && !artists.length && !releases.length && <MusicState kind="empty" title={t('No results')} body={t('No music found for “{query}”.', { query: text.trim() })} />}
      </>}
    </ScrollView>
  </View>;
}

function ArtistRow({ artist }: { artist: MusicArtist }) {
  const styles = useStyles();
  const { t } = useI18n();
  return <PressableScale accessibilityRole="link" onPress={() => router.push(`/music/artists/${artist.slug}`)} style={styles.artistRow}>
    <ArtistAvatar url={artist.avatar_url} name={artist.name} size={52} />
    <View style={styles.artistCopy}>
      <Text numberOfLines={1} style={styles.artistName}>{artist.name}</Text>
      <Text numberOfLines={1} style={styles.artistMeta}>{artist.channel_name || t('Artist')}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  section: { color: colors.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.3, paddingHorizontal: 18, marginTop: 20, marginBottom: 10 },
  artistRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  artistCopy: { flex: 1, minWidth: 0 },
  artistName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  artistMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 11 },
  cell: { width: '50%', paddingHorizontal: 7, marginBottom: 20 },
}));
