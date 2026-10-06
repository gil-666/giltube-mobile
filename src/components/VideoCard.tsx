import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { PressableScale } from './PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { RelatedMedia, Video } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export function VideoCard({ video, index = 0, progress = 0 }: { video: Video; index?: number; progress?: number }) {
  const styles = useStyles();
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
        <View style={styles.metaRow}><Text numberOfLines={1} style={styles.channel}>{video.channel?.name || 'GilTube'}</Text>{video.channel?.verified && <Ionicons name="checkmark-circle" color={colors.text} size={13} />}<Text style={styles.meta}>· {compactNumber(video.views)} {t(video.views === 1 ? 'view' : 'views')}</Text></View>
      </PressableScale>
    </Animated.View>
  );
}

// A movie or a whole series in a video rail; opens its detail screen.
export function RelatedMediaCard({ media, index = 0 }: { media: RelatedMedia; index?: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const isSeries = media.kind === 'series';
  const open = () => router.push(isSeries ? { pathname: '/series/[id]', params: { id: media.id } } : { pathname: '/movies/[id]', params: { id: media.id } });
  const count = isSeries ? (media.seasons && media.seasons > 1 ? media.seasons : media.episode_count || 0) : 0;
  const detail = isSeries
    ? `${count} ${t(media.seasons && media.seasons > 1 ? 'seasons' : count === 1 ? 'episode' : 'episodes')}`
    : media.release_year ? String(media.release_year) : '';
  const meta = [detail, media.content_rating?.rating].filter(Boolean).join(' · ');
  return (
    <Animated.View entering={FadeInRight.delay(Math.min(index, 6) * 55).duration(360)}>
      <PressableScale accessibilityRole="button" accessibilityLabel={media.title} onPress={open} style={styles.card}>
        <View style={styles.imageWrap}><Image source={resolveMediaURL(media.backdrop_url || media.poster_url)} style={styles.image} contentFit="cover" transition={180} cachePolicy="memory-disk" /><View style={styles.kindBadge}><Text style={styles.kindBadgeText}>{t(isSeries ? 'Series' : 'Movie')}</Text></View></View>
        <Text numberOfLines={2} style={styles.title}>{media.title}</Text>
        {!!meta && <Text numberOfLines={1} style={[styles.meta, styles.mediaMeta]}>{meta}</Text>}
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  card: { width: 238 },
  kindBadge: { position: 'absolute', top: 8, left: 8, borderRadius: 5, backgroundColor: 'rgba(12,12,14,.82)', paddingHorizontal: 6, paddingVertical: 2 },
  kindBadgeText: { color: '#f2f2f4', fontSize: 11, fontWeight: '700' },
  mediaMeta: { marginTop: 4 },
  imageWrap: { width: 238, aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  image: {
    width: '100%', height: '100%',
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,.25)' }, progressFill: { height: '100%', backgroundColor: colors.accentBright },
  title: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, channel: { color: colors.textMuted, fontSize: 12, maxWidth: 140 }, meta: { color: colors.textMuted, fontSize: 12 },
}));
