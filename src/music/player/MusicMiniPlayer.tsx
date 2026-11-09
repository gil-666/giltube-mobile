import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { musicImage } from '@/music/quality';
import { MINI_PLAYER_HEIGHT, useMiniPlayerLayout } from '@/player/miniPlayerLayout';
import { colors, makeStyles, motion, radii } from '@/theme/tokens';

/**
 * The music bar above the tab bar: tap or swipe up opens the full player;
 * swipe it sideways or tap close to stop the music and dismiss it.
 */
export function MusicMiniPlayer({ hidden }: { hidden: boolean }) {
  const styles = useStyles();
  const { t } = useI18n();
  const pathname = usePathname();
  const layout = useMiniPlayerLayout();
  const { current, playing, buffering, position, duration, togglePlay, next, clearQueue, openPlayer } = useMusicPlayer();

  const translateX = useSharedValue(0);
  const swipeUp = useMemo(() => Gesture.Pan().activeOffsetY(-12).failOffsetX([-30, 30]).onEnd((event) => {
    if (event.translationY < -28 || event.velocityY < -500) runOnJS(openPlayer)();
  }), [openPlayer]);
  const swipeAway = useMemo(() => Gesture.Pan().activeOffsetX([-14, 14]).failOffsetY([-20, 20])
    .onUpdate((event) => { translateX.value = event.translationX; })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > 110 || Math.abs(event.velocityX) > 900) {
        const direction = (event.translationX || event.velocityX) < 0 ? -1 : 1;
        translateX.value = withTiming(direction * 520, { duration: 180 }, (finished) => {
          if (finished) runOnJS(clearQueue)();
        });
      } else translateX.value = withSpring(0, motion.spring);
    }), [clearQueue, translateX]);
  const gesture = useMemo(() => Gesture.Race(swipeUp, swipeAway), [swipeAway, swipeUp]);
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: 1 - Math.min(Math.abs(translateX.value) / 320, 0.7),
  }));

  // A new track after a dismissal starts back in place.
  useEffect(() => { if (current) translateX.value = 0; }, [current, translateX]);

  if (hidden || !current || !layout.visible || pathname === '/music/player') return null;
  const total = duration > 0 ? duration : current.duration_seconds || 0;
  const progress = total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;

  return (
    <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOutDown.duration(160)} style={[styles.wrap, { bottom: layout.bottom }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.bar, swipeStyle]}>
          <Pressable
            style={styles.main}
            onPress={() => openPlayer()}
            accessibilityRole="button"
            accessibilityLabel={t('Open player')}
          >
            <Image source={musicImage(current.cover_url, 'sm')} style={styles.cover} contentFit="cover" transition={150} />
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>{current.title}</Text>
              <Text numberOfLines={1} style={styles.artist}>{current.artist_name}</Text>
            </View>
          </Pressable>
          <PressableScale onPress={togglePlay} style={styles.button} accessibilityRole="button" accessibilityLabel={t(playing ? 'Pause' : 'Play')}>
            {buffering && playing
              ? <ActivityIndicator color={colors.text} size="small" />
              : <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.text} />}
          </PressableScale>
          <PressableScale onPress={next} style={styles.button} accessibilityRole="button" accessibilityLabel={t('Next')}>
            <Ionicons name="play-skip-forward" size={21} color={colors.text} />
          </PressableScale>
          <PressableScale onPress={clearQueue} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('Close player')}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </PressableScale>
          <View style={styles.track} pointerEvents="none">
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { position: 'absolute', zIndex: 100, left: 8, right: 8, height: MINI_PLAYER_HEIGHT },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 4,
    overflow: 'hidden',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.black,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', height: '100%' },
  cover: { width: 46, height: 46, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  copy: { flex: 1, minWidth: 0, paddingHorizontal: 11 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  artist: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  button: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 38, height: 48, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 10, right: 10, bottom: 0, height: 2, borderRadius: 1, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 2, backgroundColor: colors.accentBright },
}));
