import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';
import type { Promotion } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';
import { localizePromotion } from '@/utils/titleLogo';

/** Same height as a catalog poster card (146x218 poster and its caption). */
export const PROMO_BANNER_HEIGHT = 260;

// Impressions are counted once per promotion per app session.
const countedImpressions = new Set<string>();

/** Mixes two #rrggbb colors; amount is the share of b. */
function mix(a: string, b: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) || 0);
  const [x, y] = [parse(a), parse(b)];
  return `rgb(${x.map((value, index) => Math.round(value + (y[index] - value) * amount)).join(',')})`;
}

function withOpacity(hex: string, opacity: number) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) || 0);
  return `rgba(${r},${g},${b},${opacity})`;
}

// Butterflies with fixed flight paths (fractions of the banner), so the row
// looks calm and the same for everyone.
const FLYERS = [
  { size: 22, top: 0.12, duration: 26000, start: 0.15, dir: 1, bob: 3300, flap: 320, tilt: 18 },
  { size: 15, top: 0.6, duration: 33000, start: 0.45, dir: 1, bob: 4200, flap: 270, tilt: 24 },
  { size: 26, top: 0.36, duration: 29000, start: 0.75, dir: -1, bob: 3800, flap: 360, tilt: 14 },
  { size: 13, top: 0.05, duration: 38000, start: 0.25, dir: -1, bob: 2900, flap: 250, tilt: 28 },
  { size: 18, top: 0.72, duration: 24000, start: 0.7, dir: 1, bob: 3500, flap: 300, tilt: 20 },
  { size: 14, top: 0.46, duration: 35000, start: 0.85, dir: 1, bob: 4500, flap: 260, tilt: 26 },
];

function Flyer({ sprite, accent, width, height, flyer, still }: { sprite: string; accent: string; width: number; height: number; flyer: (typeof FLYERS)[number]; still: boolean }) {
  const progress = useSharedValue(flyer.start);
  const bob = useSharedValue(0.5);
  const flap = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    // Finish the first crossing from the start point, then loop.
    progress.value = withSequence(
      withTiming(1, { duration: flyer.duration * (1 - flyer.start), easing: Easing.linear }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: flyer.duration, easing: Easing.linear })), -1, false),
    );
    bob.value = withRepeat(withTiming(1, { duration: flyer.bob, easing: Easing.inOut(Easing.sin) }), -1, true);
    flap.value = withRepeat(withTiming(1, { duration: flyer.flap, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => {
      cancelAnimation(progress);
      cancelAnimation(bob);
      cancelAnimation(flap);
    };
  }, [bob, flap, flyer, progress, still]);
  const flight = useAnimatedStyle(() => {
    const along = flyer.dir > 0 ? progress.value : 1 - progress.value;
    return {
      transform: [
        { translateX: -flyer.size - 8 + along * (width + flyer.size * 2 + 16) },
        { translateY: (bob.value - 0.5) * 24 },
        { rotate: `${(bob.value - 0.5) * 12}deg` },
      ],
    };
  });
  const wings = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - flap.value * 0.72 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: flyer.top * height, width: flyer.size, height: flyer.size }, flight]}>
      <View style={{ flex: 1, transform: [{ scaleX: flyer.dir < 0 ? -1 : 1 }] }}>
        <Animated.View style={[{ flex: 1 }, wings]}>
          <Image source={sprite} contentFit="contain" style={{ flex: 1, transform: [{ rotate: `${flyer.tilt}deg` }], shadowColor: accent }} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** A butterfly resting on the corner of the Polaroid, opening its wings now and then. */
function Rester({ sprite, still }: { sprite: string; still: boolean }) {
  const flap = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    flap.value = withRepeat(withSequence(
      withTiming(0, { duration: 2800 }),
      withTiming(1, { duration: 360, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 360, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.6, { duration: 280 }),
      withTiming(0, { duration: 280 }),
    ), -1, false);
    return () => cancelAnimation(flap);
  }, [flap, still]);
  const wings = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - flap.value * 0.62 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -15, right: 6, width: 26, height: 26, transform: [{ rotate: '16deg' }] }]}>
      <Animated.View style={[{ flex: 1 }, wings]}>
        <Image source={sprite} contentFit="contain" style={{ flex: 1 }} />
      </Animated.View>
    </Animated.View>
  );
}

/** Coast and lighthouse with a sweeping beam, drawn with plain views. */
function LighthouseScene({ width, height, from, still }: { width: number; height: number; from: string; still: boolean }) {
  const sweep = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    sweep.value = withRepeat(withTiming(1, { duration: 11000, easing: Easing.inOut(Easing.sin) }), -1, true);
    glow.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(glow);
    };
  }, [glow, still, sweep]);
  const farCliff = mix(from, '#000000', 0.18);
  const nearCliff = mix(from, '#000000', 0.4);
  const tower = mix(from, '#000000', 0.3);
  // The lamp sits on the cliff near the right edge.
  const lampX = width - 44;
  const towerBottom = height * 0.36;
  const towerHeight = height * 0.3;
  const lampY = height - towerBottom - towerHeight - 9;
  const beamLength = width * 1.1;
  const beam = useAnimatedStyle(() => ({ opacity: 0.55 + sweep.value * 0.35, transform: [{ rotate: `${-14 + sweep.value * 22}deg` }] }));
  const lamp = useAnimatedStyle(() => ({ opacity: 0.45 + glow.value * 0.45 }));
  const stars = [[0.12, 0.2], [0.27, 0.55], [0.39, 0.12], [0.53, 0.34], [0.66, 0.08], [0.81, 0.27], [0.92, 0.14]];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map(([x, y], index) => <View key={index} style={{ position: 'absolute', left: x * width, top: y * height * 0.55, width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />)}
      {/* The beam pivots on the lamp: only the left half of its box is lit. */}
      <Animated.View style={[{ position: 'absolute', left: lampX - beamLength, top: lampY - 13, width: beamLength * 2, height: 26 }, beam]}>
        <LinearGradient colors={['rgba(255,233,168,0)', 'rgba(255,233,168,0.18)', 'rgba(255,243,196,0.6)']} locations={[0, 0.6, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: beamLength, height: 26, borderRadius: 13 }} />
      </Animated.View>
      <View style={{ position: 'absolute', right: -width * 0.12, bottom: -height * 0.28, width: width * 0.8, height: height * 0.64, borderTopLeftRadius: width * 0.6, borderTopRightRadius: width * 0.18, backgroundColor: farCliff }} />
      <View style={{ position: 'absolute', right: -width * 0.06, bottom: -height * 0.32, width: width * 0.58, height: height * 0.5, borderTopLeftRadius: width * 0.5, borderTopRightRadius: width * 0.1, backgroundColor: nearCliff }} />
      {/* Tower (a trapezoid), gallery, lantern and roof. */}
      <View style={{ position: 'absolute', left: lampX - 6.5, bottom: towerBottom, width: 9, height: 0, borderBottomWidth: towerHeight, borderLeftWidth: 2, borderRightWidth: 2, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: tower }} />
      <View style={{ position: 'absolute', left: lampX - 8, top: lampY + 6, width: 16, height: 3, borderRadius: 1, backgroundColor: tower }} />
      <View style={{ position: 'absolute', left: lampX - 4.5, top: lampY - 3, width: 9, height: 9, borderRadius: 1.5, backgroundColor: '#ffe9a8' }} />
      <View style={{ position: 'absolute', left: lampX - 6.5, top: lampY - 10, width: 0, height: 0, borderLeftWidth: 6.5, borderRightWidth: 6.5, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: tower }} />
      <Animated.View style={[{ position: 'absolute', left: lampX - 15, top: lampY - 14, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,217,120,0.45)' }, lamp]} />
    </View>
  );
}

/** A promotion as a row the height of a catalog poster card. */
export function PromoBanner({ promo }: { promo: Promotion }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { width: windowWidth } = useWindowDimensions();
  const width = windowWidth - 36;
  const height = PROMO_BANNER_HEIGHT;
  const still = useReducedMotion();
  const [logoSize, setLogoSize] = useState<{ width: number; height: number } | null>(null);
  const theme = promo.theme;
  const sprite = promo.effect === 'flutter' && promo.sprite_url ? resolveMediaURL(promo.sprite_url) : '';
  const photoWidth = Math.min(width * 0.52, height * 0.2 * 2.8);

  useEffect(() => {
    if (countedImpressions.has(promo.id)) return;
    countedImpressions.add(promo.id);
    void giltubeAPI.promotionEvent(promo.id, 'impression');
  }, [promo.id]);

  const open = () => {
    void giltubeAPI.promotionEvent(promo.id, 'click');
    void Linking.openURL(promo.url);
  };

  return (
    <PressableScale onPress={open} accessibilityRole="link" accessibilityLabel={[promo.cta_label || t('Play now'), promo.title, promo.badge].filter(Boolean).join(' · ')} style={[styles.banner, { height, shadowColor: theme.accent }]}>
      <LinearGradient colors={[theme.from, theme.via, mix(theme.via, theme.to, 0.62)]} locations={[0, 0.56, 1]} start={{ x: 0, y: 0.15 }} end={{ x: 1, y: 0.85 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', withOpacity(theme.to, 0.55)]} start={{ x: 0.35, y: 0.2 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[withOpacity(theme.accent, 0.16), 'transparent']} start={{ x: 0.8, y: 0 }} end={{ x: 0.35, y: 0.7 }} style={StyleSheet.absoluteFill} />
      {promo.scene === 'lighthouse' && <LighthouseScene width={width} height={height} from={theme.from} still={still} />}

      <View style={styles.lead}>
        {promo.logo_url ? (
          <Image
            source={resolveMediaURL(promo.logo_url)}
            accessibilityLabel={promo.title}
            contentFit="contain"
            tintColor={promo.logo_style === 'white' ? '#ffffff' : undefined}
            style={logoSize || { width: width * 0.72, height: height * 0.17 }}
            onLoad={(event) => {
              const aspect = event.source.width / Math.max(event.source.height, 1);
              const logoWidth = Math.min(width * 0.72, height * 0.17 * aspect);
              setLogoSize({ width: logoWidth, height: logoWidth / aspect });
            }}
          />
        ) : <Text style={styles.title} numberOfLines={2}>{promo.title}</Text>}
        {!!promo.tagline && <Text style={styles.tagline} numberOfLines={2}>{promo.tagline}</Text>}
        <View style={styles.actions}>
          <View style={styles.cta}><Ionicons name="play" size={14} color="#0b0b10" /><Text style={styles.ctaText}>{promo.cta_label || t('Play now')}</Text></View>
          {!!promo.badge && <View style={[styles.badge, { borderColor: withOpacity(theme.accent, 0.7), backgroundColor: withOpacity(theme.accent, 0.14) }]}><Text style={[styles.badgeText, { color: mix(theme.accent, '#ffffff', 0.3) }]}>{promo.badge.toUpperCase()}</Text></View>}
        </View>
      </View>

      {!!promo.partner_url && (promo.partner_style === 'card' ? (
        <View style={[styles.polaroid, { width: photoWidth + 14 }]}>
          <View style={styles.tape} />
          <View style={[styles.photo, { width: photoWidth, height: photoWidth / 2.8 }]}>
            <Image source={resolveMediaURL(promo.partner_url)} contentFit="contain" style={StyleSheet.absoluteFill} />
          </View>
          {!!promo.partner_caption && <Text style={styles.caption} numberOfLines={1}>{promo.partner_caption}</Text>}
          {!!sprite && <Rester sprite={sprite} still={still} />}
        </View>
      ) : <Image source={resolveMediaURL(promo.partner_url)} contentFit="contain" style={[styles.partnerLogo, { width: photoWidth, height: photoWidth / 3 }]} />)}

      {!!sprite && FLYERS.map((flyer, index) => <Flyer key={index} sprite={sprite} accent={theme.accent} width={width} height={height} flyer={flyer} still={still} />)}
    </PressableScale>
  );
}

/** The promotions for one home placement, each with its row title. */
export function PromoSlot({ placement }: { placement: string }) {
  const styles = useStyles();
  const { locale } = useI18n();
  const promotions = useQuery({ queryKey: ['promotions', 'home'], queryFn: () => giltubeAPI.promotions('home'), staleTime: 5 * 60_000 });
  const items = useMemo(() => (promotions.data || []).filter((promo) => promo.placement === `home:${placement}`).map((promo) => localizePromotion(promo, locale)), [locale, placement, promotions.data]);
  if (!items.length) return null;
  return (
    <>
      {items.map((promo) => (
        <View key={promo.id} style={styles.section}>
          {!!promo.label && <Text style={styles.sectionTitle}>{promo.label}</Text>}
          <View style={styles.sectionBody}><PromoBanner promo={promo} /></View>
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles(() => ({
  section: { marginTop: 26 },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '900', paddingHorizontal: 18, marginBottom: 12 },
  sectionBody: { paddingHorizontal: 18 },
  banner: { overflow: 'hidden', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  lead: { position: 'absolute', left: 18, top: 22, right: 18, gap: 11, alignItems: 'flex-start' },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  tagline: { color: 'rgba(244,244,245,0.86)', fontSize: 12, lineHeight: 16, maxWidth: '62%' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#ffffff' },
  ctaText: { color: '#0b0b10', fontSize: 13, fontWeight: '800' },
  badge: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  polaroid: { position: 'absolute', right: 14, bottom: 14, padding: 7, paddingBottom: 0, borderRadius: 3, backgroundColor: '#fbfaf6', transform: [{ rotate: '-6deg' }], shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  tape: { position: 'absolute', top: -7, alignSelf: 'center', left: '32%', width: 52, height: 14, backgroundColor: 'rgba(255,255,255,0.55)', transform: [{ rotate: '3deg' }], zIndex: 2 },
  photo: { backgroundColor: '#f1f2f7', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  caption: { color: '#2c2a35', fontSize: 12, fontStyle: 'italic', fontWeight: '600', textAlign: 'center', paddingVertical: 5, fontFamily: Platform.select({ android: 'serif', ios: 'Noteworthy', default: undefined }) },
  partnerLogo: { position: 'absolute', right: 16, bottom: 16 },
}));
