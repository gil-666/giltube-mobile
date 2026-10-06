import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

import { MusicCover } from './Artwork';
import { Equalizer } from './TrackRow';

/** The current track with play/pause; tap opens the full player. Renders nothing without a queue. */
export function ContinueListeningCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { current, playing, togglePlay, openPlayer, queue, index, position, duration } = useMusicPlayer();
  if (!current) return null;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const left = Math.max(0, queue.length - index - 1);
  return <PressableScale accessibilityRole="button" accessibilityLabel={t('Open player')} onPress={() => openPlayer()} style={[styles.card, style]}>
    <MusicCover url={current.cover_url} size="sm" style={styles.cover} />
    <View style={styles.copy}>
      <View style={styles.kickerRow}>
        <Equalizer playing={playing} size={10} />
        <Text style={styles.kicker}>{t(playing ? 'NOW PLAYING' : 'CONTINUE LISTENING')}</Text>
      </View>
      <Text numberOfLines={1} style={styles.title}>{current.title}</Text>
      <Text numberOfLines={1} style={styles.meta}>{current.artist_name}{left ? ` · ${t('{count} more in queue', { count: left })}` : ''}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={t(playing ? 'Pause' : 'Play')} hitSlop={8} onPress={togglePlay} style={styles.play}>
      <Ionicons name={playing ? 'pause' : 'play'} size={22} color={colors.onAccent} style={playing ? undefined : styles.playIcon} />
    </Pressable>
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 12, borderRadius: radii.lg, borderWidth: 1, borderColor: withAlpha(colors.accentBright, 0.28), backgroundColor: colors.surface },
  cover: { width: 62, height: 62, borderRadius: radii.sm },
  copy: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { color: colors.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  track: { height: 3, borderRadius: 2, marginTop: 8, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  fill: { height: 3, backgroundColor: colors.accentBright },
  play: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright },
  playIcon: { marginLeft: 3 },
}));
