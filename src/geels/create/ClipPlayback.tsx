import { Ionicons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GeelSound } from '@/api/geels';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import type { DraftClip } from './drafts';

const clipOutput = (clip: DraftClip) => clip.duration / clip.speed;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

// Plays back what has been recorded so far, clip after clip at each clip's
// speed, with the sound lined up the way it will be in the Geel. Tap to
// pause; it loops until closed.
export function ClipPlayback({ clips, sound, soundStartMS, onClose }: {
  clips: DraftClip[];
  sound: GeelSound | null;
  soundStartMS: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const clipIndex = useRef(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = clips.reduce((sum, clip) => sum + clipOutput(clip), 0);

  const player = useVideoPlayer(null, (created) => { created.loop = false; created.timeUpdateEventInterval = 0.1; });
  const soundPlayer = useVideoPlayer(sound ? { uri: resolveMediaURL(sound.audio_url) } : null, (created) => { created.loop = false; });
  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: 0, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null });

  // Loads and plays clip `next` (no state changes, so the mount effect can call it).
  const loadClip = useCallback(async (next: number) => {
    const clip = clips[next];
    if (!clip) return;
    clipIndex.current = next;
    await player.replaceAsync({ uri: clip.uri });
    player.playbackRate = clip.speed;
    player.currentTime = 0;
    player.play();
    if (sound) {
      const before = clips.slice(0, next).reduce((sum, item) => sum + clipOutput(item), 0);
      soundPlayer.currentTime = soundStartMS / 1000 + before;
      soundPlayer.play();
    }
  }, [clips, player, sound, soundPlayer, soundStartMS]);

  useEffect(() => { void loadClip(0); }, [loadClip]);
  useEventListener(player, 'playToEnd', () => {
    const next = clipIndex.current + 1 < clips.length ? clipIndex.current + 1 : 0;
    setIndex(next);
    setPaused(false);
    void loadClip(next);
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);

  const togglePause = () => {
    if (paused) {
      player.play();
      if (sound) soundPlayer.play();
    } else {
      player.pause();
      soundPlayer.pause();
    }
    setPaused(!paused);
  };

  const current = clips[index];
  const before = clips.slice(0, index).reduce((sum, item) => sum + clipOutput(item), 0);
  const elapsed = Math.min(total, before + (current ? (timeUpdate?.currentTime ?? 0) / current.speed : 0));

  return <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.screen}>
    <Pressable accessibilityRole="button" accessibilityLabel={t(paused ? 'Play' : 'Pause')} onPress={togglePause} style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {paused && <View pointerEvents="none" style={styles.center}><Ionicons name="play" size={72} color="rgba(255,255,255,0.9)" /></View>}
    </Pressable>

    <View pointerEvents="none" style={[styles.progress, { top: insets.top + 8 }]}>
      {clips.map((clip, position) => {
        const start = clips.slice(0, position).reduce((sum, item) => sum + clipOutput(item), 0);
        const fill = Math.min(1, Math.max(0, (elapsed - start) / clipOutput(clip)));
        return <View key={`${clip.uri}-${position}`} style={[styles.part, { flex: clipOutput(clip) }]}>
          <View style={[styles.partFill, { width: `${fill * 100}%` }]} />
        </View>;
      })}
    </View>

    <Pressable accessibilityLabel={t('Close')} onPress={onClose} style={[styles.close, { top: insets.top + 22 }]} hitSlop={8}>
      <Ionicons name="close" size={28} color="#fff" />
    </Pressable>
    <Text style={[styles.label, { top: insets.top + 30 }]}>{t('Playback')}</Text>

    <View pointerEvents="none" style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
      <Text style={styles.time}>{clock(elapsed)} / {clock(total)}</Text>
      {clips.length > 1 && <Text style={styles.clipLabel}>{t('Clip {current} of {total}', { current: index + 1, total: clips.length })}</Text>}
    </View>
  </Animated.View>;
}

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  screen: { ...fill, backgroundColor: '#000', zIndex: 20 },
  center: { ...fill, alignItems: 'center', justifyContent: 'center' },
  progress: { position: 'absolute', left: 12, right: 12, height: 5, flexDirection: 'row', gap: 2 },
  part: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.3)' },
  partFill: { height: 5, backgroundColor: colors.accentBright },
  close: { position: 'absolute', left: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: 15, fontWeight: '900', ...shadow },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 4 },
  time: { color: '#fff', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], ...shadow },
  clipLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', ...shadow },
});
