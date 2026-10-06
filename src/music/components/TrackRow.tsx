import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { MusicTrack } from '@/types/api';

import { ExplicitBadge, MusicCover } from './Artwork';
import { formatDuration } from './format';

function Bar({ playing, delay, color }: { playing: boolean; delay: number; color: string }) {
  const height = useSharedValue(0.45);
  useEffect(() => {
    if (playing) {
      height.value = withRepeat(withSequence(withTiming(1, { duration: 320 + delay }), withTiming(0.3, { duration: 280 + delay })), -1, true);
    } else {
      cancelAnimation(height);
      height.value = withTiming(0.4, { duration: 200 });
    }
  }, [delay, height, playing]);
  const style = useAnimatedStyle(() => ({ height: `${height.value * 100}%` }));
  return <Animated.View style={[{ width: 3, borderRadius: 1.5, backgroundColor: color }, style]} />;
}

/** Three bouncing bars while playing, still bars when paused. */
export function Equalizer({ playing, color = colors.accentBright, size = 14 }: { playing: boolean; color?: string; size?: number }) {
  return <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
    <Bar playing={playing} delay={0} color={color} />
    <Bar playing={playing} delay={120} color={color} />
    <Bar playing={playing} delay={60} color={color} />
  </View>;
}

/**
 * One track: number (or equalizer when it's the current track), title, E badge,
 * artist, downloaded check, duration and a ⋯ button.
 */
export function TrackRow({ track, number, current = false, playing = false, downloaded = false, downloading, showCover = false, subtitle, onPress, onMore }: {
  track: MusicTrack;
  /** Shown in the leading column; omit to hide the column (e.g. with showCover). */
  number?: number;
  current?: boolean;
  playing?: boolean;
  downloaded?: boolean;
  /** 0–1 while this track is downloading. */
  downloading?: number;
  showCover?: boolean;
  subtitle?: string;
  onPress: () => void;
  onMore?: () => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${track.title}, ${track.artist_name}`}
    onPress={onPress}
    onLongPress={onMore}
    delayLongPress={350}
    style={({ pressed }) => [styles.row, current && styles.rowCurrent, pressed && styles.rowPressed]}
  >
    {showCover && <View style={styles.coverWrap}>
      <MusicCover url={track.cover_url} size="sm" rounded={radii.sm} style={styles.cover} />
      {current && <View style={styles.coverOverlay}><Equalizer playing={playing} color={colors.white} /></View>}
    </View>}
    {number !== undefined && <View style={styles.index}>
      {current ? <Equalizer playing={playing} /> : <Text style={styles.number}>{number}</Text>}
    </View>}
    <View style={styles.copy}>
      <Text numberOfLines={1} style={[styles.title, current && styles.titleCurrent]}>{track.title}</Text>
      <View style={styles.metaRow}>
        {track.explicit && <ExplicitBadge />}
        {downloaded && <Ionicons name="arrow-down-circle" size={13} color={colors.success} accessibilityLabel={t('Downloaded')} />}
        {downloading !== undefined && !downloaded && <ActivityIndicator size={11} color={colors.textMuted} />}
        <Text numberOfLines={1} style={styles.artist}>{subtitle ?? track.artist_name}</Text>
      </View>
    </View>
    <Text style={styles.duration}>{formatDuration(track.duration_seconds)}</Text>
    {!!onMore && <Pressable accessibilityRole="button" accessibilityLabel={t('More options')} hitSlop={8} onPress={onMore} style={styles.more}>
      <Ionicons name="ellipsis-vertical" size={17} color={colors.textMuted} />
    </Pressable>}
  </Pressable>;
}

const useStyles = makeStyles(() => ({
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 6 },
  rowCurrent: { backgroundColor: withAlpha(colors.accentBright, 0.07) },
  rowPressed: { backgroundColor: withAlpha(colors.text, 0.06) },
  coverWrap: { width: 46, height: 46 },
  cover: { width: 46, height: 46 },
  coverOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.45)' },
  index: { width: 22, alignItems: 'center' },
  number: { color: colors.textDim, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  titleCurrent: { color: colors.accentBright },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  artist: { flexShrink: 1, color: colors.textMuted, fontSize: 12 },
  duration: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  more: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
}));
