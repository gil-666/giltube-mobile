import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEvent } from 'expo';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, FadeIn, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { geelsAPI, type Geel } from '@/api/geels';
import { giltubeAPI } from '@/api/giltube';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';
import { compactNumber, resolveMediaURL } from '@/utils/media';

type GeelPlayState = 'playing' | 'paused' | 'loading';

const HEART = 'heart';
let burstSeq = 0;

interface PlayerHandle { toggle: () => void; seekTo: (ratio: number) => void }

// ---------------------------------------------------------------------------
// The video layer: only mounted for the active Geel and its neighbours, so at
// most three players exist at once.

const GeelPlayerLayer = forwardRef<PlayerHandle, {
  geel: Geel; current: boolean; suspended: boolean; muted: boolean; progress: SharedValue<number>; subtitleBottomPadding: number;
  onPlayingChange: (state: GeelPlayState) => void; onWatched: (ratio: number) => void;
}>(function GeelPlayerLayer({ geel, current, suspended, muted, progress, subtitleBottomPadding, onPlayingChange, onWatched }, ref) {
  const player = useVideoPlayer({ uri: resolveMediaURL(geel.hls_path) }, (instance) => {
    instance.loop = true;
    instance.timeUpdateEventInterval = 0.25;
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
  });
  const userPaused = useRef(false);
  const watched = useRef(false);
  const watchedRatio = useRef(0);
  const lastRatio = useRef(0);
  const loops = useRef(0);
  const playing = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null });

  useEffect(() => { player.muted = muted; }, [muted, player]);
  // Scrolled away: rewind. Suspended (comments open, app in the background,
  // another tab): just pause, and resume unless the viewer had paused.
  useEffect(() => {
    if (!current) {
      // Moving on: report how much was watched, then start over next time.
      if (watched.current) onWatched(watchedRatio.current);
      watched.current = false;
      watchedRatio.current = 0;
      lastRatio.current = 0;
      loops.current = 0;
      userPaused.current = false;
      player.pause();
      player.currentTime = 0;
    } else if (suspended) {
      player.pause();
    } else if (!userPaused.current) {
      player.play();
    }
  }, [current, onWatched, player, suspended]);
  // Not playing and not paused by the viewer means it is loading or buffering.
  useEffect(() => { onPlayingChange(playing.isPlaying ? 'playing' : userPaused.current ? 'paused' : 'loading'); }, [onPlayingChange, playing.isPlaying]);
  useEffect(() => {
    const duration = player.duration;
    if (duration > 0) {
      const ratio = Math.min(time.currentTime / duration, 1);
      progress.value = ratio;
      if (current) {
        // A wrap-around means it looped: watched through.
        if (ratio + 0.5 < lastRatio.current) loops.current += 1;
        lastRatio.current = ratio;
        watchedRatio.current = loops.current > 0 ? 1 : Math.max(watchedRatio.current, ratio);
      }
    }
    if (current && !watched.current && time.currentTime >= 2) {
      watched.current = true;
      onWatched(watchedRatio.current);
    }
  }, [current, onWatched, player, progress, time.currentTime]);

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (player.playing) { userPaused.current = true; player.pause(); onPlayingChange('paused'); } else { userPaused.current = false; player.play(); onPlayingChange('loading'); }
    },
    seekTo: (ratio: number) => { if (player.duration > 0) player.currentTime = Math.max(0, Math.min(ratio, 1)) * player.duration; },
  }), [onPlayingChange, player]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} fullscreenOptions={{ enable: false }} surfaceType="textureView" subtitleBottomPadding={subtitleBottomPadding} />;
});

// ---------------------------------------------------------------------------
// Animations

const HeartBurst = memo(function HeartBurst({ x, y, tilt, onDone }: { x: number; y: number; tilt: number; onDone: () => void }) {
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(0);
  const spread = useSharedValue(0);
  useEffect(() => {
    opacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(380, withTiming(0, { duration: 380 })));
    scale.value = withSequence(withSpring(1.25, { damping: 7, stiffness: 320 }), withSpring(1, { damping: 10 }));
    lift.value = withDelay(420, withTiming(-90, { duration: 460, easing: Easing.out(Easing.cubic) }));
    spread.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) });
    const timer = setTimeout(onDone, 950);
    return () => clearTimeout(timer);
  }, [lift, onDone, opacity, scale, spread]);
  const heartStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: lift.value }, { rotate: `${tilt}deg` }, { scale: scale.value }] }));
  return <View pointerEvents="none" style={[styles.burst, { left: x, top: y }]}>
    {Array.from({ length: 6 }, (_, index) => <BurstDot key={index} angle={index * 60 + tilt} spread={spread} distance={70} size={9} />)}
    <Animated.View style={heartStyle}><Ionicons name={HEART} size={104} color={colors.accentBright} style={styles.burstHeart} /></Animated.View>
  </View>;
});

function BurstDot({ angle, spread, distance, size }: { angle: number; spread: SharedValue<number>; distance: number; size: number }) {
  const radians = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    opacity: spread.value < 0.15 ? spread.value * 6 : 1 - spread.value,
    transform: [{ translateX: Math.sin(radians) * distance * spread.value }, { translateY: -Math.cos(radians) * distance * spread.value }, { scale: 1 - spread.value * 0.6 }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: size, backgroundColor: angle % 120 < 60 ? colors.accentBright : '#FBBF24' }, style]} />;
}

function LikeButton({ liked, count, onPress, label }: { liked: boolean; count: number; onPress: () => void; label: string }) {
  const scale = useSharedValue(1);
  const spark = useSharedValue(0);
  const ring = useSharedValue(0);
  const previous = useRef(liked);
  useEffect(() => {
    if (liked && !previous.current) {
      scale.value = withSequence(withSpring(1.4, { damping: 6, stiffness: 420 }), withSpring(1, { damping: 9 }));
      spark.value = 0;
      spark.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.quad) });
      ring.value = 0;
      ring.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
    }
    previous.current = liked;
  }, [liked, ring, scale, spark]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value === 0 ? 0 : 1 - ring.value, transform: [{ scale: 0.6 + ring.value * 0.9 }] }));
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: liked }} onPress={onPress} style={styles.action} hitSlop={6}>
    <View style={styles.actionIcon}>
      <Animated.View pointerEvents="none" style={[styles.likeRing, ringStyle]} />
      {Array.from({ length: 8 }, (_, index) => <BurstDot key={index} angle={index * 45} spread={spark} distance={30} size={6} />)}
      <Animated.View style={iconStyle}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={34} color={liked ? colors.accentBright : colors.white} style={styles.iconShadow} /></Animated.View>
    </View>
    <Text style={styles.actionLabel}>{compactNumber(count)}</Text>
  </Pressable>;
}

function DislikeButton({ disliked, count, onPress, label }: { disliked: boolean; count: number; onPress: () => void; label: string }) {
  const tilt = useSharedValue(0);
  const previous = useRef(disliked);
  useEffect(() => {
    if (disliked && !previous.current) tilt.value = withSequence(withTiming(-14, { duration: 90 }), withTiming(10, { duration: 110 }), withSpring(0));
    previous.current = disliked;
  }, [disliked, tilt]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: disliked }} onPress={onPress} style={styles.action} hitSlop={6}>
    <View style={styles.actionIcon}><Animated.View style={style}><Ionicons name={disliked ? 'thumbs-down' : 'thumbs-down-outline'} size={30} color={colors.white} style={styles.iconShadow} /></Animated.View></View>
    <Text style={styles.actionLabel}>{count > 0 ? compactNumber(count) : label}</Text>
  </Pressable>;
}

function SoundDisc({ cover, spinning, onPress, label }: { cover: string; spinning: boolean; onPress: () => void; label: string }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (spinning) rotation.value = withRepeat(withTiming(rotation.value + 360, { duration: 4500, easing: Easing.linear }), -1, false);
    else cancelAnimation(rotation);
  }, [rotation, spinning]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value % 360}deg` }] }));
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} hitSlop={6}>
    <Animated.View style={[styles.disc, style]}>
      {cover ? <Image source={cover} style={styles.discArt} contentFit="cover" /> : <Ionicons name="musical-notes" size={18} color={colors.white} />}
    </Animated.View>
  </Pressable>;
}

// ---------------------------------------------------------------------------

export const GeelItem = memo(function GeelItem({
  geel, height, current, suspended, nearby, muted, bottomInset, actorID, signedIn, onToggleMute, onOpenComments, onChange,
}: {
  geel: Geel; height: number; current: boolean; suspended: boolean; nearby: boolean; muted: boolean; bottomInset: number;
  actorID: string; signedIn: boolean;
  onToggleMute: () => void; onOpenComments: (geel: Geel) => void; onChange: (geel: Geel) => void;
}) {
  const s = useStylesheet();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // State, not a ref: gesture callbacks read it.
  const [playerHandle, setPlayerHandle] = useState<PlayerHandle | null>(null);
  const progress = useSharedValue(0);
  const [playState, setPlayState] = useState<GeelPlayState>('loading');
  const playing = playState === 'playing';
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; tilt: number }[]>([]);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [barWidth, setBarWidth] = useState(1);
  const [reacting, setReacting] = useState(false);

  const subscription = useQuery({
    queryKey: ['subscription', geel.channel_id, actorID],
    queryFn: () => giltubeAPI.subscription(geel.channel_id, actorID),
    enabled: current && signedIn && !!actorID && actorID !== geel.channel_id,
  });
  const ownGeel = actorID === geel.channel_id;

  const requireAccount = () => {
    if (!signedIn) { router.push('/login'); return false; }
    if (!actorID) { Alert.alert(t('Channel needed'), t('Create or select a channel on GilTube first.')); return false; }
    return true;
  };

  const react = async (reaction: 'like' | 'dislike', on: boolean) => {
    if (!requireAccount() || reacting) return;
    const before = geel;
    const optimistic: Geel = reaction === 'like'
      ? { ...geel, liked: on, likes: Math.max(0, geel.likes + (on ? 1 : -1)), disliked: on ? false : geel.disliked, dislikes: on && geel.disliked ? Math.max(0, geel.dislikes - 1) : geel.dislikes }
      : { ...geel, disliked: on, dislikes: Math.max(0, geel.dislikes + (on ? 1 : -1)), liked: on ? false : geel.liked, likes: on && geel.liked ? Math.max(0, geel.likes - 1) : geel.likes };
    onChange(optimistic);
    if (on) void Haptics.impactAsync(reaction === 'like' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setReacting(true);
    try {
      const result = await geelsAPI.react(geel.id, reaction, on, actorID);
      onChange({
        ...optimistic,
        likes: result.likes,
        liked: result.liked,
        dislikes: result.dislikes ?? optimistic.dislikes,
        disliked: result.disliked ?? (reaction === 'like' && on ? false : optimistic.disliked),
      });
    } catch (error) {
      onChange(before);
      Alert.alert(t('Could not update like'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setReacting(false);
    }
  };

  const doubleTap = (x: number, y: number) => {
    const id = ++burstSeq;
    setBursts((current) => [...current, { id, x, y, tilt: Math.round(Math.random() * 40 - 20) }]);
    if (!geel.liked) void react('like', true);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const removeBurst = useCallback((id: number) => setBursts((current) => current.filter((burst) => burst.id !== id)), []);

  const tapGesture = Gesture.Exclusive(
    Gesture.Tap().numberOfTaps(2).maxDelay(260).onEnd((event, success) => { if (success) runOnJS(doubleTap)(event.x, event.y); }),
    Gesture.Tap().onEnd((_event, success) => { if (success) runOnJS(toggle)(); }),
  );
  function toggle() { playerHandle?.toggle(); }

  const seekFromX = (x: number) => playerHandle?.seekTo(x / barWidth);
  const seekGesture = Gesture.Pan().minDistance(0).onBegin((event) => runOnJS(seekFromX)(event.x)).onUpdate((event) => runOnJS(seekFromX)(event.x));

  const toggleSubscribe = async () => {
    if (!requireAccount()) return;
    try {
      const data = subscription.data?.subscribed
        ? await giltubeAPI.unsubscribe(geel.channel_id, actorID)
        : await giltubeAPI.subscribe(geel.channel_id, actorID);
      queryClient.setQueryData(['subscription', geel.channel_id, actorID], data);
      void Haptics.selectionAsync();
    } catch (error) {
      Alert.alert(t('Subscription failed'), error instanceof Error ? error.message : t('Please try again.'));
    }
  };

  const share = () => {
    const url = `https://giltube.gilservers.com/geels/${geel.id}`;
    void Share.share({ title: geel.title, message: `${geel.title}\n${url}`, url });
  };

  const progressStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  const description = (geel.description || '').trim();
  const extra = description.startsWith(geel.title) ? description.slice(geel.title.length).trim() : description;
  const cover = geel.sound?.cover_url ? resolveMediaURL(geel.sound.cover_url) : '';
  const markWatched = useCallback((ratio: number) => { void geelsAPI.view(geel.id, ratio); }, [geel.id]);

  return <View style={[s.item, { height }]}>
    <GestureDetector gesture={tapGesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        <Image source={resolveMediaURL(geel.poster_url || geel.thumbnail_url)} style={StyleSheet.absoluteFill} contentFit="cover" />
        {nearby && <GeelPlayerLayer ref={setPlayerHandle} geel={geel} current={current} suspended={suspended} muted={muted} progress={progress} subtitleBottomPadding={Math.min(0.5, (bottomInset + 150) / Math.max(height, 1))} onPlayingChange={setPlayState} onWatched={markWatched} />}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']} style={s.shadeBottom} />
        {current && !suspended && nearby && playState === 'paused' && <View pointerEvents="none" style={s.pausedIcon}><Ionicons name="play" size={44} color={colors.white} /></View>}
        {current && !suspended && nearby && playState === 'loading' && <Animated.View entering={FadeIn.delay(250).duration(150)} pointerEvents="none" style={s.loading}><ActivityIndicator size="large" color={colors.white} /></Animated.View>}
        {bursts.map((burst) => <HeartBurst key={burst.id} x={burst.x} y={burst.y} tilt={burst.tilt} onDone={() => removeBurst(burst.id)} />)}
      </View>
    </GestureDetector>

    <Pressable accessibilityLabel={t(muted ? 'Unmute' : 'Mute')} onPress={onToggleMute} style={s.mute} hitSlop={8}>
      <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={colors.white} />
    </Pressable>

    <View style={[s.rail, { bottom: bottomInset + 92 }]}>
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/channel/[id]', params: { id: geel.channel_id } })} style={s.railAvatarWrap}>
        <Image source={resolveMediaURL(geel.channel.avatar_url || '')} style={s.railAvatar} contentFit="cover" />
        {!ownGeel && !subscription.data?.subscribed && <Pressable accessibilityLabel={t('Subscribe')} onPress={() => void toggleSubscribe()} style={s.railFollow} hitSlop={6}><Ionicons name="add" size={14} color={colors.white} /></Pressable>}
      </Pressable>
      <LikeButton liked={geel.liked} count={geel.likes} label={t('Like')} onPress={() => void react('like', !geel.liked)} />
      <DislikeButton disliked={geel.disliked} count={geel.dislikes} label={t('Dislike')} onPress={() => void react('dislike', !geel.disliked)} />
      <Pressable accessibilityRole="button" accessibilityLabel={t('Comments')} onPress={() => onOpenComments(geel)} style={styles.action} hitSlop={6}>
        <View style={styles.actionIcon}><Ionicons name="chatbubble-ellipses" size={30} color={colors.white} style={styles.iconShadow} /></View>
        <Text style={styles.actionLabel}>{compactNumber(geel.comments_count)}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Share')} onPress={share} style={styles.action} hitSlop={6}>
        <View style={styles.actionIcon}><Ionicons name="arrow-redo" size={30} color={colors.white} style={styles.iconShadow} /></View>
        <Text style={styles.actionLabel}>{t('Share')}</Text>
      </Pressable>
      {geel.sound && <SoundDisc cover={cover} spinning={current && playing} label={t('Use this sound')} onPress={() => router.push({ pathname: '/geels/sound/[id]', params: { id: geel.sound!.track_id } })} />}
    </View>

    <View style={[s.info, { bottom: bottomInset + 18 }]}>
      <View style={s.creatorRow}>
        <Pressable onPress={() => router.push({ pathname: '/channel/[id]', params: { id: geel.channel_id } })} style={s.creator}>
          <Text numberOfLines={1} style={s.creatorName}>@{geel.channel.name}</Text>
          <VerifiedBadge verified={geel.channel.verified} size={14} />
        </Pressable>
        {!ownGeel && <Pressable onPress={() => void toggleSubscribe()} style={[s.subscribe, subscription.data?.subscribed && s.subscribed]}>
          <Text style={[s.subscribeText, subscription.data?.subscribed && s.subscribedText]}>{t(subscription.data?.subscribed ? 'Subscribed' : 'Subscribe')}</Text>
        </Pressable>}
      </View>
      <Pressable onPress={() => setCaptionOpen((open) => !open)}>
        <Text numberOfLines={captionOpen ? 12 : 2} style={s.caption}><Text style={s.captionTitle}>{geel.title}</Text>{extra ? ` ${extra}` : ''}</Text>
      </Pressable>
      {geel.sound && <Pressable onPress={() => router.push({ pathname: '/geels/sound/[id]', params: { id: geel.sound!.track_id } })} style={s.soundLine}>
        <Ionicons name="musical-notes" size={13} color={colors.white} />
        <Text numberOfLines={1} style={s.soundText}>{geel.sound.title} · {geel.sound.artist_name}</Text>
      </Pressable>}
    </View>

    <GestureDetector gesture={seekGesture}>
      <View style={[s.progressHit, { bottom: bottomInset }]} onLayout={(event) => setBarWidth(Math.max(event.nativeEvent.layout.width, 1))}>
        <View style={s.progressTrack}><Animated.View style={[s.progressFill, progressStyle]} /></View>
      </View>
    </GestureDetector>
  </View>;
});

const styles = StyleSheet.create({
  burst: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  burstHeart: { marginLeft: -52, marginTop: -52, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 4 } },
  action: { alignItems: 'center', gap: 2 },
  actionIcon: { width: 48, height: 46, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#fff', fontSize: 12, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  iconShadow: { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  likeRing: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#EF4444' },
  disc: { width: 46, height: 46, borderRadius: 23, padding: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27272A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  discArt: { width: '100%', height: '100%', borderRadius: 999 },
});

const useStylesheet = makeStyles(() => ({
  item: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%' },
  loading: { position: 'absolute', top: '50%', left: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32, alignItems: 'center', justifyContent: 'center' },
  pausedIcon: { position: 'absolute', top: '50%', left: '50%', width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  mute: { position: 'absolute', top: 54, right: 14, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  rail: { position: 'absolute', right: 8, alignItems: 'center', gap: 12 },
  railAvatarWrap: { width: 50, height: 58, alignItems: 'center' },
  railAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.surfaceStrong },
  railFollow: { position: 'absolute', bottom: 2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright },
  info: { position: 'absolute', left: 14, right: 78, gap: 7 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  creatorName: { color: '#fff', fontSize: 16, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3, flexShrink: 1 },
  subscribe: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fff' },
  subscribed: { backgroundColor: 'rgba(255,255,255,0.2)' },
  subscribeText: { color: '#0A0A0A', fontSize: 12, fontWeight: '900' },
  subscribedText: { color: '#fff' },
  caption: { color: '#fff', fontSize: 14, lineHeight: 19, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  captionTitle: { fontWeight: '800' },
  soundLine: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '85%' },
  soundText: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  progressHit: { position: 'absolute', left: 0, right: 0, height: 16, justifyContent: 'flex-end' },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { height: 3, width: '100%', backgroundColor: '#fff', transformOrigin: 'left' },
}));
