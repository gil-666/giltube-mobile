import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';

// Shown while a Dolby Atmos track plays, and on titles that have one. The
// double-D mark is drawn from two half-rounded blocks, so no asset ships. It
// follows the 2019 Dolby mark (1546x1070): each D is 691 wide, a flat side
// facing out and a half-circle of the full height facing a 164-wide gap.
// size 'player' matches the HDR badge in the player controls; 'chip' matches
// the MediaBadges chips on detail screens.
export function DolbyAtmosBadge({ size = 'player' }: { size?: 'player' | 'chip' }) {
  const { t } = useI18n();
  const chip = size === 'chip';
  const markHeight = chip ? 11 : 9;
  const half = { width: markHeight * (691 / 1070), height: markHeight };
  const radius = markHeight / 2;
  return <View accessibilityRole="image" accessibilityLabel={t('Dolby Atmos')} style={[styles.badge, chip ? styles.chip : styles.player]}>
    <View style={[styles.mark, { gap: markHeight * (164 / 1070) }]}>
      <View style={[styles.half, half, { borderTopRightRadius: radius, borderBottomRightRadius: radius }]} />
      <View style={[styles.half, half, { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }]} />
    </View>
    <Text style={[styles.text, chip && styles.chipText]}>Atmos</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,.55)' },
  player: { height: 18, gap: 4, paddingHorizontal: 5, marginLeft: 6, borderRadius: 4 },
  chip: { gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  mark: { flexDirection: 'row' },
  half: { backgroundColor: '#fff' },
  text: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: .4 },
  chipText: { fontSize: 11 },
});
