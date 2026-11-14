import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { postGeel, type GeelSound } from '@/api/geels';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import type { DraftClip } from './drafts';
import { clipOutput, totalOutput } from './GeelRecorder';
import { RangeBar } from './RangeBar';

const LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;

// Where output time `seconds` falls: which clip, and how far into its file.
function locate(clips: DraftClip[], seconds: number) {
  let before = 0;
  for (const [index, clip] of clips.entries()) {
    const length = clipOutput(clip);
    if (seconds < before + length || index === clips.length - 1) return { index, before, offset: Math.max(0, seconds - before) * clip.speed };
    before += length;
  }
  return { index: 0, before: 0, offset: 0 };
}

export function GeelReview({ clips, sound, soundStartMS, setSoundStartMS, soundVolume, setSoundVolume, originalVolume, setOriginalVolume, caption, setCaption, onBack, onPickSound, onPosted }: {
  clips: DraftClip[];
  sound: GeelSound | null;
  soundStartMS: number; setSoundStartMS: (ms: number) => void;
  soundVolume: number; setSoundVolume: (value: number) => void;
  originalVolume: number; setOriginalVolume: (value: number) => void;
  caption: string; setCaption: (value: string) => void;
  onBack: () => void; onPickSound: () => void; onPosted: () => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { activeChannel, activeChannelID } = useActiveChannel();
  const total = totalOutput(clips);
  const clipIndex = useRef(0);
  // Read when (re)starting playback; changing them must not restart it.
  const settings = useRef({ originalVolume, soundVolume, soundStartMS });
  useEffect(() => { settings.current = { originalVolume, soundVolume, soundStartMS }; }, [originalVolume, soundStartMS, soundVolume]);
  const [coverMode, setCoverMode] = useState(false);
  const [coverSeconds, setCoverSeconds] = useState(Math.min(1, total / 2));
  const [hidden, setHidden] = useState(false);
  const [explicit, setExplicit] = useState(false);
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0);

  const preview = useVideoPlayer(null, (player) => { player.loop = false; });
  const soundPlayer = useVideoPlayer(sound ? { uri: resolveMediaURL(sound.audio_url) } : null, (player) => { player.loop = false; });

  // Plays clip `index` from `offset` seconds into its file, with the sound
  // lined up to the same point of the Geel.
  const playFrom = useCallback(async (index: number, offset = 0, paused = false) => {
    const clip = clips[index];
    if (!clip) return;
    clipIndex.current = index;
    const { originalVolume: original, soundVolume: added, soundStartMS: soundStart } = settings.current;
    await preview.replaceAsync({ uri: clip.uri });
    preview.playbackRate = clip.speed;
    preview.volume = original;
    preview.currentTime = offset;
    const before = clips.slice(0, index).reduce((sum, item) => sum + clipOutput(item), 0);
    if (sound) {
      soundPlayer.volume = added;
      soundPlayer.currentTime = soundStart / 1000 + before + offset / clip.speed;
    }
    if (paused) {
      preview.pause();
      soundPlayer.pause();
    } else {
      preview.play();
      if (sound) soundPlayer.play();
    }
  }, [clips, preview, sound, soundPlayer]);

  useEffect(() => { if (!coverMode && !posting) void playFrom(0); }, [coverMode, playFrom, posting]);
  useEventListener(preview, 'playToEnd', () => {
    if (coverMode) return;
    void playFrom(clipIndex.current + 1 < clips.length ? clipIndex.current + 1 : 0);
  });
  useEffect(() => { preview.volume = originalVolume; }, [originalVolume, preview]);
  useEffect(() => { soundPlayer.volume = soundVolume; }, [soundPlayer, soundVolume]);

  const showCover = (seconds: number) => {
    setCoverSeconds(seconds);
    const spot = locate(clips, seconds);
    void playFrom(spot.index, spot.offset, true);
  };

  const post = async () => {
    if (!activeChannelID) {
      Alert.alert(t('Channel needed'), t('Create or select a channel on GilTube first.'), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Manage channels'), onPress: () => router.push('/channels/manage') },
      ]);
      return;
    }
    if (!caption.trim()) { Alert.alert(t('Add a caption'), t('Write a few words about your Geel.')); return; }
    preview.pause();
    soundPlayer.pause();
    setPosting(true);
    setProgress(0);
    try {
      await postGeel({
        clips: clips.map((clip) => ({ uri: clip.uri, duration: clip.duration, speed: clip.speed })),
        channelID: activeChannelID,
        caption,
        hidden,
        explicit,
        soundTrackID: sound?.track_id,
        soundStartMS,
        soundVolume,
        originalVolume,
        coverMS: coverSeconds * 1000,
      }, setProgress);
      onPosted();
    } catch (error) {
      setPosting(false);
      Alert.alert(t('Couldn’t post your Geel'), error instanceof Error ? error.message : t('Please try again.'));
    }
  };

  const previewHeight = Math.round(height * 0.5);
  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.header}>
      <Pressable accessibilityLabel={t('Back')} disabled={posting} onPress={onBack} hitSlop={8}><Ionicons name="chevron-back" size={28} color={colors.text} /></Pressable>
      <Text style={styles.headerTitle}>{t('New Geel')}</Text>
      <View style={{ width: 28 }} />
    </View>
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { height: previewHeight, width: Math.round(previewHeight * 9 / 16) }]}>
          <VideoView player={preview} style={{ flex: 1 }} contentFit="cover" nativeControls={false} fullscreenOptions={{ enable: false }} surfaceType="textureView" />
          {coverMode && <View pointerEvents="none" style={styles.coverBadge}><Text style={styles.coverBadgeText}>{t('Cover')}</Text></View>}
        </View>

        <View style={styles.chips}>
          <Chip icon="musical-notes" label={sound ? sound.title : t('Add a sound')} onPress={onPickSound} />
          <Chip icon="image-outline" label={t(coverMode ? 'Done' : 'Choose cover')} active={coverMode} onPress={() => setCoverMode((value) => !value)} />
        </View>

        {coverMode
          ? <RangeBar total={total} window={0} value={coverSeconds} label={t('Cover frame')} onChange={showCover} />
          : sound && sound.duration_seconds > total + 0.5 && <RangeBar
            total={sound.duration_seconds}
            window={total}
            value={soundStartMS / 1000}
            label={t('Sound start')}
            onChange={(seconds) => setSoundStartMS(Math.round(seconds * 1000))}
            onRelease={(seconds) => { settings.current = { ...settings.current, soundStartMS: Math.round(seconds * 1000) }; void playFrom(0); }}
          />}

        <Levels label={t('Original sound')} value={originalVolume} onChange={setOriginalVolume} />
        {sound && <Levels label={t('Added sound')} value={soundVolume} onChange={setSoundVolume} />}

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder={t('Describe your Geel… #hashtags')}
          placeholderTextColor={colors.textDim}
          multiline
          maxLength={2200}
          style={styles.caption}
        />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('Who can watch')}</Text>
          <View style={styles.segment}>
            {[false, true].map((value) => <Pressable key={String(value)} onPress={() => setHidden(value)} style={[styles.segmentItem, hidden === value && styles.segmentActive]}>
              <Text style={[styles.segmentText, hidden === value && styles.segmentTextActive]}>{t(value ? 'Unlisted' : 'Public')}</Text>
            </Pressable>)}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('Mature content (18+)')}</Text>
          <Switch value={explicit} onValueChange={setExplicit} trackColor={{ true: colors.accent, false: colors.surfaceStrong }} thumbColor="#fff" />
        </View>
        <Text style={styles.postingAs}>{activeChannel ? `${t('Posting as')} ${activeChannel.name}` : t('No channel selected')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>

    <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
      {posting
        ? <View style={styles.postingBox}>
          <ActivityIndicator color={colors.accentBright} />
          <Text style={styles.postingText}>{progress < 1 ? `${t('Uploading')} ${Math.round(progress * 100)}%` : t('Putting your Geel together…')}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
        </View>
        : <Pressable onPress={() => void post()} style={styles.postButton}><Ionicons name="paper-plane" size={18} color={colors.onAccent} /><Text style={styles.postText}>{t('Post Geel')}</Text></Pressable>}
    </View>
  </View>;
}

function Chip({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Ionicons name={icon} size={15} color={active ? colors.onAccent : colors.text} />
    <Text numberOfLines={1} style={[styles.chipText, active && { color: colors.onAccent }]}>{label}</Text>
  </Pressable>;
}

function Levels({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const styles = useStyles();
  return <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.segment}>
      {LEVELS.map((level) => <Pressable key={level} onPress={() => onChange(level)} style={[styles.levelItem, value === level && styles.segmentActive]}>
        <Text style={[styles.segmentText, value === level && styles.segmentTextActive]}>{Math.round(level * 100)}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  content: { paddingHorizontal: 16, gap: 16 },
  preview: { alignSelf: 'center', borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#000' },
  coverBadge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accent },
  coverBadgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '900' },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%', paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: colors.surfaceStrong },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { color: colors.text, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: colors.surfaceStrong },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  levelItem: { minWidth: 40, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  segmentActive: { backgroundColor: colors.text },
  segmentText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  segmentTextActive: { color: colors.screen },
  caption: { minHeight: 96, borderRadius: radii.md, padding: 14, color: colors.text, fontSize: 15, textAlignVertical: 'top', backgroundColor: colors.surface },
  postingAs: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.screen, borderTopWidth: 1, borderTopColor: colors.border },
  postButton: { height: 52, borderRadius: 26, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  postText: { color: colors.onAccent, fontSize: 16, fontWeight: '900' },
  postingBox: { gap: 8, alignItems: 'center' },
  postingText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  progressTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.accentBright },
}));
