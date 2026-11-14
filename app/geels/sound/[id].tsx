import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { geelsAPI } from '@/api/geels';
import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { compactNumber, resolveMediaURL } from '@/utils/media';

export default function GeelSoundScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const music = useMusicPlayer();
  const sound = useQuery({ queryKey: ['geel-sound', id], queryFn: () => geelsAPI.sound(id), enabled: !!id });
  const geels = useQuery({ queryKey: ['geels', 'sound', id], queryFn: () => geelsAPI.feed({ sound: id, limit: 30 }), enabled: !!id });
  const [previewing, setPreviewing] = useState(false);
  const info = sound.data?.sound;
  const preview = useVideoPlayer(info ? { uri: resolveMediaURL(info.audio_url) } : null, (player) => { player.loop = true; });

  useEffect(() => {
    if (previewing) { if (music.playing) music.pause(); preview.play(); } else preview.pause();
  }, [music, preview, previewing]);

  const tile = Math.floor((width - 4) / 3);
  return <View style={styles.screen}>
    <FlatList
      data={geels.data?.items || []}
      keyExtractor={(geel) => geel.id}
      numColumns={3}
      columnWrapperStyle={{ gap: 2 }}
      contentContainerStyle={{ gap: 2, paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={<View style={[styles.header, { paddingTop: insets.top + 56 }]}>
        {sound.isLoading ? <ActivityIndicator color={colors.accentBright} /> : info ? <>
          <Pressable onPress={() => setPreviewing((value) => !value)} style={styles.cover}>
            {!!info.cover_url && <Image source={resolveMediaURL(info.cover_url)} style={styles.coverArt} contentFit="cover" />}
            <View style={styles.coverPlay}><Ionicons name={previewing ? 'pause' : 'play'} size={30} color="#fff" /></View>
          </Pressable>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>{t('Sound')}</Text>
            <Text numberOfLines={2} style={styles.title}>{info.title}</Text>
            <Text style={styles.artist}>{info.artist_name}</Text>
            <Text style={styles.usage}>{compactNumber(info.usage_count || 0)} {t((info.usage_count || 0) === 1 ? 'Geel' : 'Geels')}</Text>
          </View>
        </> : <Text style={styles.usage}>{t('This sound isn’t available.')}</Text>}
      </View>}
      renderItem={({ item }) => <Pressable onPress={() => router.push({ pathname: '/geels/[id]', params: { id: item.id, sound: id } })} style={{ width: tile, height: Math.round(tile * 16 / 9) }}>
        <Image source={resolveMediaURL(item.thumbnail_url)} style={styles.tileImage} contentFit="cover" />
        <View style={styles.tileViews}><Ionicons name="play" size={12} color="#fff" /><Text style={styles.tileViewsText}>{compactNumber(item.views)}</Text></View>
      </Pressable>}
    />
    <Pressable accessibilityLabel={t('Back')} onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={8}>
      <Ionicons name="chevron-back" size={26} color={colors.text} />
    </Pressable>
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  header: { flexDirection: 'row', gap: 16, paddingHorizontal: 18, paddingBottom: 20, alignItems: 'center' },
  cover: { width: 112, height: 112, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  coverArt: { width: '100%', height: '100%' },
  coverPlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  artist: { color: colors.textMuted, fontSize: 14, fontWeight: '700', marginTop: 2 },
  usage: { color: colors.textDim, fontSize: 13, marginTop: 6 },
  tileImage: { width: '100%', height: '100%', backgroundColor: colors.surface },
  tileViews: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileViewsText: { color: '#fff', fontSize: 12, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  back: { position: 'absolute', left: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
}));
