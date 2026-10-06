import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { musicImage } from '@/music/quality';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { MusicTrack } from '@/types/api';

/** Now playing + up next, with play / move / remove / clear. */
/** Clearing empties the queue; the player screen then closes itself. */
export function QueueView({ bottomInset }: { bottomInset: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { queue, index, current, playQueue, removeFromQueue, moveInQueue, clearQueue, shuffle, playing } = useMusicPlayer();

  const upNext = queue.map((track, trackIndex) => ({ track, trackIndex })).filter(({ trackIndex }) => trackIndex > index);
  const played = queue.map((track, trackIndex) => ({ track, trackIndex })).filter(({ trackIndex }) => trackIndex < index);

  const clear = () => {
    Alert.alert(t('Clear queue?'), t('This stops playback and removes every track from the queue.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Clear'), style: 'destructive', onPress: clearQueue },
    ]);
  };

  const row = (track: MusicTrack, trackIndex: number, options: { now?: boolean; dim?: boolean }) => (
    <View key={`${track.id}-${trackIndex}`} style={[styles.row, options.now && styles.rowNow]}>
      <Pressable style={styles.rowMain} onPress={() => { if (!options.now) playQueue(queue, trackIndex); }} accessibilityRole="button" accessibilityLabel={track.title}>
        <Image source={musicImage(track.cover_url, 'sm')} style={[styles.cover, options.dim && styles.dim]} contentFit="cover" />
        <View style={[styles.copy, options.dim && styles.dim]}>
          <Text numberOfLines={1} style={[styles.title, options.now && styles.titleNow]}>{track.title}</Text>
          <Text numberOfLines={1} style={styles.artist}>{track.artist_name}</Text>
        </View>
        {options.now && <Ionicons name={playing ? 'volume-high' : 'pause'} size={16} color={colors.accentBright} />}
      </Pressable>
      {!options.now && (
        <View style={styles.actions}>
          <Pressable hitSlop={6} style={styles.action} disabled={trackIndex === 0} onPress={() => moveInQueue(trackIndex, trackIndex - 1)} accessibilityLabel={t('Move up')}>
            <Ionicons name="chevron-up" size={18} color={trackIndex === 0 ? colors.textDim : colors.textMuted} />
          </Pressable>
          <Pressable hitSlop={6} style={styles.action} disabled={trackIndex === queue.length - 1} onPress={() => moveInQueue(trackIndex, trackIndex + 1)} accessibilityLabel={t('Move down')}>
            <Ionicons name="chevron-down" size={18} color={trackIndex === queue.length - 1 ? colors.textDim : colors.textMuted} />
          </Pressable>
          <Pressable hitSlop={6} style={styles.action} onPress={() => removeFromQueue(trackIndex)} accessibilityLabel={t('Remove from queue')}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>{t('Now playing')}</Text>
      {current && row(current, index, { now: true })}

      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t('Up next')}</Text>
        {shuffle && <View style={styles.badge}><Ionicons name="shuffle" size={12} color={colors.textMuted} /><Text style={styles.badgeText}>{t('Shuffle on')}</Text></View>}
        <View style={styles.spacer} />
        <Pressable onPress={clear} hitSlop={8}><Text style={styles.clear}>{t('Clear')}</Text></Pressable>
      </View>
      {upNext.length === 0
        ? <Text style={styles.empty}>{t('Nothing else is queued.')}</Text>
        : upNext.map(({ track, trackIndex }) => row(track, trackIndex, {}))}

      {played.length > 0 && (
        <>
          <Text style={[styles.heading, styles.headingSpaced]}>{t('Played')}</Text>
          {played.map(({ track, trackIndex }) => row(track, trackIndex, { dim: true }))}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  heading: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  headingSpaced: { marginTop: 20 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  spacer: { flex: 1 },
  clear: { color: colors.highlight, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: withAlpha(colors.text, 0.07) },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, borderRadius: radii.md },
  rowNow: { backgroundColor: withAlpha(colors.text, 0.06) },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, paddingRight: 6 },
  cover: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  copy: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.55 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  titleNow: { color: colors.accentBright, fontWeight: '800' },
  artist: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  action: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
}));
