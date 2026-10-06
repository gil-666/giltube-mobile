import { useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { colors, makeStyles } from '@/theme/tokens';

export function formatMusicTime(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** Draggable progress bar with elapsed / remaining time. Seeks on release. */
export function SeekBar({ position, duration, onSeek, label }: { position: number; duration: number; onSeek: (seconds: number) => void; label: string }) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);

  const gesture = useMemo(() => {
    const fractionAt = (x: number) => (width > 0 ? Math.min(1, Math.max(0, x / width)) : 0);
    const update = (x: number) => setDrag(fractionAt(x));
    const commit = (x: number) => {
      const fraction = fractionAt(x);
      setDrag(null);
      if (duration > 0) onSeek(fraction * duration);
    };
    return Gesture.Pan()
      .minDistance(0)
      .hitSlop({ top: 14, bottom: 14 })
      .onBegin((event) => { runOnJS(update)(event.x); })
      .onUpdate((event) => { runOnJS(update)(event.x); })
      .onEnd((event) => { runOnJS(commit)(event.x); })
      .onFinalize((_event, success) => { if (!success) runOnJS(setDrag)(null); });
  }, [duration, onSeek, width]);

  const fraction = drag ?? (duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0);
  const shown = fraction * duration;
  const active = drag !== null;

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hit}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: `${formatMusicTime(shown)} / ${formatMusicTime(duration)}` }}
        >
          <View style={[styles.track, active && styles.trackActive]}>
            <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          </View>
          <View style={[styles.thumb, active && styles.thumbActive, { left: Math.max(0, fraction * width - (active ? 9 : 6)) }]} />
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={styles.time}>{formatMusicTime(shown)}</Text>
        <Text style={styles.time}>-{formatMusicTime(Math.max(0, duration - shown))}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  hit: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  trackActive: { height: 6, borderRadius: 3 },
  fill: { height: '100%', backgroundColor: colors.text },
  thumb: { position: 'absolute', top: 8, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
  thumbActive: { top: 5, width: 18, height: 18, borderRadius: 9 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
}));
