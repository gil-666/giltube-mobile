import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren, ReactNode, useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

/** A titled horizontal row. `onSeeAll` adds a "See all" link; `leading` sits before the title. */
export function Shelf({ title, subtitle, leading, onSeeAll, onTitlePress, gap = 14, children }: PropsWithChildren<{
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  onSeeAll?: () => void;
  onTitlePress?: () => void;
  gap?: number;
}>) {
  const styles = useStyles();
  const { t } = useI18n();
  return <View style={styles.section}>
    <View style={styles.header}>
      <Pressable disabled={!onTitlePress} onPress={onTitlePress} style={styles.titleRow}>
        {leading}
        <View style={styles.titleCopy}>
          <View style={styles.titleLine}>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            {!!onTitlePress && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
          </View>
          {!!subtitle && <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </Pressable>
      {!!onSeeAll && <Pressable accessibilityRole="link" hitSlop={10} onPress={onSeeAll}><Text style={styles.seeAll}>{t('See all')}</Text></Pressable>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { gap }]}>{children}</ScrollView>
  </View>;
}

/** A pulsing placeholder block for loading states. */
export function SkeletonBlock({ width, height, radius = radii.md, round = false }: { width: number | `${number}%`; height: number; radius?: number; round?: boolean }) {
  const styles = useStyles();
  const opacity = useSharedValue(0.55);
  useEffect(() => { opacity.value = withRepeat(withTiming(1, { duration: 750 }), -1, true); }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, { width, height, borderRadius: round ? height / 2 : radius }, animated]} />;
}

/** Skeleton for a release shelf. */
export function ShelfSkeleton({ tiles = 4, tileWidth = 148, round = false }: { tiles?: number; tileWidth?: number; round?: boolean }) {
  const styles = useStyles();
  return <View style={styles.section}>
    <View style={styles.header}><SkeletonBlock width={150} height={20} radius={6} /></View>
    <View style={[styles.row, styles.skeletonRow]}>
      {Array.from({ length: tiles }, (_, index) => <View key={index} style={{ width: tileWidth, gap: 8 }}>
        <SkeletonBlock width={tileWidth} height={tileWidth} round={round} />
        <SkeletonBlock width={tileWidth * 0.8} height={12} radius={4} />
        <SkeletonBlock width={tileWidth * 0.5} height={10} radius={4} />
      </View>)}
    </View>
  </View>;
}

const useStyles = makeStyles(() => ({
  section: { marginTop: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, marginBottom: 13 },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleCopy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  title: { flexShrink: 1, color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  seeAll: { color: colors.highlight, fontSize: 13, fontWeight: '800' },
  row: { paddingHorizontal: 18 },
  skeletonRow: { flexDirection: 'row', gap: 14, overflow: 'hidden' },
  skeleton: { backgroundColor: colors.surfaceStrong },
}));
