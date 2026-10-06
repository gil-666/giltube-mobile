import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';

import { musicImage } from '@/music/quality';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

/** Square release cover with a music-note placeholder. */
export function MusicCover({ url, size = 'md', style, rounded = radii.sm }: { url?: string; size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle>; rounded?: number }) {
  const styles = useStyles();
  const source = musicImage(url, size);
  return <View style={[styles.cover, { borderRadius: rounded }, style]}>
    {source ? <Image source={source} style={styles.fill} contentFit="cover" transition={200} recyclingKey={source} accessibilityIgnoresInvertColors /> : <Ionicons name="musical-notes" size={28} color={colors.textDim} />}
  </View>;
}

/** Round artist image; falls back to the artist's initial. */
export function ArtistAvatar({ url, name, size = 64, style }: { url?: string; name: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const source = musicImage(url, size > 120 ? 'lg' : size > 56 ? 'md' : 'sm');
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}>
    {source && !failed
      ? <Image source={source} style={styles.fill} contentFit="cover" transition={200} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      : <Text style={[styles.initial, { fontSize: Math.max(12, size * 0.4) }]}>{(name || '?').charAt(0).toUpperCase()}</Text>}
  </View>;
}

export function LosslessBadge({ label, compact = false }: { label: string; compact?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.lossless, compact && styles.losslessCompact]}>
    <Ionicons name="pulse" size={compact ? 10 : 12} color={colors.gilid} />
    <Text style={[styles.losslessText, compact && styles.losslessTextCompact]}>{label}</Text>
  </View>;
}

export function ExplicitBadge() {
  const styles = useStyles();
  return <View style={styles.explicit} accessibilityLabel="Explicit"><Text style={styles.explicitText}>E</Text></View>;
}

/** Small neutral chip, e.g. "Lossless" or "320 kbps". */
export function QualityChip({ label, highlight = false }: { label: string; highlight?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.chip, highlight && styles.chipHighlight]}><Text style={[styles.chipText, highlight && styles.chipTextHighlight]}>{label}</Text></View>;
}

const useStyles = makeStyles(() => ({
  cover: { aspectRatio: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  initial: { color: colors.textMuted, fontWeight: '900' },
  lossless: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: withAlpha(colors.gilid, 0.45), backgroundColor: withAlpha(colors.gilid, 0.1) },
  losslessCompact: { height: 18, paddingHorizontal: 6, gap: 3 },
  losslessText: { color: colors.gilid, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  losslessTextCompact: { fontSize: 9 },
  explicit: { width: 15, height: 15, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.text, 0.22) },
  explicitText: { color: colors.text, fontSize: 9, fontWeight: '900' },
  chip: { height: 20, paddingHorizontal: 7, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  chipHighlight: { backgroundColor: withAlpha(colors.gilid, 0.14) },
  chipText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  chipTextHighlight: { color: colors.gilid },
}));
