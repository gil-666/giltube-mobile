import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { mediaOrigin } from '@/config/environment';

import { THEME_BACKGROUND_IMAGE_OPACITY, THEME_CORNERS, backgroundThumbnail, safeBackgroundImage, type ThemeAppearance } from './themeMath';
import { themeColors } from './tokens';

/** A small mock of the app drawn in any theme, independent of the active one. */
export function ThemePreviewCard({ look, height = 112 }: { look: ThemeAppearance, height?: number }) {
  const palette = useMemo(() => themeColors(look, false), [look]);
  const radius = (value: number) => Math.round(value * (THEME_CORNERS[look.style.corners] ?? 1));
  const image = safeBackgroundImage(look.backgroundImage);
  const gradient = look.style.gradient_color;

  return (
    <View style={[styles.frame, { height, borderRadius: radius(12), backgroundColor: palette.canvas, borderColor: palette.border }]}>
      {gradient ? <LinearGradient colors={[look.background, gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {image ? (
        <Image
          source={{ uri: `${mediaOrigin}${backgroundThumbnail(image)}` }}
          resizeMode={look.style.background_fit === 'tile' ? 'repeat' : 'cover'}
          style={[StyleSheet.absoluteFill, { opacity: THEME_BACKGROUND_IMAGE_OPACITY }]}
        />
      ) : null}
      <View style={[styles.bar, { borderBottomColor: palette.border, backgroundColor: palette.canvas }]}>
        <View style={[styles.logo, { backgroundColor: palette.accent, borderRadius: radius(3) }]} />
        <View style={[styles.search, { backgroundColor: palette.surface }]} />
        <View style={[styles.avatar, { backgroundColor: palette.surfaceStrong }]} />
      </View>
      <View style={styles.body}>
        <View style={styles.tiles}>
          {[0, 1, 2].map((tile) => (
            <View key={tile} style={[styles.tile, { backgroundColor: palette.surfaceStrong, borderRadius: radius(6) }]}>
              {tile === 1 ? <View style={[styles.progress, { backgroundColor: palette.accent }]} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <View style={[styles.pill, { backgroundColor: palette.accent }]}><Text style={[styles.pillText, { color: palette.onAccent }]}>Aa</Text></View>
          <View style={[styles.pill, { backgroundColor: palette.highlight }]}><Text style={[styles.pillText, { color: palette.onHighlight }]}>Aa</Text></View>
          <View style={[styles.line, { backgroundColor: palette.surfaceStrong }]} />
        </View>
      </View>
      {look.style.effect !== 'none' ? <Text style={[styles.effect, { color: palette.textMuted }]}>✦</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  logo: { width: 18, height: 9 },
  search: { flex: 1, height: 8, borderRadius: 999 },
  avatar: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1, padding: 10, gap: 8 },
  tiles: { flex: 1, flexDirection: 'row', gap: 6 },
  tile: { flex: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  progress: { height: 2, width: '65%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 9, fontWeight: '800' },
  line: { flex: 1, height: 6, borderRadius: 3 },
  effect: { position: 'absolute', right: 6, bottom: 4, fontSize: 10 },
});
