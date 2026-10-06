import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDuration } from './api';
import { AdminButton, AdminButtons } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

/**
 * Mobile stand-in for the web's intro picker: plays the episode and lets the
 * admin mark the current position as intro start/end, then preview the range.
 * Without `onChange` it only previews a range (intro suggestion review).
 */
export function IntroPlayer({ hlsPath, start, end, onChange }: { hlsPath: string; start: number; end: number; onChange?: (start: number, end: number) => void }) {
  const styles = useStyles();
  const { t } = useI18n();
  const player = useVideoPlayer(resolveMediaURL(hlsPath), (instance) => {
    instance.timeUpdateEventInterval = 0.2;
    if (start > 0) instance.currentTime = start;
  });
  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: player.currentTime, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null });
  const currentTime = timeUpdate?.currentTime ?? 0;
  // Stops "preview range" playback at the intro end.
  const previewEnd = useRef(0);
  useEventListener(player, 'timeUpdate', ({ currentTime: time }) => {
    if (previewEnd.current > 0 && time >= previewEnd.current) {
      previewEnd.current = 0;
      player.pause();
    }
  });

  const now = () => Math.max(0, Number((player.currentTime || 0).toFixed(2)));
  const setPoint = (point: 'start' | 'end') => {
    if (!onChange) return;
    const value = now();
    if (point === 'start') onChange(value, Math.max(end, value));
    else onChange(Math.min(start, value), value);
  };
  const previewRange = () => {
    if (end <= start) return;
    player.currentTime = start;
    previewEnd.current = end;
    player.play();
  };

  return <View>
    <View style={styles.video}><VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" /></View>
    <View style={styles.stats}>
      <Stat label={t('Current time')} value={formatDuration(currentTime)} />
      <Stat label={t('Intro start')} value={formatDuration(start)} />
      <Stat label={t('Intro end')} value={formatDuration(end)} />
    </View>
    <AdminButtons>
      {!!onChange && <AdminButton compact label={t('Set start here')} icon="flag-outline" onPress={() => setPoint('start')} />}
      {!!onChange && <AdminButton compact label={t('Set end here')} icon="flag" onPress={() => setPoint('end')} />}
      <AdminButton compact variant="primary" label={onChange ? t('Preview range') : t('Play suggested range')} icon="play" disabled={end <= start} onPress={previewRange} />
    </AdminButtons>
  </View>;
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

const useStyles = makeStyles(() => ({
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.black },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: { flex: 1, borderRadius: radii.md, backgroundColor: colors.surfaceStrong, padding: 10 },
  statLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '900', fontFamily: 'monospace', marginTop: 3 },
}));
