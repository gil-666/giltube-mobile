import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import type { ContentRating, MediaCapabilities } from '@/types/api';
import { contentDescriptorText } from '@/utils/contentRating';

// 18+, rating, quality, HDR and 5.1 surround chips for movie and series
// detail screens. Each chip only appears when the content actually has it.
export function MediaBadges({ capabilities, rating, explicit }: { capabilities?: MediaCapabilities; rating?: ContentRating; explicit?: boolean }) {
  const { t } = useI18n();
  const hasRating = !!rating?.rating;
  if (!explicit && !hasRating && (!capabilities || (!capabilities.max_quality && !capabilities.hdr && !capabilities.surround))) return null;
  const descriptors = hasRating ? contentDescriptorText(rating, t) : '';
  return <View style={styles.row}>
    {!!explicit && <View accessibilityLabel={t('18+ explicit')} style={[styles.chip, styles.explicit]}><Text style={[styles.chipText, styles.explicitText]}>18+</Text></View>}
    {hasRating && <View style={[styles.chip, styles.rating]}><Text style={[styles.chipText, styles.ratingText]}>{rating!.rating}</Text></View>}
    {!!capabilities?.max_quality && <View style={styles.quality}><Ionicons name="sparkles-outline" color={colors.accentBright} size={16} /><Text style={styles.qualityText}>{t('Up to')} {capabilities!.max_quality}</Text></View>}
    {!!capabilities?.hdr && <View accessibilityLabel={t('HDR (high dynamic range)')} style={[styles.chip, styles.hdr]}><Text style={[styles.chipText, styles.hdrText]}>HDR</Text></View>}
    {!!capabilities?.surround && <View accessibilityLabel={t('5.1 surround sound')} style={[styles.chip, styles.surround]}><Ionicons name="volume-high-outline" color="#ddd6fe" size={14} /><Text style={[styles.chipText, styles.surroundText]}>5.1</Text></View>}
    {!!descriptors && <Text style={styles.descriptors}>{descriptors}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  quality: { flexDirection: 'row', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: 'rgba(239,68,68,.1)' },
  qualityText: { color: colors.accentBright, fontSize: 11, fontWeight: '800' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '900', letterSpacing: .4 },
  hdr: { backgroundColor: 'rgba(113,63,18,.8)', borderColor: 'rgba(250,204,21,.7)' },
  hdrText: { color: '#fef9c3' },
  surround: { backgroundColor: 'rgba(76,29,149,.76)', borderColor: 'rgba(167,139,250,.65)' },
  surroundText: { color: '#ede9fe' },
  explicit: { backgroundColor: 'rgba(127,29,29,.8)', borderColor: 'rgba(248,113,113,.7)' },
  explicitText: { color: '#fee2e2' },
  rating: { backgroundColor: 'rgba(0,0,0,.35)', borderColor: 'rgba(255,255,255,.55)' },
  ratingText: { color: colors.white },
  descriptors: { alignSelf: 'center', color: colors.textMuted, fontSize: 12 },
});
