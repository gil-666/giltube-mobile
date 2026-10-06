import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';

import { mediaOrigin } from '@/config/environment';

import { useSiteTheme } from './ThemeProvider';
import { THEME_BACKGROUND_IMAGE_OPACITY, isAnimatedBackground, safeBackgroundImage, themeHasBackdrop, type ThemeEffect } from './themeMath';

// Draws the theme's backdrop once, behind every screen (screens use the
// transparent colors.screen while a backdrop is active): the gradient, the
// background image at the same fixed 40% as the website, and the particle
// effects. The website's WebGL animated backgrounds aren't available in the
// app, so those themes show their gradient and colors here.

// CSS angle (0deg = up, clockwise) to gradient start/end points.
function gradientPoints(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const x = Math.sin(radians) / 2;
  const y = -Math.cos(radians) / 2;
  return { start: { x: 0.5 - x, y: 0.5 - y }, end: { x: 0.5 + x, y: 0.5 + y } };
}

export function ThemeBackdrop() {
  const { appearance } = useSiteTheme();
  if (!themeHasBackdrop(appearance)) return null;

  const { style } = appearance;
  const image = safeBackgroundImage(appearance.backgroundImage);
  const points = gradientPoints(style.gradient_angle);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {style.gradient_color
        ? <LinearGradient colors={[appearance.background, style.gradient_color]} start={points.start} end={points.end} style={StyleSheet.absoluteFill} />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: appearance.background }]} />}
      {image ? (
        <Image
          source={{ uri: `${mediaOrigin}${image}` }}
          resizeMode={style.background_fit === 'tile' ? 'repeat' : 'cover'}
          blurRadius={style.background_blur}
          style={[StyleSheet.absoluteFill, { opacity: THEME_BACKGROUND_IMAGE_OPACITY }]}
        />
      ) : null}
      {!isAnimatedBackground(style.effect) && style.effect !== 'none'
        ? <Particles effect={style.effect} strength={style.effect_strength} />
        : null}
    </View>
  );
}

const COUNTS: Partial<Record<ThemeEffect, number>> = { snow: 28, sparkles: 18, bubbles: 14, stars: 40 };

// Same deterministic placement idea as the website's CSS effects.
const seeded = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Particles({ effect, strength }: { effect: ThemeEffect, strength: number }) {
  const { scheme } = useSiteTheme();
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const particles = useMemo(() => Array.from({ length: COUNTS[effect] || 0 }, (_, id) => {
    const r = (salt: number) => seeded(id + 1, salt);
    const size = effect === 'bubbles' ? 10 + r(1) * 30 : effect === 'sparkles' ? 6 + r(1) * 8 : 2 + r(1) * 3;
    return {
      id,
      size,
      x: r(2) * width,
      y: r(3) * height,
      duration: (effect === 'snow' ? 9 + r(4) * 12 : effect === 'bubbles' ? 12 + r(4) * 14 : 2.5 + r(4) * 4) * 1000,
      delay: r(5),
      drift: (r(6) - 0.5) * 120,
    };
  }), [effect, height, width]);

  if (reduceMotion || !particles.length) return null;
  const light = scheme === 'light';
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: strength / 100 }]}>
      {particles.map((particle) => <Particle key={particle.id} effect={effect} light={light} height={height} {...particle} />)}
    </View>
  );
}

function Particle({ effect, light, height, size, x, y, duration, delay, drift }: {
  effect: ThemeEffect, light: boolean, height: number, size: number, x: number, y: number, duration: number, delay: number, drift: number,
}) {
  const { appearance } = useSiteTheme();
  const [progress] = useState(() => new Animated.Value(delay));

  useEffect(() => {
    // Start part-way through so particles don't all appear at once.
    const first = Animated.timing(progress, { toValue: 1, duration: duration * (1 - delay), easing: Easing.linear, useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 1, duration, easing: effect === 'snow' || effect === 'bubbles' ? Easing.linear : Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const animation = Animated.sequence([first, loop]);
    animation.start();
    return () => animation.stop();
  }, [delay, duration, effect, progress]);

  const ink = light ? 'rgba(24, 24, 27, 0.55)' : 'rgba(244, 244, 245, 0.75)';
  if (effect === 'snow' || effect === 'bubbles') {
    const falling = effect === 'snow';
    const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: falling ? [-20, height + 20] : [height + 40, -60] });
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
    return (
      <Animated.View
        style={{
          position: 'absolute',
          left: x,
          top: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: falling ? ink : 'transparent',
          borderWidth: falling ? 0 : 1.5,
          borderColor: appearance.accent,
          opacity: falling ? 1 : 0.5,
          transform: [{ translateX }, { translateY }],
        }}
      />
    );
  }
  // Sparkles and stars twinkle in place.
  const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: effect === 'stars' ? [0.15, 0.85, 0.15] : [0, 0.9, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: effect === 'stars' ? [1, 1, 1] : [0.3, 1, 0.3] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: effect === 'stars' ? size / 2 : 1,
        backgroundColor: effect === 'stars' ? ink : appearance.primary,
        opacity,
        transform: [{ scale }, { rotate: effect === 'stars' ? '0deg' : rotate }, ...(effect === 'sparkles' ? [{ rotate: '45deg' }] : [])],
      }}
    />
  );
}
