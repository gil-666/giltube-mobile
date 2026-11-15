import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { giltubeAPI } from '@/api/giltube';
import { themesAPI, type ThemeRecord } from '@/api/themes';
import { useAuth } from '@/auth/AuthProvider';
import { mediaOrigin } from '@/config/environment';
import { useI18n } from '@/i18n';
import { useSiteTheme } from '@/theme/ThemeProvider';
import type { Promotion } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

// Persona 3 Reload soundtrack promotion (scene "persona3"), matching the web's
// PersonaPromo.vue: water-blue backdrop, the key art's sky-blue slash, the
// cover over a spinning record, and two game-style buttons.

const THEME_SHARE_CODE = 'GilTubePersona3Reload';
const SKY = '#10b1f5';
const RED = '#e2182d';
const INK = '#04103a';

const SHARDS = [
  { left: 0.46, top: 0.1, size: 20, rot: 18, tone: 0.8 },
  { left: 0.6, top: 0.62, size: 14, rot: -24, tone: 0.55 },
  { left: 0.9, top: 0.08, size: 12, rot: 28, tone: 0.75 },
  { left: 0.86, top: 0.86, size: 16, rot: -10, tone: 0.6 },
];

/** Same-site links open in the app; anything else in the browser. */
function appPath(url: string) {
  try {
    const target = new URL(url);
    return target.origin === mediaOrigin ? `${target.pathname}${target.search}` : '';
  } catch {
    return '';
  }
}

export function PersonaPromoBanner({ promo, width, height }: { promo: Promotion; width: number; height: number }) {
  const { t } = useI18n();
  const { account } = useAuth();
  const { active, apply } = useSiteTheme();
  const still = useReducedMotion();
  const [record, setRecord] = useState<ThemeRecord | null>(null);
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);
  const spin = useSharedValue(0);
  const coverSize = Math.min(width * 0.34, height * 0.48);

  useEffect(() => {
    themesAPI.shared(THEME_SHARE_CODE).then(({ theme }) => setRecord(theme)).catch(() => {});
  }, []);

  useEffect(() => {
    if (still) return;
    spin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin, still]);
  const spinning = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  const themeOn = !!record && active.id === record.id;

  const listen = () => {
    void giltubeAPI.promotionEvent(promo.id, 'click');
    const path = appPath(promo.url);
    if (path) router.push(path as never);
    else void Linking.openURL(promo.url);
  };

  const applyTheme = async () => {
    if (themeOn || applying) return;
    setFailed(false);
    if (!account) {
      router.push('/login');
      return;
    }
    setApplying(true);
    try {
      const theme = record || (await themesAPI.shared(THEME_SHARE_CODE)).theme;
      setRecord(theme);
      await apply(theme);
      void giltubeAPI.promotionEvent(promo.id, 'click');
    } catch {
      setFailed(true);
    } finally {
      setApplying(false);
    }
  };

  return (
    <View style={[styles.banner, { height }]} accessibilityLabel={promo.title}>
      <LinearGradient colors={['#020414', '#011762', '#0a3fbf']} locations={[0, 0.46, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(120,220,255,0.22)', 'transparent']} start={{ x: 0.3, y: 0 }} end={{ x: 0.6, y: 0.6 }} style={StyleSheet.absoluteFill} />
      {/* Sky-blue slash: a skewed band behind the art. */}
      <View pointerEvents="none" style={[styles.slash, { right: -width * 0.06, width: width * 0.5, transform: [{ skewX: '-16deg' }] }]}>
        <LinearGradient colors={['#4fd0ff', SKY, '#0a7fd1']} style={StyleSheet.absoluteFill} />
        <View style={styles.slashLine} />
      </View>
      <Text pointerEvents="none" style={styles.watermark} numberOfLines={1}>PERSONA3</Text>
      {SHARDS.map((shard, index) => (
        <View key={index} pointerEvents="none" style={{ position: 'absolute', left: shard.left * width, top: shard.top * height, width: shard.size, height: shard.size * 1.35, opacity: shard.tone, backgroundColor: '#d8f5ff', transform: [{ rotate: `${shard.rot + 45}deg` }, { scaleY: 0.6 }] }} />
      ))}

      <View pointerEvents="none" style={[styles.art, { width: coverSize, height: coverSize, right: 30, bottom: 26 }]}>
        <Animated.View style={[styles.record, { width: coverSize * 0.92, height: coverSize * 0.92, borderRadius: coverSize, right: -coverSize * 0.42, top: coverSize * 0.04 }, spinning]}>
          <View style={[styles.recordLabel, { width: coverSize * 0.3, height: coverSize * 0.3, borderRadius: coverSize }]} />
        </Animated.View>
        <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]} />
        {!!promo.partner_url && <Image source={resolveMediaURL(promo.partner_url)} contentFit="cover" style={[styles.cover, { width: coverSize, height: coverSize }]} />}
      </View>

      <View style={[styles.lead, { maxWidth: width * 0.62 }]}>
        {!!promo.badge && <View style={styles.kicker}><Text style={styles.kickerText}>{promo.badge.toUpperCase()}</Text></View>}
        <Text style={styles.title} numberOfLines={3}>{promo.title.toUpperCase()}</Text>
        {!!promo.tagline && <Text style={styles.tagline} numberOfLines={3}>{promo.tagline}</Text>}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="link" onPress={listen} style={({ pressed }) => [styles.button, styles.listen, pressed && styles.pressed]}>
          <View style={styles.buttonInner}>
            <Ionicons name="play" size={13} color="#ffffff" />
            <Text style={[styles.buttonText, styles.listenText]}>{(promo.cta_label || t('Listen now')).toUpperCase()}</Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={themeOn || applying} onPress={() => void applyTheme()} style={({ pressed }) => [styles.button, styles.theme, themeOn && styles.themeOn, pressed && styles.pressed]}>
          <View style={styles.buttonInner}>
            <Ionicons name={themeOn ? 'checkmark' : 'color-palette'} size={14} color={INK} />
            <Text style={[styles.buttonText, styles.themeText]}>{(themeOn ? t('Theme on') : applying ? t('Applying…') : t('Apply theme')).toUpperCase()}</Text>
          </View>
        </Pressable>
      </View>
      {failed && <Text style={styles.error}>{t("Couldn't apply the theme")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { overflow: 'hidden', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#011762', shadowColor: SKY, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  slash: { position: 'absolute', top: -20, bottom: -20, opacity: 0.92, overflow: 'hidden' },
  slashLine: { position: 'absolute', left: 8, top: 0, bottom: 0, width: 4, backgroundColor: 'rgba(255,255,255,0.85)' },
  watermark: { position: 'absolute', left: -4, bottom: -22, color: 'rgba(255,255,255,0.07)', fontSize: 86, fontStyle: 'italic', fontWeight: '900', letterSpacing: -3 },
  art: { position: 'absolute' },
  record: { position: 'absolute', backgroundColor: '#07080f', alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#12151f' },
  recordLabel: { backgroundColor: RED, borderWidth: 3, borderColor: '#ffffff' },
  coverShadow: { position: 'absolute', left: 9, top: 9, backgroundColor: RED, transform: [{ rotate: '-6deg' }] },
  cover: { position: 'absolute', left: 0, top: 0, borderWidth: 3, borderColor: '#ffffff', transform: [{ rotate: '-6deg' }] },
  lead: { position: 'absolute', left: 16, top: 18, gap: 8, alignItems: 'flex-start' },
  kicker: { backgroundColor: RED, paddingHorizontal: 10, paddingVertical: 3, transform: [{ skewX: '-14deg' }, { rotate: '-2deg' }], shadowColor: '#000000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  kickerText: { color: '#ffffff', fontSize: 10, fontStyle: 'italic', fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#ffffff', fontSize: 22, lineHeight: 23, fontStyle: 'italic', fontWeight: '900', letterSpacing: -0.4, textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0, paddingRight: 4 },
  tagline: { color: '#d6f2ff', fontSize: 12, lineHeight: 16, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  actions: { position: 'absolute', left: 16, bottom: 18, flexDirection: 'row', gap: 10 },
  button: { height: 38, paddingHorizontal: 14, justifyContent: 'center', transform: [{ skewX: '-14deg' }], shadowColor: '#000000', shadowOpacity: 0.85, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 4 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ skewX: '14deg' }] },
  buttonText: { fontSize: 12, fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.6 },
  listen: { backgroundColor: RED },
  listenText: { color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  theme: { backgroundColor: '#ffffff', borderBottomWidth: 3, borderBottomColor: RED },
  themeOn: { backgroundColor: SKY },
  themeText: { color: INK },
  pressed: { opacity: 0.85, transform: [{ skewX: '-14deg' }, { translateX: 1 }, { translateY: 1 }] },
  error: { position: 'absolute', left: 16, bottom: 4, color: '#ffd2d6', fontSize: 11, fontWeight: '700' },
});
