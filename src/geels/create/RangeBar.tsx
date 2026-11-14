import { useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { colors, makeStyles } from '@/theme/tokens';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/**
 * A draggable window over a timeline: the sound's start (window = the Geel's
 * length within the track) or the cover frame (window = a thin marker).
 */
export function RangeBar({ total, window, value, onChange, onRelease, label }: {
  total: number; window: number; value: number; label: string;
  onChange: (value: number) => void; onRelease?: (value: number) => void;
}) {
  const styles = useStyles();
  const [width, setWidth] = useState(1);
  const span = Math.max(total - window, 0);
  const windowWidth = total > 0 ? Math.max(14, (Math.min(window, total) / total) * width) : width;
  const left = span > 0 ? (value / span) * (width - windowWidth) : 0;

  const fromX = (x: number) => {
    if (span <= 0) return 0;
    const ratio = Math.min(Math.max((x - windowWidth / 2) / Math.max(width - windowWidth, 1), 0), 1);
    return ratio * span;
  };
  const move = (x: number) => onChange(fromX(x));
  const release = (x: number) => onRelease?.(fromX(x));
  const gesture = Gesture.Pan().minDistance(0)
    .onBegin((event) => runOnJS(move)(event.x))
    .onUpdate((event) => runOnJS(move)(event.x))
    .onEnd((event) => runOnJS(release)(event.x));

  return <View style={styles.wrap}>
    <View style={styles.labels}><Text style={styles.label}>{label}</Text><Text style={styles.time}>{clock(value)}{window > 0.5 ? ` – ${clock(Math.min(value + window, total))}` : ''}</Text></View>
    <GestureDetector gesture={gesture}>
      <View style={styles.track} onLayout={(event) => setWidth(Math.max(event.nativeEvent.layout.width, 1))}>
        {Array.from({ length: 40 }, (_, index) => <View key={index} style={[styles.tick, { height: 6 + ((index * 37) % 17) }]} />)}
        <View pointerEvents="none" style={[styles.window, { left, width: windowWidth }]} />
      </View>
    </GestureDetector>
  </View>;
}

const useStyles = makeStyles(() => ({
  wrap: { gap: 8 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  time: { color: colors.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 44, borderRadius: 10, backgroundColor: colors.surfaceStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', overflow: 'hidden' },
  tick: { width: 2, borderRadius: 1, backgroundColor: colors.textDim },
  window: { position: 'absolute', top: 0, bottom: 0, borderRadius: 10, borderWidth: 3, borderColor: colors.accentBright, backgroundColor: 'rgba(239,68,68,0.18)' },
}));
