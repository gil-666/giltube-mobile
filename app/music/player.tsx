import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { trackHasLyrics } from '@/music/lyrics';
import { useMusicDownloads } from '@/music/MusicDownloadsProvider';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { LyricsView } from '@/music/player/LyricsView';
import { QueueView } from '@/music/player/QueueView';
import { SeekBar } from '@/music/player/SeekBar';
import { musicImage, type MusicFileQuality } from '@/music/quality';
import { openVideo } from '@/player/navigation';
import { colors, makeStyles, motion, radii, withAlpha } from '@/theme/tokens';

type View3 = 'player' | 'lyrics' | 'queue';

const QUALITY_LABEL: Record<MusicFileQuality, string> = { master: 'Original', high: '320 kbps', medium: '256 kbps', low: '128 kbps' };

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function MusicPlayerScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ view?: string }>();
  const player = useMusicPlayer();
  const { current } = player;
  const hasLyrics = trackHasLyrics(current);

  const requested: View3 = params.view === 'lyrics' || params.view === 'queue' ? params.view : 'player';
  const [chosen, setChosen] = useState<{ view: View3; from: string | undefined }>({ view: requested, from: params.view });
  // A new ?view= param (openPlayer while already open) wins over the last tap.
  const selected = chosen.from === params.view ? chosen.view : requested;
  const view: View3 = selected === 'lyrics' && !hasLyrics ? 'player' : selected;
  const choose = (next: View3) => setChosen({ view: next, from: params.view });

  // Swipe down anywhere outside the scrolling lists closes the player.
  const translateY = useSharedValue(0);
  // A gesture can only be attached to one detector, so the header and the
  // playing view each get their own.
  const [headerSwipe, bodySwipe] = useMemo(() => [0, 1].map(() => Gesture.Pan().activeOffsetY(14).failOffsetX([-30, 30]).onUpdate((event) => {
    translateY.value = Math.max(0, event.translationY);
  }).onEnd((event) => {
    if (event.translationY > 110 || event.velocityY > 800) { runOnJS(close)(); return; }
    translateY.value = withSpring(0, motion.spring);
  })), [translateY]);
  const motionStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  // The queue was cleared (or never existed): nothing to show.
  const empty = !current;
  useEffect(() => {
    if (empty) close();
  }, [empty]);
  if (!current) return <View style={styles.screen} />;

  const tabs: { key: View3; label: string }[] = [
    { key: 'player', label: t('Playing') },
    ...(hasLyrics ? [{ key: 'lyrics' as const, label: t('Lyrics') }] : []),
    { key: 'queue', label: t('Queue') },
  ];

  return (
    <Animated.View style={[styles.screen, motionStyle]}>
      <Image source={musicImage(current.cover_url, 'md')} style={[StyleSheet.absoluteFill, styles.backdrop]} blurRadius={50} contentFit="cover" />
      <LinearGradient
        colors={[withAlpha(colors.canvas, 0.35), withAlpha(colors.canvas, 0.82), colors.canvas]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <GestureDetector gesture={headerSwipe!}>
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={close} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel={t('Close player')}>
              <Ionicons name="chevron-down" size={28} color={colors.text} />
            </Pressable>
            <View style={styles.segments}>
              {tabs.map((tab) => (
                <Pressable key={tab.key} onPress={() => choose(tab.key)} style={[styles.segment, view === tab.key && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: view === tab.key }}>
                  <Text style={[styles.segmentText, view === tab.key && styles.segmentTextActive]}>{tab.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.headerButton} />
          </View>
        </View>
      </GestureDetector>

      {view === 'player' && (
        <GestureDetector gesture={bodySwipe!}>
          <View style={styles.body}><PlayingView bottomInset={insets.bottom} /></View>
        </GestureDetector>
      )}
      {view === 'lyrics' && (
        <View style={styles.body}>
          <LyricsView bottomInset={insets.bottom} />
          <MiniTransport bottomInset={insets.bottom} />
        </View>
      )}
      {view === 'queue' && <View style={styles.body}><QueueView bottomInset={insets.bottom} /></View>}
    </Animated.View>
  );
}

function PlayingView({ bottomInset }: { bottomInset: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const window = useWindowDimensions();
  const { current, playing, buffering, position, duration, shuffle, repeat, nowPlaying, togglePlay, next, previous, seek, setShuffle, cycleRepeat } = useMusicPlayer();
  if (!current) return null;

  const coverSize = Math.min(window.width - 56, window.height * 0.42, 420);
  const total = duration > 0 ? duration : current.duration_seconds || 0;
  const qualityLabel = nowPlaying?.offline ? t('Downloaded') : nowPlaying?.lossless ? t('Lossless') : nowPlaying ? t(QUALITY_LABEL[nowPlaying.quality]) : '';

  return (
    <View style={[styles.playing, { paddingBottom: bottomInset + 16 }]}>
      <View style={styles.coverWrap}>
        <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]}>
          <Image source={musicImage(current.cover_url, 'lg')} placeholder={musicImage(current.cover_url, 'sm')} style={styles.cover} contentFit="cover" transition={200} />
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.info}>
          <Pressable onPress={() => router.push(`/music/tracks/${current.slug}`)} accessibilityRole="link">
            <Text numberOfLines={1} style={styles.title}>
              {current.title}
              {current.explicit && <Text style={styles.explicit}>{'  E'}</Text>}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/music/artists/${current.artist_slug}`)} accessibilityRole="link">
            <Text numberOfLines={1} style={styles.artist}>{current.artist_name}</Text>
          </Pressable>
        </View>
        <DownloadButton />
      </View>

      <SeekBar position={position} duration={total} onSeek={seek} label={t('Seek')} />

      <View style={styles.transport}>
        <Pressable onPress={() => setShuffle(!shuffle)} hitSlop={8} style={styles.sideButton} accessibilityLabel={t('Shuffle')} accessibilityState={{ selected: shuffle }}>
          <Ionicons name="shuffle" size={23} color={shuffle ? colors.accentBright : colors.textMuted} />
          {shuffle && <View style={styles.dot} />}
        </Pressable>
        <PressableScale onPress={previous} style={styles.skipButton} accessibilityLabel={t('Previous')}>
          <Ionicons name="play-skip-back" size={30} color={colors.text} />
        </PressableScale>
        <PressableScale onPress={togglePlay} style={styles.playButton} accessibilityLabel={t(playing ? 'Pause' : 'Play')}>
          {buffering && playing
            ? <ActivityIndicator color={colors.canvas} />
            : <Ionicons name={playing ? 'pause' : 'play'} size={34} color={colors.canvas} style={!playing && styles.playIcon} />}
        </PressableScale>
        <PressableScale onPress={next} style={styles.skipButton} accessibilityLabel={t('Next')}>
          <Ionicons name="play-skip-forward" size={30} color={colors.text} />
        </PressableScale>
        <Pressable onPress={cycleRepeat} hitSlop={8} style={styles.sideButton} accessibilityLabel={t(repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off')}>
          <Ionicons name="repeat" size={23} color={repeat === 'off' ? colors.textMuted : colors.accentBright} />
          {repeat === 'one' && <View style={styles.repeatBadge}><Text style={styles.repeatBadgeText}>1</Text></View>}
          {repeat !== 'off' && <View style={styles.dot} />}
        </Pressable>
      </View>

      <View style={styles.footer}>
        {!!qualityLabel && (
          <View style={[styles.chip, nowPlaying?.lossless && !nowPlaying.offline && styles.chipLossless]}>
            <Ionicons name={nowPlaying?.offline ? 'arrow-down-circle' : nowPlaying?.lossless ? 'diamond-outline' : 'pulse'} size={12} color={nowPlaying?.lossless ? colors.highlight : colors.textMuted} />
            <Text style={[styles.chipText, nowPlaying?.lossless && styles.chipTextLossless]}>{qualityLabel}</Text>
          </View>
        )}
        {!!current.official_video_id && (
          <Pressable onPress={() => openVideo(current.official_video_id!)} style={styles.chip} accessibilityRole="button">
            <Ionicons name="videocam-outline" size={13} color={colors.text} />
            <Text style={[styles.chipText, styles.chipTextStrong]}>{t('Watch video')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function DownloadButton() {
  const styles = useStyles();
  const { t } = useI18n();
  const { current } = useMusicPlayer();
  const { getDownload, activity, downloadTracks, remove } = useMusicDownloads();
  if (!current) return null;
  const downloaded = getDownload(current.id);
  const state = activity[current.id];

  const onPress = () => {
    if (downloaded) {
      Alert.alert(t('Remove download?'), t('The track will no longer be available offline.'), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Remove'), style: 'destructive', onPress: () => void remove(current.id) },
      ]);
      return;
    }
    if (state && state.status !== 'failed') return;
    void downloadTracks([current]);
  };

  let content: React.ReactNode;
  if (downloaded) content = <Ionicons name="checkmark-circle" size={26} color={colors.accentBright} />;
  else if (state?.status === 'downloading') content = <Text style={styles.downloadPercent}>{Math.round(state.progress * 100)}%</Text>;
  else if (state?.status === 'queued') content = <ActivityIndicator size="small" color={colors.textMuted} />;
  else if (state?.status === 'failed') content = <Ionicons name="alert-circle-outline" size={26} color={colors.danger} />;
  else content = <Ionicons name="arrow-down-circle-outline" size={26} color={colors.textMuted} />;

  const label = downloaded ? t('Downloaded') : state?.status === 'failed' ? t('Download failed. Tap to retry.') : state ? t('Downloading…') : t('Download');
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.download} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </Pressable>
  );
}

/** Compact controls under the lyrics. */
function MiniTransport({ bottomInset }: { bottomInset: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { current, playing, position, duration, togglePlay, next, previous, seek } = useMusicPlayer();
  if (!current) return null;
  const total = duration > 0 ? duration : current.duration_seconds || 0;
  return (
    <View style={[styles.miniTransport, { paddingBottom: bottomInset + 10 }]}>
      <SeekBar position={position} duration={total} onSeek={seek} label={t('Seek')} />
      <View style={styles.miniButtons}>
        <Pressable onPress={previous} hitSlop={8} accessibilityLabel={t('Previous')}><Ionicons name="play-skip-back" size={24} color={colors.text} /></Pressable>
        <PressableScale onPress={togglePlay} style={styles.miniPlay} accessibilityLabel={t(playing ? 'Pause' : 'Play')}>
          <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.canvas} style={!playing && styles.playIconSmall} />
        </PressableScale>
        <Pressable onPress={next} hitSlop={8} accessibilityLabel={t('Next')}><Ionicons name="play-skip-forward" size={24} color={colors.text} /></Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.canvas, overflow: 'hidden' },
  backdrop: { opacity: 0.5 },
  header: { paddingHorizontal: 10, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  segments: { flex: 1, flexDirection: 'row', alignSelf: 'center', marginHorizontal: 4, padding: 3, borderRadius: radii.pill, backgroundColor: withAlpha(colors.text, 0.08) },
  segment: { flex: 1, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surfaceStrong },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: colors.text },
  body: { flex: 1 },
  playing: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between' },
  coverWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  coverShadow: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceStrong,
    shadowColor: colors.black,
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  cover: { width: '100%', height: '100%', borderRadius: radii.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800' },
  explicit: { color: colors.textDim, fontSize: 13, fontWeight: '900' },
  artist: { color: colors.textMuted, fontSize: 16, marginTop: 3, fontWeight: '600' },
  download: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  downloadPercent: { color: colors.text, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  sideButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  skipButton: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text },
  playIcon: { marginLeft: 4 },
  dot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accentBright },
  repeatBadge: { position: 'absolute', top: 5, right: 4, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright },
  repeatBadgeText: { color: colors.onAccent, fontSize: 9, fontWeight: '900' },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 18, minHeight: 28 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 28, borderRadius: radii.pill, backgroundColor: withAlpha(colors.text, 0.08) },
  chipLossless: { backgroundColor: withAlpha(colors.highlight, 0.14) },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextLossless: { color: colors.highlight },
  chipTextStrong: { color: colors.text },
  miniTransport: { paddingHorizontal: 24, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: withAlpha(colors.canvas, 0.92) },
  miniButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 2 },
  miniPlay: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text },
  playIconSmall: { marginLeft: 3 },
}));
