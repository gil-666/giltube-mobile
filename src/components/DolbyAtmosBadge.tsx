import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';

// Shown while a Dolby Atmos track plays, and on titles that have one. The
// double-D mark is drawn from two half-rounded blocks, so no asset ships.
// size 'player' matches the HDR badge in the player controls; 'chip' matches
// the MediaBadges chips on detail screens.
export function DolbyAtmosBadge({ size = 'player' }: { size?: 'player' | 'chip' }) {
  const { t } = useI18n();
  const chip = size === 'chip';
  const markHeight = chip ? 11 : 9;
  const half = { width: markHeight * 0.62, height: markHeight };
  return <View accessibilityRole="image" accessibilityLabel={t('Dolby Atmos')} style={[styles.badge, chip ? styles.chip : styles.player]}>
    <View style={styles.mark}>
      <View style={[styles.half, half, { borderTopLeftRadius: markHeight / 2, borderBottomLeftRadius: markHeight / 2 }]} />
      <View style={[styles.half, half, { borderTopRightRadius: markHeight / 2, borderBottomRightRadius: markHeight / 2 }]} />
    </View>
    <Text style={[styles.text, chip && styles.chipText]}>Atmos</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,.55)' },
  player: { height: 18, gap: 4, paddingHorizontal: 5, marginLeft: 6, borderRadius: 4 },
  chip: { gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  mark: { flexDirection: 'row', gap: 1 },
  half: { backgroundColor: '#fff' },
  text: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: .4 },
  chipText: { fontSize: 11 },
});
