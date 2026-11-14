import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GeelSound } from '@/api/geels';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import type { DraftClip } from './drafts';

export const GEEL_LENGTHS = [15, 60, 180] as const;
const SPEEDS = [0.5, 1, 2, 3] as const;
const TIMERS = [0, 3, 10] as const;
const MIN_CLIP_SECONDS = 0.35;

export const clipOutput = (clip: DraftClip) => clip.duration / clip.speed;
export const totalOutput = (clips: DraftClip[]) => clips.reduce((sum, clip) => sum + clipOutput(clip), 0);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export function GeelRecorder({ clips, setClips, maxSeconds, setMaxSeconds, sound, soundStartMS, onPickSound, onNext, onClose }: {
  clips: DraftClip[];
  setClips: (update: (clips: DraftClip[]) => DraftClip[]) => void;
  maxSeconds: number;
  setMaxSeconds: (seconds: number) => void;
  sound: GeelSound | null;
  soundStartMS: number;
  onPickSound: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [torch, setTorch] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [timer, setTimer] = useState<number>(0);
  const [zoom, setZoom] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [resumeAfterFlip, setResumeAfterFlip] = useState(false);
  const startedAt = useRef(0);
  const pressedAt = useRef(0);
  const holdCandidate = useRef(false);
  const flipPending = useRef(false);
  const recordingRef = useRef(false);
  const zoomValue = useSharedValue(0);
  const zoomAtPinchStart = useSharedValue(0);

  const recorded = totalOutput(clips);
  const live = recording ? liveSeconds / speed : 0;
  const remaining = Math.max(maxSeconds - recorded, 0);
  const soundPlayer = useVideoPlayer(sound ? { uri: resolveMediaURL(sound.audio_url) } : null, (player) => { player.loop = false; });

  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setLiveSeconds((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(interval);
  }, [recording]);

  // The sound plays along while recording, slowed or sped up so it lands in
  // time once the clip's speed is applied.
  const startSound = useCallback(() => {
    if (!sound) return;
    soundPlayer.currentTime = soundStartMS / 1000 + totalOutput(clips);
    soundPlayer.playbackRate = 1 / speed;
    soundPlayer.play();
  }, [clips, sound, soundPlayer, soundStartMS, speed]);

  const startClip = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || !cameraReady || recordingRef.current || remaining < MIN_CLIP_SECONDS) return;
    recordingRef.current = true;
    setRecording(true);
    setLiveSeconds(0);
    setSpeedOpen(false);
    startedAt.current = Date.now();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSound();
    const clipFacing = facing;
    const clipSpeed = speed;
    try {
      const result = await camera.recordAsync({ maxDuration: Math.max(remaining * clipSpeed, MIN_CLIP_SECONDS) });
      const duration = Math.min((Date.now() - startedAt.current) / 1000, remaining * clipSpeed);
      if (result?.uri && duration >= MIN_CLIP_SECONDS) {
        setClips((current) => [...current, { uri: result.uri, duration, speed: clipSpeed, facing: clipFacing }]);
      } else if (result?.uri) {
        try { new File(result.uri).delete(); } catch { /* already gone */ }
      }
    } catch (error) {
      Alert.alert(t('Recording stopped'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      recordingRef.current = false;
      setRecording(false);
      setLiveSeconds(0);
      soundPlayer.pause();
      if (flipPending.current) {
        flipPending.current = false;
        setCameraReady(false);
        setFacing((value) => (value === 'front' ? 'back' : 'front'));
        setResumeAfterFlip(true);
      }
    }
  }, [cameraReady, facing, remaining, setClips, soundPlayer, speed, startSound, t]);

  const stopClip = useCallback(() => {
    if (!recordingRef.current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cameraRef.current?.stopRecording();
  }, []);

  // After a flip mid-recording, carry on as soon as the other camera is up.
  // onCameraReady doesn't fire on every device after a flip, so also wait a beat.
  useEffect(() => {
    if (!resumeAfterFlip) return;
    const timeout = setTimeout(() => setCameraReady(true), 900);
    return () => clearTimeout(timeout);
  }, [resumeAfterFlip]);
  useEffect(() => {
    if (!resumeAfterFlip || !cameraReady) return;
    const timeout = setTimeout(() => {
      setResumeAfterFlip(false);
      void startClip();
    }, 0);
    return () => clearTimeout(timeout);
  }, [cameraReady, resumeAfterFlip, startClip]);

  const flip = () => {
    void Haptics.selectionAsync();
    setTorch(false);
    if (recordingRef.current) {
      flipPending.current = true;
      stopClip();
      return;
    }
    setCameraReady(false);
    setFacing((value) => (value === 'front' ? 'back' : 'front'));
  };

  // Countdown before a hands-free clip.
  useEffect(() => {
    if (countdown <= 0) return;
    const timeout = setTimeout(() => {
      if (countdown === 1) {
        setCountdown(0);
        void startClip();
      } else {
        void Haptics.selectionAsync();
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [countdown, startClip]);

  // Tap: start/stop. Hold: record while pressed.
  const onPressIn = () => {
    pressedAt.current = Date.now();
    holdCandidate.current = false;
    if (countdown > 0) { setCountdown(0); return; }
    if (recordingRef.current) { stopClip(); return; }
    if (remaining < MIN_CLIP_SECONDS) { onNext(); return; }
    if (timer > 0) { setCountdown(timer); return; }
    holdCandidate.current = true;
    void startClip();
  };
  const onPressOut = () => {
    if (holdCandidate.current && Date.now() - pressedAt.current > 400) stopClip();
    holdCandidate.current = false;
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stopClip(); });
    return () => subscription.remove();
  }, [stopClip]);

  const undo = () => {
    const last = clips[clips.length - 1];
    if (!last) return;
    Alert.alert(t('Delete last clip?'), undefined, [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => {
        setClips((current) => current.slice(0, -1));
        if (!last.imported) { try { new File(last.uri).delete(); } catch { /* already gone */ } }
      } },
    ]);
  };

  const importFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, videoMaxDuration: 180 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const seconds = (asset.duration || 0) / 1000;
    if (seconds <= 0) { Alert.alert(t('Couldn’t read that video'), t('Please try another one.')); return; }
    if (recorded + seconds > 180.5) {
      Alert.alert(t('Too long for a Geel'), t('Geels can be up to 3 minutes. Trim the video first and try again.'));
      return;
    }
    const needed = GEEL_LENGTHS.find((length) => length >= recorded + seconds) ?? 180;
    if (needed > maxSeconds) setMaxSeconds(needed);
    setClips((current) => [...current, { uri: asset.uri, duration: seconds, speed: 1, facing: 'back', imported: true }]);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => { zoomAtPinchStart.value = zoomValue.value; })
    .onUpdate((event) => {
      const next = Math.min(Math.max(zoomAtPinchStart.value + (event.scale - 1) * 0.35, 0), 1);
      zoomValue.value = next;
      runOnJS(setZoom)(next);
    });

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = recording ? withRepeat(withSequence(withTiming(1.08, { duration: 500 }), withTiming(1, { duration: 500 })), -1) : withTiming(1);
  }, [pulse, recording]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (!cameraPermission || !micPermission) return <View style={styles.screen} />;
  if (!cameraPermission.granted || !micPermission.granted) {
    const blocked = (!cameraPermission.granted && !cameraPermission.canAskAgain) || (!micPermission.granted && !micPermission.canAskAgain);
    return <View style={[styles.screen, styles.permission, { paddingTop: insets.top + 60 }]}>
      <Ionicons name="videocam-outline" size={48} color={colors.textMuted} />
      <Text style={styles.permissionTitle}>{t('Camera and microphone')}</Text>
      <Text style={styles.permissionBody}>{t('GilTube needs your camera and microphone to record Geels.')}</Text>
      <Pressable onPress={() => { if (blocked) void Linking.openSettings(); else void (async () => { await requestCamera(); await requestMic(); })(); }} style={styles.permissionButton}>
        <Text style={styles.permissionButtonText}>{t(blocked ? 'Open settings' : 'Allow access')}</Text>
      </Pressable>
      <Pressable onPress={() => void importFromGallery().then(() => undefined)} style={styles.permissionSecondary}><Text style={styles.permissionSecondaryText}>{t('Upload from gallery instead')}</Text></Pressable>
      <Pressable accessibilityLabel={t('Close')} onPress={onClose} style={[styles.close, { top: insets.top + 8 }]}><Ionicons name="close" size={28} color="#fff" /></Pressable>
    </View>;
  }

  const busy = recording || countdown > 0;
  return <View style={styles.screen}>
    <GestureDetector gesture={pinch}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality="1080p"
          mirror={facing === 'front'}
          enableTorch={torch && facing === 'back'}
          zoom={zoom}
          onCameraReady={() => setCameraReady(true)}
          onMountError={(event) => Alert.alert(t('Camera unavailable'), event.message)}
        />
      </View>
    </GestureDetector>

    {/* Progress: one block per clip, plus the one being recorded. */}
    <View style={[styles.progress, { top: insets.top + 8 }]}>
      {clips.map((clip, index) => <View key={`${clip.uri}-${index}`} style={[styles.progressPart, { flex: clipOutput(clip) }]} />)}
      {recording && <View style={[styles.progressPart, styles.progressLive, { flex: Math.max(live, 0.01) }]} />}
      <View style={{ flex: Math.max(maxSeconds - recorded - live, 0.001) }} />
    </View>

    <Pressable accessibilityLabel={t('Close')} disabled={busy} onPress={onClose} style={[styles.close, { top: insets.top + 22 }]} hitSlop={8}>
      <Ionicons name="close" size={28} color="#fff" />
    </Pressable>

    <Pressable disabled={busy || clips.length > 0} onPress={onPickSound} style={[styles.soundPill, { top: insets.top + 24 }]}>
      <Ionicons name="musical-notes" size={15} color="#fff" />
      <Text numberOfLines={1} style={styles.soundText}>{sound ? `${sound.title} · ${sound.artist_name}` : t('Add a sound')}</Text>
    </Pressable>

    {!busy && <View style={[styles.tools, { top: insets.top + 76 }]}>
      <Tool icon="camera-reverse-outline" label={t('Flip')} onPress={flip} />
      <Tool icon="speedometer-outline" label={`${speed}x`} active={speed !== 1} onPress={() => setSpeedOpen((open) => !open)} />
      <Tool icon="timer-outline" label={timer ? `${timer}s` : t('Timer')} active={timer > 0} onPress={() => setTimer(TIMERS[(TIMERS.indexOf(timer as 0 | 3 | 10) + 1) % TIMERS.length])} />
      {facing === 'back' && <Tool icon={torch ? 'flash' : 'flash-outline'} label={t('Flash')} active={torch} onPress={() => setTorch((value) => !value)} />}
    </View>}
    {recording && <View style={[styles.tools, { top: insets.top + 76 }]}><Tool icon="camera-reverse-outline" label={t('Flip')} onPress={flip} /></View>}

    {countdown > 0 && <View pointerEvents="none" style={styles.countdown}><Text style={styles.countdownText}>{countdown}</Text></View>}

    <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
      {speedOpen && !busy && <View style={styles.speeds}>
        {SPEEDS.map((value) => <Pressable key={value} onPress={() => { setSpeed(value); setSpeedOpen(false); }} style={[styles.speed, speed === value && styles.speedActive]}>
          <Text style={[styles.speedText, speed === value && styles.speedTextActive]}>{value}x</Text>
        </Pressable>)}
      </View>}
      {!clips.length && !busy && <View style={styles.lengths}>
        {GEEL_LENGTHS.map((length) => <Pressable key={length} onPress={() => setMaxSeconds(length)} style={styles.lengthButton}>
          <Text style={[styles.lengthText, maxSeconds === length && styles.lengthTextActive]}>{length < 60 ? `${length}s` : `${length / 60}m`}</Text>
        </Pressable>)}
      </View>}
      <Text style={styles.timeLabel}>{clock(recorded + live)} / {clock(maxSeconds)}</Text>
      <View style={styles.controls}>
        <View style={styles.side}>
          {clips.length > 0 && !busy
            ? <Pressable accessibilityLabel={t('Delete last clip')} onPress={undo} style={styles.sideButton}><Ionicons name="backspace-outline" size={26} color="#fff" /></Pressable>
            : !busy && <Pressable accessibilityLabel={t('Upload from gallery')} onPress={() => void importFromGallery()} style={styles.sideButton}><Ionicons name="images-outline" size={26} color="#fff" /><Text style={styles.sideLabel}>{t('Upload')}</Text></Pressable>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t(recording ? 'Stop recording' : 'Record')} onPressIn={onPressIn} onPressOut={onPressOut} disabled={!cameraReady && !recording}>
          <Animated.View style={[styles.recordRing, pulseStyle]}>
            <View style={[styles.recordDot, recording && styles.recordDotOn]} />
          </Animated.View>
        </Pressable>
        <View style={styles.side}>
          {recorded >= 1 && !busy && <Pressable accessibilityLabel={t('Next')} onPress={onNext} style={styles.next}><Ionicons name="checkmark" size={28} color={colors.onAccent} /></Pressable>}
        </View>
      </View>
    </View>
  </View>;
}

function Tool({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.tool} hitSlop={6}>
    <Ionicons name={icon} size={27} color={active ? colors.accentBright : '#fff'} style={styles.toolIcon} />
    <Text style={[styles.toolLabel, active && { color: colors.accentBright }]}>{label}</Text>
  </Pressable>;
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: '#000' },
  permission: { alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  permissionTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 8 },
  permissionBody: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  permissionButton: { marginTop: 10, paddingHorizontal: 26, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  permissionButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: '900' },
  permissionSecondary: { padding: 10 },
  permissionSecondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  progress: { position: 'absolute', left: 12, right: 12, height: 5, flexDirection: 'row', gap: 2, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' },
  progressPart: { backgroundColor: colors.accentBright },
  progressLive: { backgroundColor: '#fff' },
  close: { position: 'absolute', left: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  soundPill: { position: 'absolute', alignSelf: 'center', maxWidth: '58%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)' },
  soundText: { color: '#fff', fontSize: 13, fontWeight: '800', flexShrink: 1 },
  tools: { position: 'absolute', right: 10, gap: 18, alignItems: 'center' },
  tool: { alignItems: 'center', gap: 2, minWidth: 52 },
  toolIcon: shadow,
  toolLabel: { color: '#fff', fontSize: 11, fontWeight: '800', ...shadow },
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  countdownText: { color: '#fff', fontSize: 120, fontWeight: '900', ...shadow },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 12 },
  speeds: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  speed: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  speedActive: { backgroundColor: '#fff' },
  speedText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  speedTextActive: { color: '#000' },
  lengths: { flexDirection: 'row', gap: 18 },
  lengthButton: { paddingHorizontal: 6, paddingVertical: 4 },
  lengthText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: '800', ...shadow },
  lengthTextActive: { color: '#fff' },
  timeLabel: { color: '#fff', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], ...shadow },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 34 },
  side: { width: 64, alignItems: 'center' },
  sideButton: { alignItems: 'center', gap: 3 },
  sideLabel: { color: '#fff', fontSize: 11, fontWeight: '800', ...shadow },
  recordRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  recordDot: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentBright },
  recordDotOn: { width: 34, height: 34, borderRadius: 8 },
  next: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
}));
