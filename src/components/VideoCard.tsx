import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { PressableScale } from './PressableScale';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import type { Video } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export function VideoCard({ video, index = 0, progress = 0 }: { video: Video; index?: number; progress?: number }) {
  const { t, compactNumber } = useI18n();
  // Push (even from a watch screen) so Back returns to the previous video.
  const openVideo = () => router.push({ pathname: '/video/[id]', params: { id: video.id } });
  return (
    <Animated.View entering={FadeInRight.delay(Math.min(index, 6) * 55).duration(360)}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${t('Play')} ${video.title}`}
        onPress={openVideo}
        style={styles.card}
      >
        <View style={styles.imageWrap}><Image source={resolveMediaURL(video.thumbnail_url)} style={styles.image} contentFit="cover" transition={180} cachePolicy="memory-disk" />{progress > 0 && <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} /></View>}</View>
        <Text numberOfLines={2} style={styles.title}>{video.title}</Text>
        <View style={styles.metaRow}><Text numberOfLines={1} style={styles.channel}>{video.channel?.name || 'GilTube'}</Text>{video.channel?.verified && <Ionicons name="checkmark-circle" color={colors.white} size={13} />}<Text style={styles.meta}>· {compactNumber(video.views)} {t(video.views === 1 ? 'view' : 'views')}</Text></View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: 238 },
  imageWrap: { width: 238, aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  image: {
    width: '100%', height: '100%',
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,.25)' }, progressFill: { height: '100%', backgroundColor: colors.accentBright },
  title: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, channel: { color: colors.textMuted, fontSize: 12, maxWidth: 140 }, meta: { color: colors.textMuted, fontSize: 12 },
});
