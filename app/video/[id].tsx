import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEvent, useEventListener } from 'expo';
import { router, useIsFocused, useLocalSearchParams, useNavigation, usePathname } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { ContentRatingCard, type ContentWarningKind } from '@/components/ContentRatingCard';
import { GiphyPicker } from '@/components/GiphyPicker';
import { PressableScale } from '@/components/PressableScale';
import { SectionRail } from '@/components/SectionRail';
import { SwipeSheet } from '@/components/SwipeSheet';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useDownloads } from '@/downloads/DownloadProvider';
import { useI18n } from '@/i18n';
import { isWatchPartyEndedError, usePlayer } from '@/player/PlayerProvider';
import { PlaylistCreator } from '@/playlists/PlaylistCreator';
import { useAppSettings } from '@/settings/AppSettingsProvider';
import { colors, motion, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import { loadHLSQualities } from '@/utils/hls';
import { isResumable } from '@/utils/watchProgress';
import type { Comment } from '@/types/api';
import { WatchPartyChat, WatchPartyPanel } from '@/watch-parties/WatchPartyPanel';

// Videos and series whose 18+ notice was confirmed in this app session, so a
// binge does not stop at every episode.
const explicitAcceptedKeys = new Set<string>();

export default function VideoScreen() {
  const { id, comment: focusedCommentID = '', party: partyID = '', skipIntro: skipIntroParam = '', startOver: startOverParam = '' } = useLocalSearchParams<{ id: string; comment?: string; party?: string; skipIntro?: string; startOver?: string }>(); const pathname = usePathname(); const insets = useSafeAreaInsets(); const queryClient = useQueryClient();
  const { t, compactNumber, number } = useI18n();
  const { account, status } = useAuth(); const signedIn = status === 'signedIn' && !!account; const { activeChannelID: actorID } = useActiveChannel();
  const { player, video: activeVideo, mode, quality, isLoading: sourceLoading, playbackMasterURL, hdr, setHDREnabled, watchParty, play, switchQuality, joinWatchParty, sendWatchPartyPlayback, minimize, dismiss } = usePlayer(); const { settings } = useAppSettings();
  const { activity, download, getDownload, remove } = useDownloads();
  const [playerError, setPlayerError] = useState<{ id: string; message: string } | null>(null); const [menuOpen, setMenuOpen] = useState(false); const [playlistOpen, setPlaylistOpen] = useState(false); const [playlistCreatorOpen, setPlaylistCreatorOpen] = useState(false); const [qualityOpen, setQualityOpen] = useState(false); const [downloadQualityOpen, setDownloadQualityOpen] = useState(false); const [captionOpen, setCaptionOpen] = useState(false); const [audioOpen, setAudioOpen] = useState(false); const [gifOpen, setGIFOpen] = useState(false); const [commentText, setCommentText] = useState(''); const [expandedDescriptionID, setExpandedDescriptionID] = useState(''); const [progressWidth, setProgressWidth] = useState(1); const [seekFeedback, setSeekFeedback] = useState<{ seconds: number; direction: -1 | 1; nonce: number } | null>(null); const [chromeInteractive, setChromeInteractive] = useState(true); const [dismissedHighlightID, setDismissedHighlightID] = useState(''); const [commentsY, setCommentsY] = useState<number | null>(null);
  const [fullscreenPartyChatVisible, setFullscreenPartyChatVisible] = useState(true);
  const videoViewRef = useRef<VideoView>(null); const contentScrollRef = useRef<ScrollView>(null); const resumedVideoRef = useRef(''); const preferencesVideoRef = useRef(''); const focusedScrollRef = useRef(''); const window = useWindowDimensions(); const chromeOpacity = useSharedValue(1);
  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: player.currentTime, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null });
  const statusChange = useEvent(player, 'statusChange', { status: player.status });
  const playingChange = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const currentTime = timeUpdate?.currentTime ?? player.currentTime;
  const translateY = useSharedValue(0);

  const videoQuery = useQuery({ queryKey: ['video', id], queryFn: () => giltubeAPI.video(id), enabled: !!id, retry: 1 });
  const video = videoQuery.data || (activeVideo?.id === id ? activeVideo : null);
  const related = useQuery({ queryKey: ['related', id], queryFn: () => giltubeAPI.relatedVideos(id, 12), enabled: !!id });
  const relatedMedia = useQuery({ queryKey: ['related-media', id], queryFn: () => giltubeAPI.relatedMedia(id, 4), enabled: !!id, retry: false });
  const seriesContext = useQuery({ queryKey: ['series-context', id], queryFn: () => giltubeAPI.seriesContext(id), enabled: !!id, retry: false });
  const movieContext = useQuery({ queryKey: ['movie-context', id], queryFn: () => giltubeAPI.movieContext(id), enabled: !!id, retry: false });
  const seriesTrailerContext = useQuery({ queryKey: ['series-trailer-context', id], queryFn: () => giltubeAPI.seriesTrailerContext(id), enabled: !!id, retry: false });
  const movieTrailerContext = useQuery({ queryKey: ['movie-trailer-context', id], queryFn: () => giltubeAPI.movieTrailerContext(id), enabled: !!id, retry: false });
  const comments = useQuery({ queryKey: ['comments', id, actorID], queryFn: () => giltubeAPI.comments(id, actorID), enabled: !!id });
  const liked = useQuery({ queryKey: ['liked', id, actorID], queryFn: () => giltubeAPI.liked(id, actorID), enabled: signedIn && !!id && !!actorID });
  const progress = useQuery({ queryKey: ['watch-progress', id, account?.id], queryFn: () => giltubeAPI.watchProgress(id), enabled: signedIn && !!id, retry: false });
  const subscription = useQuery({ queryKey: ['subscription', video?.channel_id, actorID], queryFn: () => giltubeAPI.subscription(video!.channel_id, actorID), enabled: signedIn && !!actorID && !!video?.channel_id });
  const playlists = useQuery({ queryKey: ['playlists', account?.id], queryFn: () => giltubeAPI.playlists(account!.id), enabled: signedIn && (playlistOpen || playlistCreatorOpen) });
  const masterURL = video ? resolveMediaURL(video.hls_path) : '';
  // Downloads always use the SDR master; the playback picker follows the
  // loaded source, so while HDR plays it lists the HDR renditions.
  const qualities = useQuery({ queryKey: ['hls-qualities', masterURL], queryFn: () => loadHLSQualities(masterURL), enabled: !!masterURL && !masterURL.startsWith('file:') });
  const playbackQualityURL = activeVideo?.id === id && playbackMasterURL && !playbackMasterURL.startsWith('file:') ? playbackMasterURL : masterURL;
  const playbackQualities = useQuery({ queryKey: ['hls-qualities', playbackQualityURL], queryFn: () => loadHLSQualities(playbackQualityURL), enabled: !!playbackQualityURL && !playbackQualityURL.startsWith('file:') });
  const isPlayingHDR = activeVideo?.id === id && hdr.playing;
  const saved = id ? getDownload(id) : undefined; const downloadActivity = id ? activity[id] : undefined;
  // Focus, not just the pathname: an earlier watch screen for the same video
  // can sit in the stack, and only the focused one may drive the shared player.
  const isFocused = useIsFocused();
  const isCurrentWatchRoute = isFocused && pathname === `/video/${id}`;
  const isWatchParty = !!partyID && watchParty?.party.id === partyID;
  const watchPartyVideoID = watchParty?.video.id;
  const isPartyHost = isWatchParty && watchParty?.party.host_user_id === account?.id;
  const canControlParty = isWatchParty && (isPartyHost || watchParty?.party.sync_mode === 'open');
  const showingPlayer = isCurrentWatchRoute && activeVideo?.id === id && mode === 'expanded';
  const isFullscreen = showingPlayer && window.width > window.height;
  const showPlaybackLoading = showingPlayer && (sourceLoading || statusChange?.status === 'loading');
  const duration = Math.max(0, player.duration || 0); const playbackPercent = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;
  const hasCaptions = player.availableSubtitleTracks.length > 0;
  const hasAudioChoices = player.availableAudioTracks.length > 1;
  const hasQualityChoices = (playbackQualities.data?.length || 0) > 1 || (activeVideo?.id === id && hdr.available);
  const highlightedCommentID = focusedCommentID && dismissedHighlightID !== focusedCommentID ? focusedCommentID : '';
  const orderedComments = useMemo(() => {
    const ordered = [...(comments.data || [])].reverse();
    if (!focusedCommentID) return ordered;
    const focusedRoot = ordered.findIndex((item) => commentContains(item, focusedCommentID));
    const rootOrdered = focusedRoot <= 0 ? ordered : [ordered[focusedRoot], ...ordered.slice(0, focusedRoot), ...ordered.slice(focusedRoot + 1)];
    return rootOrdered.map((item) => prioritizeCommentTree(item, focusedCommentID));
  }, [comments.data, focusedCommentID]);

  // 18+ notice: playback (and the playback intro) waits until it is confirmed.
  // Episodes wait for their series context so a confirmed series never flashes it.
  const [explicitAccepted, setExplicitAccepted] = useState(() => explicitAcceptedKeys.has(id));
  const explicitSeriesID = seriesContext.data?.series.id || '';
  const explicitRelevant = !!video?.explicit && !partyID && !explicitAccepted && !explicitAcceptedKeys.has(id);
  const explicitGate = explicitRelevant && seriesContext.isFetched && !(explicitSeriesID && explicitAcceptedKeys.has(explicitSeriesID));
  const holdPlayback = !video || explicitGate || (explicitRelevant && !seriesContext.isFetched);
  const holdPlaybackRef = useRef(holdPlayback);
  useEffect(() => { holdPlaybackRef.current = holdPlayback; }, [holdPlayback]);

  // Playback intro: a short GilTube clip before movies and episodes, played by
  // its own player on top while the content loads paused underneath, so the
  // content is buffered by the time the intro ends. Skipped when resuming, in
  // watch parties, and after a manual "next episode" tap.
  const introPlayer = useVideoPlayer(null);
  // Already playing this video (e.g. expanded from the mini player): no intro.
  const [introFinished, setIntroFinished] = useState(!!partyID || skipIntroParam === '1' || activeVideo?.id === id);
  const introQuery = useQuery({ queryKey: ['playback-intro', id], queryFn: () => giltubeAPI.playbackIntro(id), enabled: !!id && !introFinished, retry: false, staleTime: 0, gcTime: 0 });
  const introDecision = useMemo((): 'wait' | 'play' | 'skip' => {
    if (!introQuery.isFetched) return 'wait';
    const resumeEnabled = signedIn && settings.resumePlayback && startOverParam !== '1';
    if (resumeEnabled && !progress.isFetched) return 'wait';
    const resuming = resumeEnabled && isResumable(progress.data?.progress);
    const intro = introQuery.data;
    return resuming || !intro?.play || !intro.url || getDownload(id) ? 'skip' : 'play';
  }, [getDownload, id, introQuery.data, introQuery.isFetched, progress.data?.progress, progress.isFetched, settings.resumePlayback, signedIn, startOverParam]);
  const introState: 'pending' | 'playing' | 'done' = introFinished || introDecision === 'skip' ? 'done' : introDecision === 'play' && !holdPlayback ? 'playing' : 'pending';
  const introStateRef = useRef(introState);
  const previousIntroStateRef = useRef(introState);
  // The empty intro player can emit playToEnd/statusChange before anything is
  // loaded (seen on Android when the watch screen is pushed in-app), so its
  // events only count once the intro source has actually loaded.
  const introLoadedRef = useRef(false);
  const activeVideoIDRef = useRef(activeVideo?.id);
  useEffect(() => { activeVideoIDRef.current = activeVideo?.id; }, [activeVideo?.id]);
  const finishIntro = useCallback(() => {
    if (introStateRef.current === 'done') return;
    introStateRef.current = 'done';
    setIntroFinished(true);
  }, []);
  useEffect(() => {
    introStateRef.current = introState;
    const previous = previousIntroStateRef.current;
    previousIntroStateRef.current = introState;
    if (introState === previous) return;
    if (introState === 'playing') {
      // The URL is content-addressed, so the on-device cache stays valid until
      // an admin uploads a new intro.
      const uri = resolveMediaURL(introQuery.data?.url);
      // Fall back to an uncached load rather than silently skipping the intro.
      void introPlayer.replaceAsync({ uri, useCaching: true })
        .catch(() => introPlayer.replaceAsync({ uri }))
        .then(() => { if (introStateRef.current !== 'playing') return; introLoadedRef.current = true; introPlayer.play(); })
        .catch(finishIntro);
      // Never hold the content behind an intro that will not load.
      const loadTimeout = setTimeout(() => { if (!introLoadedRef.current) finishIntro(); }, 10_000);
      return () => clearTimeout(loadTimeout);
    }
    if (introState === 'done') {
      introLoadedRef.current = false;
      introPlayer.pause();
      void introPlayer.replaceAsync(null).catch(() => undefined);
      // Still loading? The provider consults shouldAutoplay once the source is ready.
      if (activeVideoIDRef.current === id && !player.playing && !holdPlaybackRef.current) player.play();
    }
  }, [finishIntro, id, introPlayer, introQuery.data?.url, introState, player]);
  useEventListener(introPlayer, 'playToEnd', () => { if (introLoadedRef.current) finishIntro(); });
  useEventListener(introPlayer, 'statusChange', ({ status: introStatus }) => { if (introStatus === 'error' && introLoadedRef.current) finishIntro(); });
  // Leaving or minimizing during the intro hands straight over to the content.
  useEffect(() => { if (!isFocused) finishIntro(); }, [finishIntro, isFocused]);

  // Returning to this screen (e.g. Back from a related video) reloads its video
  // where it was left, and re-attaches the video surface once the transition
  // ends so it never keeps the previous screen's frozen frame.
  const navigation = useNavigation();
  const lastPositionRef = useRef(0);
  const pendingSeekRef = useRef(0);
  const wasBlurredRef = useRef(false);
  const [surfaceKey, setSurfaceKey] = useState(0);
  useEffect(() => { if (showingPlayer && currentTime > 0) lastPositionRef.current = currentTime; }, [currentTime, showingPlayer]);
  useEffect(() => { if (!isFocused) wasBlurredRef.current = true; }, [isFocused]);
  useEffect(() => (navigation as unknown as { addListener: (event: 'transitionEnd', listener: (event: { data?: { closing?: boolean } }) => void) => () => void })
    .addListener('transitionEnd', (event) => {
      if (event.data?.closing || !wasBlurredRef.current) return;
      wasBlurredRef.current = false;
      setSurfaceKey((key) => key + 1);
    }), [navigation]);
  useEffect(() => {
    if (!showingPlayer || sourceLoading || statusChange?.status !== 'readyToPlay' || pendingSeekRef.current <= 0) return;
    const target = pendingSeekRef.current;
    pendingSeekRef.current = 0;
    if (player.currentTime < 2) player.currentTime = target;
  }, [player, showingPlayer, sourceLoading, statusChange?.status]);
  useEffect(() => {
    if (partyID || !isCurrentWatchRoute || !video || activeVideo?.id === video.id) return;
    if (lastPositionRef.current > 2) pendingSeekRef.current = lastPositionRef.current;
    void play(video, undefined, { shouldAutoplay: () => introStateRef.current === 'done' && !holdPlaybackRef.current }).catch((error) => setPlayerError({ id: video.id, message: error instanceof Error ? error.message : 'Unable to play this video.' }));
  }, [activeVideo?.id, isCurrentWatchRoute, partyID, play, video]);
  useEffect(() => {
    if (!partyID || status !== 'signedIn' || watchParty?.party.id === partyID) return;
    let cancelled = false;
    void joinWatchParty(partyID).then((snapshot) => {
      if (!cancelled && snapshot.video.id !== id) router.replace({ pathname: '/video/[id]', params: { id: snapshot.video.id, party: partyID } });
    }).catch((error) => { if (!cancelled && !isWatchPartyEndedError(error)) setPlayerError({ id, message: error instanceof Error ? error.message : 'Unable to join this watch party.' }); });
    return () => { cancelled = true; };
  }, [id, joinWatchParty, partyID, status, watchParty?.party.id]);
  useEffect(() => {
    if (!isWatchParty || !watchPartyVideoID || watchPartyVideoID === id) return;
    router.replace({ pathname: '/video/[id]', params: { id: watchPartyVideoID, party: partyID } });
  }, [id, isWatchParty, partyID, watchPartyVideoID]);
  useEffect(() => {
    if (!focusedCommentID) return;
    const timer = setTimeout(() => setDismissedHighlightID(focusedCommentID), 4_500);
    return () => clearTimeout(timer);
  }, [focusedCommentID]);
  useEffect(() => {
    if (!focusedCommentID || commentsY === null || !comments.isFetched || focusedScrollRef.current === focusedCommentID) return;
    focusedScrollRef.current = focusedCommentID;
    const timer = setTimeout(() => contentScrollRef.current?.scrollTo({ y: Math.max(0, commentsY - 8), animated: true }), 180);
    return () => clearTimeout(timer);
  }, [comments.isFetched, commentsY, focusedCommentID]);
  useEffect(() => {
    if (partyID || startOverParam === '1' || !settings.resumePlayback || !signedIn || !progress.isFetched || !showingPlayer || statusChange?.status !== 'readyToPlay' || resumedVideoRef.current === id) return;
    resumedVideoRef.current = id;
    // A minimized player remains alive. Never replace its live position with an
    // older server checkpoint when the expanded watch route mounts again.
    if (player.currentTime > 2) return;
    const savedProgress = progress.data?.progress;
    if (savedProgress && !savedProgress.completed && savedProgress.position_seconds > 5 && savedProgress.position_seconds < player.duration - 8) player.currentTime = savedProgress.position_seconds;
  }, [id, partyID, player, progress.data?.progress, progress.isFetched, settings.resumePlayback, showingPlayer, signedIn, statusChange?.status, startOverParam]);
  useEffect(() => {
    if (!showingPlayer || statusChange?.status !== 'readyToPlay' || preferencesVideoRef.current === id) return;
    preferencesVideoRef.current = id;
    const normalize = (value?: string) => (value || '').trim().toLowerCase().replaceAll('_', '-');
    const matches = (candidate?: string, preferred?: string) => { const a = normalize(candidate); const b = normalize(preferred); return !!a && !!b && (a === b || a.split('-')[0] === b.split('-')[0]); };
    if (account?.audio_language) {
      const track = player.availableAudioTracks.find((item) => matches(item.language, account.audio_language));
      if (track) player.audioTrack = track;
    }
    if (account?.caption_language) {
      const track = player.availableSubtitleTracks.find((item) => matches(item.language, account.caption_language));
      if (track) player.subtitleTrack = track;
    }
  }, [account?.audio_language, account?.caption_language, id, player, showingPlayer, statusChange?.status]);
  useEffect(() => {
    if (partyID || !signedIn || !showingPlayer || activeVideo?.id !== id || introState !== 'done') return;
    const save = () => { const duration = player.duration; if (duration > 0 && player.currentTime >= 0) void giltubeAPI.saveWatchProgress(id, player.currentTime, duration).catch(() => undefined); };
    const timer = setInterval(save, 10_000);
    return () => { clearInterval(timer); save(); };
  }, [activeVideo?.id, id, introState, partyID, player, showingPlayer, signedIn]);
  useEffect(() => { if (id) void giltubeAPI.incrementView(id).catch(() => undefined); }, [id]);
  const leavePlayer = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }, []);
  // Content can start under the notice (resume skips the intro): keep it paused,
  // and start it once the notice is gone.
  useEffect(() => { if (explicitGate && playingChange?.isPlaying && activeVideo?.id === id) player.pause(); }, [activeVideo?.id, explicitGate, id, player, playingChange?.isPlaying]);
  const previousHoldRef = useRef(holdPlayback);
  useEffect(() => {
    const wasHeld = previousHoldRef.current;
    previousHoldRef.current = holdPlayback;
    if (wasHeld && !holdPlayback && introStateRef.current === 'done' && activeVideoIDRef.current === id && !player.playing) player.play();
  }, [holdPlayback, id, player]);
  const acceptExplicit = useCallback(() => {
    explicitAcceptedKeys.add(id);
    if (explicitSeriesID) explicitAcceptedKeys.add(explicitSeriesID);
    setExplicitAccepted(true);
  }, [explicitSeriesID, id]);
  const handleMinimize = useCallback(() => { minimize(); leavePlayer(); }, [leavePlayer, minimize]);
  const handleDismiss = useCallback(() => { if (isWatchParty) { handleMinimize(); return; } dismiss(); if (router.canDismiss()) router.dismissAll(); else router.replace('/(tabs)'); }, [dismiss, handleMinimize, isWatchParty]);
  const revealPlayerChrome = useCallback(() => {
    setChromeInteractive(true);
    chromeOpacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(2600, withTiming(0, { duration: 420 }, (finished) => { if (finished) runOnJS(setChromeInteractive)(false); })));
  }, [chromeOpacity]);
  useEffect(() => { if (!showingPlayer) return; const timer = setTimeout(revealPlayerChrome, 0); return () => clearTimeout(timer); }, [revealPlayerChrome, showingPlayer]);
  const seekBy = useCallback((direction: -1 | 1) => { if ((isWatchParty && !canControlParty) || introState !== 'done') return; const seconds = settings.doubleTapSeconds * direction; const total = Math.max(0, player.duration || 0); const target = Math.max(0, total > 0 ? Math.min(total, player.currentTime + seconds) : player.currentTime + seconds); if (isWatchParty) void sendWatchPartyPlayback('seek', target); else player.currentTime = target; setSeekFeedback({ seconds: Math.abs(seconds), direction, nonce: Date.now() }); void Haptics.selectionAsync(); revealPlayerChrome(); }, [canControlParty, introState, isWatchParty, player, revealPlayerChrome, sendWatchPartyPlayback, settings.doubleTapSeconds]);
  useEffect(() => { if (!seekFeedback) return; const timer = setTimeout(() => setSeekFeedback(null), 650); return () => clearTimeout(timer); }, [seekFeedback]);
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { handleMinimize(); return true; }); return () => subscription.remove(); }, [handleMinimize]);
  const swipeDown = useMemo(() => Gesture.Pan().activeOffsetY(12).failOffsetX([-36, 36]).onBegin(() => { runOnJS(revealPlayerChrome)(); }).onUpdate((event) => { translateY.value = Math.max(0, event.translationY); }).onEnd((event) => { if (event.translationY > 82 || event.velocityY > 720) { runOnJS(handleMinimize)(); return; } translateY.value = withSpring(0, motion.spring); }), [handleMinimize, revealPlayerChrome, translateY]);
  const doubleTap = useMemo(() => Gesture.Tap().numberOfTaps(2).maxDuration(280).onEnd((event) => { runOnJS(seekBy)(event.x < window.width / 2 ? -1 : 1); }), [seekBy, window.width]);
  const playerGesture = useMemo(() => Gesture.Race(swipeDown, doubleTap), [doubleTap, swipeDown]);
  const seekToX = useCallback((x: number) => { if ((isWatchParty && !canControlParty) || duration <= 0) return; player.currentTime = Math.max(0, Math.min(duration, x / progressWidth * duration)); }, [canControlParty, duration, isWatchParty, player, progressWidth]);
  const commitPartySeek = useCallback(() => { if (isWatchParty && canControlParty) void sendWatchPartyPlayback('seek', player.currentTime).catch((error) => Alert.alert(t('Playback control failed'), error instanceof Error ? error.message : t('Please try again.'))); }, [canControlParty, isWatchParty, player, sendWatchPartyPlayback, t]);
  const beginScrub = useCallback(() => { void Haptics.selectionAsync(); revealPlayerChrome(); }, [revealPlayerChrome]);
  const progressGesture = useMemo(() => Gesture.Pan().minDistance(0).onBegin((event) => { runOnJS(beginScrub)(); runOnJS(seekToX)(event.x); }).onUpdate((event) => { runOnJS(seekToX)(event.x); }).onEnd(() => { runOnJS(commitPartySeek)(); }), [beginScrub, commitPartySeek, seekToX]);
  const playerMotion = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }, { scale: 1 - Math.min(translateY.value / 1800, .08) }], borderRadius: Math.min(translateY.value / 5, 20) }));
  const chromeMotion = useAnimatedStyle(() => ({ opacity: chromeOpacity.value }));
  const requireAccount = () => { if (!signedIn) { router.push('/login'); return false; } if (!actorID) { Alert.alert(t('Channel needed'), t('Create or select a channel on GilTube first.')); return false; } return true; };

  const likeMutation = useMutation({ mutationFn: () => liked.data?.liked ? giltubeAPI.unlike(id, actorID) : giltubeAPI.like(id, actorID), onSuccess: (data) => { queryClient.setQueryData(['liked', id, actorID], { liked: data.liked ?? !liked.data?.liked }); void videoQuery.refetch(); }, onError: (error) => Alert.alert(t('Like failed'), error.message) });
  const subscriptionMutation = useMutation({ mutationFn: () => subscription.data?.subscribed ? giltubeAPI.unsubscribe(video!.channel_id, actorID) : giltubeAPI.subscribe(video!.channel_id, actorID), onSuccess: (data) => { queryClient.setQueryData(['subscription', video?.channel_id, actorID], data); void queryClient.invalidateQueries({ queryKey: ['subscriptions'] }); }, onError: (error) => Alert.alert(t('Subscription failed'), error.message) });
  const commentMutation = useMutation({ mutationFn: () => giltubeAPI.comment(id, actorID, commentText.trim()), onSuccess: () => { setCommentText(''); void comments.refetch(); }, onError: (error) => Alert.alert(t('Comment failed'), error.message) });
  const replyMutation = useMutation({ mutationFn: ({ parentID, text }: { parentID: string; text: string }) => giltubeAPI.comment(id, actorID, text, parentID), onSuccess: () => void comments.refetch(), onError: (error) => Alert.alert(t('Reply failed'), error.message) });
  const commentLikeMutation = useMutation({ mutationFn: ({ commentID, liked }: { commentID: string; liked: boolean }) => liked ? giltubeAPI.unlikeComment(commentID, actorID) : giltubeAPI.likeComment(commentID, actorID), onSuccess: () => void comments.refetch(), onError: (error) => Alert.alert(t('Could not update like'), error.message) });
  const deleteCommentMutation = useMutation({ mutationFn: giltubeAPI.deleteComment, onSuccess: () => void comments.refetch(), onError: (error) => Alert.alert(t('Could not delete comment'), error.message) });
  const saveOffline = async (selectedQuality: string) => { if (!video) return; setMenuOpen(false); setDownloadQualityOpen(false); try { await download(video, selectedQuality); } catch (error) { Alert.alert(t('Download failed'), error instanceof Error ? error.message : t('Please try again.')); } };
  const removeOffline = () => { if (!video) return; setMenuOpen(false); Alert.alert(t('Remove download?'), `${video.title} ${t('will no longer be available offline.')}`, [{ text: t('Cancel'), style: 'cancel' }, { text: t('Remove'), style: 'destructive', onPress: () => void remove(video.id) }]); };
  const addToPlaylist = async (playlistID: string) => { try { await giltubeAPI.addToPlaylist(playlistID, id); setPlaylistOpen(false); Alert.alert(t('Saved'), t('Video added to playlist.')); } catch (error) { Alert.alert(t('Could not add video'), error instanceof Error ? error.message : t('Please try again.')); } };
  const share = () => { if (!video) return; void Share.share({ title: video.title, message: `${video.title}\nhttps://giltube.gilservers.com/video/${video.id}`, url: `https://giltube.gilservers.com/video/${video.id}` }); };
  const episode = seriesContext.data?.episodes[seriesContext.data.current_index];
  const nextEpisode = seriesContext.data?.episodes[seriesContext.data.current_index + 1];
  // Only the feature itself gets the rating card, never its trailer.
  const playingMovie = movieContext.data?.movie?.video_id === id ? movieContext.data.movie : undefined;
  const playingRating = playingMovie?.content_rating || (episode ? seriesContext.data?.series.content_rating : undefined);
  const playingWarning: ContentWarningKind = playingMovie?.content_warning ? 'movie' : episode?.content_warning ? 'episode' : '';
  const ratingCardActive = showingPlayer && introState === 'done' && !holdPlayback && !!playingChange?.isPlaying;
  const showSkipIntro = !!episode && episode.intro_end_seconds > episode.intro_start_seconds && currentTime >= Math.max(0, episode.intro_start_seconds - 1) && currentTime < episode.intro_end_seconds;
  const togglePlayback = () => {
    if (isWatchParty) {
      if (!canControlParty) return;
      void sendWatchPartyPlayback(playingChange?.isPlaying ? 'pause' : 'play').catch((error) => Alert.alert(t('Playback control failed'), error instanceof Error ? error.message : t('Please try again.')));
    } else if (playingChange?.isPlaying) player.pause(); else player.play();
    revealPlayerChrome();
  };
  const skipIntro = () => {
    if (!episode) return;
    if (isWatchParty) {
      if (canControlParty) void sendWatchPartyPlayback('seek', episode.intro_end_seconds);
    } else player.currentTime = episode.intro_end_seconds;
  };
  // The series "Skip intro" button shows for its first few seconds, then only
  // while the player controls are showing (or playback is paused).
  const skipIntroActive = showSkipIntro && introState === 'done';
  const [skipIntroWindowExpired, setSkipIntroWindowExpired] = useState(false);
  useEffect(() => {
    if (!skipIntroActive) return;
    const timer = setTimeout(() => setSkipIntroWindowExpired(true), 5_000);
    // Leaving the intro range re-arms the window for the next time it shows.
    return () => { clearTimeout(timer); setSkipIntroWindowExpired(false); };
  }, [skipIntroActive]);
  const skipIntroVisible = !skipIntroWindowExpired || chromeInteractive || !playingChange?.isPlaying;
  const skipIntroOpacity = useSharedValue(0);
  useEffect(() => { skipIntroOpacity.value = withTiming(skipIntroVisible ? 1 : 0, { duration: skipIntroVisible ? 150 : 500 }); }, [skipIntroOpacity, skipIntroVisible]);
  const skipIntroMotion = useAnimatedStyle(() => ({ opacity: skipIntroOpacity.value }));
  const handleCaptions = () => { if (player.subtitleTrack) player.subtitleTrack = null; else setCaptionOpen(true); revealPlayerChrome(); };
  const handleAudioTracks = () => { setAudioOpen(true); revealPlayerChrome(); };
  const toggleFullscreen = () => { void ScreenOrientation.lockAsync(isFullscreen ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE); revealPlayerChrome(); };
  useEffect(() => {
    void (showingPlayer ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP));
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); };
  }, [showingPlayer]);
  useEffect(() => { player.staysActiveInBackground = isWatchParty || settings.backgroundPlayback || settings.pipEnabled; }, [isWatchParty, player, settings.backgroundPlayback, settings.pipEnabled]);
  useEffect(() => { if (!showingPlayer) return; const listener = AppState.addEventListener('change', (state) => { if (state !== 'background' || !player.playing) return; if (settings.pipEnabled) void videoViewRef.current?.startPictureInPicture().catch(() => undefined); else if (!settings.backgroundPlayback && !isWatchParty) player.pause(); }); return () => listener.remove(); }, [isWatchParty, player, settings.backgroundPlayback, settings.pipEnabled, showingPlayer]);

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <StatusBar hidden={isFullscreen} />
    <GestureDetector gesture={playerGesture}><Animated.View style={[styles.playerShell, isFullscreen ? styles.playerFullscreen : { marginTop: insets.top }, playerMotion]}>
      {showingPlayer ? <VideoView key={`${isFullscreen ? 'landscape' : 'portrait'}-player-${surfaceKey}-${isPlayingHDR ? 'hdr' : 'sdr'}`} ref={videoViewRef} player={player} onTouchStart={revealPlayerChrome} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} allowsPictureInPicture={settings.pipEnabled} startsPictureInPictureAutomatically={settings.pipEnabled} contentFit="contain" surfaceType={isPlayingHDR ? 'surfaceView' : 'textureView'} /> : <View style={styles.playerLoading}><ActivityIndicator color={colors.accentBright} />{playerError?.id === id && <Text style={styles.playerError}>{playerError.message}</Text>}</View>}
      {showPlaybackLoading && <View pointerEvents="none" style={styles.buffering}><View style={styles.bufferingDisc}><ActivityIndicator color={colors.white} size="large" /></View></View>}
      {!!seekFeedback && <View pointerEvents="none" style={[styles.seekFeedback, seekFeedback.direction < 0 ? styles.seekFeedbackBack : styles.seekFeedbackForward]}><Ionicons name={seekFeedback.direction < 0 ? 'play-back' : 'play-forward'} color={colors.white} size={24} /><Text style={styles.seekFeedbackText}>{seekFeedback.seconds} {t('seconds')}</Text></View>}
      {(!!playingRating?.rating || !!playingWarning) && <ContentRatingCard key={id} rating={playingRating} warning={playingWarning} active={ratingCardActive} fullscreen={isFullscreen} />}
      {skipIntroActive && <Animated.View pointerEvents={skipIntroVisible ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, skipIntroMotion]}><PressableScale disabled={isWatchParty && !canControlParty} onPress={skipIntro} style={[styles.skipIntro, isWatchParty && !canControlParty && { opacity: .45 }]}><Text style={styles.skipIntroText}>{t('Skip intro')}</Text><Ionicons name="play-skip-forward" color={colors.white} size={16} /></PressableScale></Animated.View>}
      <Animated.View pointerEvents={chromeInteractive ? 'box-none' : 'none'} style={[styles.playerChrome, chromeMotion]}><View style={styles.swipeHandle} /><PressableScale accessibilityLabel={t(isWatchParty ? 'Minimize watch party' : 'Close player')} onPress={handleDismiss} style={styles.close}><Ionicons name={isWatchParty ? 'chevron-down' : 'close'} color={colors.white} size={25} /></PressableScale><PressableScale disabled={isWatchParty && !canControlParty} onPress={togglePlayback} style={[styles.centerPlay, isWatchParty && !canControlParty && { opacity: .45 }]}><Ionicons name={playingChange?.isPlaying ? 'pause' : 'play'} color={colors.white} size={27} /></PressableScale><GestureDetector gesture={progressGesture}><View onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)} style={styles.playerProgress}><View style={styles.playerProgressTrack}><View style={[styles.playerProgressFill, { width: `${playbackPercent}%` }]} /></View><View style={[styles.playerProgressThumb, { left: `${playbackPercent}%` }]} /></View></GestureDetector><View style={styles.compactControls}><PressableScale disabled={isWatchParty && !canControlParty} onPress={togglePlayback} style={[styles.controlButton, isWatchParty && !canControlParty && { opacity: .45 }]}><Ionicons name={playingChange?.isPlaying ? 'pause' : 'play'} color={colors.white} size={18} /></PressableScale><Text style={styles.controlTime}>{clock(currentTime)} / {clock(duration)}</Text>{isPlayingHDR && <View style={styles.hdrBadge}><Text style={styles.hdrBadgeText}>HDR</Text></View>}<View style={styles.controlSpacer} />{hasAudioChoices && <PressableScale accessibilityLabel={t('Audio tracks')} onPress={handleAudioTracks} style={styles.controlButton}><Ionicons name="musical-notes-outline" color={colors.white} size={18} /></PressableScale>}{hasCaptions && <PressableScale onPress={handleCaptions} style={styles.controlButton}><Ionicons name="logo-closed-captioning" color={player.subtitleTrack ? colors.accentBright : colors.white} size={19} /></PressableScale>}{hasQualityChoices && <PressableScale onPress={() => setQualityOpen(true)} style={styles.controlButton}><Ionicons name="settings-outline" color={colors.white} size={19} /></PressableScale>}<PressableScale onPress={toggleFullscreen} style={styles.controlButton}><Ionicons name={isFullscreen ? 'contract-outline' : 'scan-outline'} color={colors.white} size={20} /></PressableScale></View></Animated.View>
      {introState !== 'done' && !partyID && <View style={styles.introOverlay}>
        {introState === 'playing'
          ? <VideoView player={introPlayer} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} contentFit="contain" surfaceType="textureView" />
          : <ActivityIndicator color={colors.accentBright} />}
        {introState === 'playing' && introQuery.data?.allow_skip !== false && <PressableScale accessibilityLabel={t('Skip')} onPress={finishIntro} style={styles.introSkip}><Text style={styles.skipIntroText}>{t('Skip')}</Text><Ionicons name="play-skip-forward" color={colors.white} size={16} /></PressableScale>}
      </View>}
      {explicitGate && <View style={styles.explicitGate}>
        <View style={styles.explicitBadge}><Text style={styles.explicitBadgeText}>18+</Text></View>
        <Text style={styles.explicitTitle}>{t('Explicit content')}</Text>
        <Text style={styles.explicitBody}>{t('This is marked 18+ and may contain content intended for adults.')}</Text>
        <View style={styles.explicitButtons}>
          <PressableScale onPress={leavePlayer} style={styles.explicitBack}><Text style={styles.explicitBackText}>{t('Go back')}</Text></PressableScale>
          <PressableScale onPress={acceptExplicit} style={styles.explicitContinue}><Text style={styles.explicitContinueText}>{t('Continue')}</Text></PressableScale>
        </View>
      </View>}
    </Animated.View></GestureDetector>
    {isFullscreen && isWatchParty && fullscreenPartyChatVisible && <View style={[styles.fullscreenPartyChat, { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) }]}><WatchPartyChat overlay onHide={() => setFullscreenPartyChatVisible(false)} /></View>}
    {isFullscreen && isWatchParty && !fullscreenPartyChatVisible && <PressableScale accessibilityLabel={t('Show party chat')} onPress={() => setFullscreenPartyChatVisible(true)} style={[styles.fullscreenPartyChatOpen, { top: Math.max(insets.top, 8) + 50 }]}><Ionicons name="chatbubbles" size={21} color={colors.white} />{!!watchParty?.messages.length && <View style={styles.fullscreenPartyChatBadge}><Text style={styles.fullscreenPartyChatBadgeText}>{watchParty.messages.length > 99 ? '99+' : watchParty.messages.length}</Text></View>}</PressableScale>}
    {videoQuery.isLoading && !video && <ActivityIndicator style={styles.loader} color={colors.accentBright} size="large" />}
    {!!video && <ScrollView ref={contentScrollRef} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <Animated.View entering={FadeInDown.duration(420)}>
        {isWatchParty && <WatchPartyPanel />}
        <Text style={styles.title}>{video.title}</Text><View style={styles.metaRow}><Text style={styles.meta}>{compactNumber(video.views)} {t(video.views === 1 ? 'view' : 'views')}</Text>{!!saved && <View style={styles.offlineBadge}><Ionicons name="download" size={11} color={colors.success} /><Text style={styles.offlineBadgeText}>{t('Downloaded')} · {saved.quality}</Text></View>}{isPlayingHDR && <View style={styles.hdrBadge}><Text style={styles.hdrBadgeText}>HDR</Text></View>}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
          <Action icon={liked.data?.liked ? 'thumbs-up' : 'thumbs-up-outline'} label={compactNumber(video.likes || 0)} active={liked.data?.liked} onPress={() => requireAccount() && likeMutation.mutate()} />
          <Action icon="share-social-outline" label={t('Share')} onPress={share} />
          <Action icon="ellipsis-horizontal" label={t('More')} onPress={() => setMenuOpen(true)} />
        </ScrollView>
        {!!downloadActivity && <View style={styles.downloadStatus}><Text style={styles.downloadStatusText}>{downloadStatusText(downloadActivity, t)}</Text>{downloadActivity.status === 'downloading' && <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, downloadActivity.progress * 100)}%` }]} /></View>}</View>}
        <View style={styles.channelRow}><PressableScale onPress={() => video.channel_id && router.push({ pathname: '/channel/[id]', params: { id: video.channel_id } })} style={styles.channelLink}><Image source={resolveMediaURL(video.channel?.avatar_url || '')} style={styles.avatar} contentFit="cover" /><View style={styles.channelCopy}><View style={styles.channelNameRow}><Text style={styles.channel}>{video.channel?.name || 'GilTube'}</Text><VerifiedBadge verified={video.channel?.verified} size={16} /></View><Text style={styles.channelHint}>{subscription.data ? `${compactNumber(subscription.data.subscriber_count)} ${t(subscription.data.subscriber_count === 1 ? 'subscriber' : 'subscribers')}` : t('View channel')}</Text></View></PressableScale>{actorID !== video.channel_id && <PressableScale disabled={subscriptionMutation.isPending} onPress={() => requireAccount() && subscriptionMutation.mutate()} style={[styles.channelSubscribe, subscription.data?.subscribed && styles.channelSubscribed]}><Text style={[styles.channelSubscribeText, subscription.data?.subscribed && styles.channelSubscribedText]}>{t(subscription.data?.subscribed ? 'Subscribed' : 'Subscribe')}</Text></PressableScale>}</View>
        {!!video.description && <View style={styles.descriptionCard}><LinkedDescription text={video.description} expanded={expandedDescriptionID === id} /><PressableScale onPress={() => setExpandedDescriptionID((value) => value === id ? '' : id)}><Text style={styles.descriptionToggle}>{t(expandedDescriptionID === id ? 'Show less' : 'More')}</Text></PressableScale></View>}
        {!!seriesTrailerContext.data?.series && <TrailerSeriesSection series={seriesTrailerContext.data.series} />}
        {!!movieTrailerContext.data?.movie && <TrailerMovieSection movie={movieTrailerContext.data.movie} />}
        {!!seriesContext.data && <SeriesWatchSection context={seriesContext.data} currentVideoID={id} />}
        {!!movieContext.data?.movie && <MovieWatchSection movie={movieContext.data.movie} />}
        {!!nextEpisode && <PressableScale onPress={() => router.replace({ pathname: '/video/[id]', params: { id: nextEpisode.video_id, skipIntro: '1' } })} style={styles.nextEpisode}><View><Text style={styles.nextKicker}>{t('PLAY NEXT')}</Text><Text style={styles.nextTitle}>{t('S')}{nextEpisode.season_number} E{nextEpisode.episode_number} · {nextEpisode.title}</Text></View><Ionicons name="play-circle" color={colors.accentBright} size={34} /></PressableScale>}
        <View onLayout={(event) => setCommentsY(event.nativeEvent.layout.y)} style={styles.commentsHeader}><Text style={styles.sectionTitle}>{t('Comments')}</Text><Text style={styles.commentCount}>{number(video.comments_count || comments.data?.length || 0)}</Text></View>
        {signedIn ? <View style={styles.composer}><TextInput value={commentText} onChangeText={setCommentText} placeholder={t('Add a comment…')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} multiline maxLength={500} style={styles.commentInput} /><PressableScale onPress={() => setGIFOpen(true)} style={styles.gifButton}><Text style={styles.gifButtonText}>GIF</Text></PressableScale><PressableScale disabled={!commentText.trim() || commentMutation.isPending} onPress={() => actorID ? commentMutation.mutate() : requireAccount()} style={styles.send}><Ionicons name="send" size={18} color={commentText.trim() ? colors.accentBright : colors.textDim} /></PressableScale></View> : <PressableScale onPress={() => router.push('/login')} style={styles.signInComments}><Text style={styles.signInCommentsText}>{t('Sign in to join the conversation')}</Text></PressableScale>}
        {comments.isLoading && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.accentBright} />}
        {!comments.isLoading && !comments.data?.length && <Text style={styles.noComments}>{t('No comments yet. Start the conversation.')}</Text>}
        {orderedComments.map((comment) => <CommentNode key={comment.id} comment={comment} focusedCommentID={focusedCommentID} highlightedCommentID={highlightedCommentID} actorID={actorID} signedIn={signedIn} busy={replyMutation.isPending || commentLikeMutation.isPending || deleteCommentMutation.isPending} onRequireAccount={requireAccount} onReply={(parentID, text) => replyMutation.mutateAsync({ parentID, text }).then(() => undefined)} onToggleLike={(item) => commentLikeMutation.mutate({ commentID: item.id, liked: !!item.liked_by_actor })} onDelete={(item) => Alert.alert(t('Delete comment?'), t('This will also remove its replies.'), [{ text: t('Cancel'), style: 'cancel' }, { text: t('Delete'), style: 'destructive', onPress: () => deleteCommentMutation.mutate(item.id) }])} />)}
        {(!!related.data?.length || !!relatedMedia.data?.length) && <View style={styles.related}><SectionRail title={t('Up next')} videos={related.data || []} media={relatedMedia.data} mediaFirst={!!movieContext.data?.movie || !!seriesContext.data} /></View>}
      </Animated.View>
    </ScrollView>}
    <SwipeSheet visible={menuOpen} title={t('Video options')} onClose={() => setMenuOpen(false)}>
      <MenuItem icon="people-circle-outline" title={t('Start a watch party')} subtitle={t(signedIn ? 'Watch and chat together' : 'Sign in to create a room')} onPress={() => { setMenuOpen(false); if (signedIn) router.push({ pathname: '/watch-parties', params: { video: id, start: String(Math.floor(player.currentTime)) } }); else router.push('/login'); }} />
      <MenuItem icon={saved ? 'trash-outline' : 'download-outline'} title={saved ? `${t('Remove offline download')} · ${saved.quality}` : downloadActivity ? downloadStatusText(downloadActivity, t) : t('Download for offline playback')} subtitle={!saved && (!downloadActivity || downloadActivity.status === 'failed') ? t('Choose download quality') : undefined} onPress={saved ? removeOffline : () => { setMenuOpen(false); if (!downloadActivity || downloadActivity.status === 'failed') setDownloadQualityOpen(true); }} />
      {hasQualityChoices && <MenuItem icon="options-outline" title={t('Playback quality')} subtitle={quality} onPress={() => { setMenuOpen(false); setQualityOpen(true); }} />}
      <MenuItem icon="share-social-outline" title={t('Share video')} onPress={() => { setMenuOpen(false); share(); }} />
      <MenuItem icon="add-circle-outline" title={t('Add to playlist')} subtitle={t(signedIn ? 'Choose a playlist' : 'Sign in to save')} onPress={() => { setMenuOpen(false); if (signedIn) setPlaylistOpen(true); else router.push('/login'); }} />
    </SwipeSheet>
    <SwipeSheet visible={downloadQualityOpen} title={t('Download quality')} onClose={() => setDownloadQualityOpen(false)}><MenuItem icon="sparkles-outline" title={t('Best available')} subtitle={t('Largest file')} onPress={() => void saveOffline('best')} />{qualities.isLoading && <ActivityIndicator color={colors.accentBright} />}{qualities.data?.map((option) => <MenuItem key={option.url} icon="download-outline" title={option.label} subtitle={t('Save this quality offline')} onPress={() => void saveOffline(option.label)} />)}</SwipeSheet>
    <SwipeSheet visible={qualityOpen} title={t('Playback quality')} onClose={() => setQualityOpen(false)}>{activeVideo?.id === id && hdr.available && <MenuItem icon={hdr.playing ? 'sunny' : 'sunny-outline'} title={t(hdr.playing ? 'HDR: On' : 'HDR: Off')} subtitle={t('High dynamic range on this screen')} onPress={() => { setQualityOpen(false); void setHDREnabled(!hdr.playing).catch(() => Alert.alert(t('Could not switch HDR'), t('Please try again.'))); }} />}<MenuItem icon="hardware-chip-outline" title={t('Auto')} subtitle={t('Adapts to your connection')} onPress={() => { setQualityOpen(false); void switchQuality(null, 'Auto'); }} />{playbackQualities.isLoading && <ActivityIndicator color={colors.accentBright} />}{playbackQualities.data?.map((option) => <MenuItem key={option.url} icon={quality === option.label ? 'checkmark-circle' : 'radio-button-off'} title={option.label} onPress={() => { setQualityOpen(false); void switchQuality(option.url, option.label); }} />)}</SwipeSheet>
    <SwipeSheet visible={captionOpen} title={t('Subtitles')} onClose={() => setCaptionOpen(false)}>{player.availableSubtitleTracks.map((track, index) => <MenuItem key={track.id || `${track.language}-${track.label}-${index}`} icon={player.subtitleTrack?.id === track.id && !!track.id ? 'checkmark-circle' : 'text-outline'} title={track.label || track.name || track.language.toUpperCase()} subtitle={track.language || undefined} onPress={() => { player.subtitleTrack = track; setCaptionOpen(false); revealPlayerChrome(); }} />)}</SwipeSheet>
    <SwipeSheet visible={audioOpen} title={t('Audio track')} onClose={() => setAudioOpen(false)}>{player.availableAudioTracks.map((track, index) => <MenuItem key={track.id || `${track.language}-${track.label}-${index}`} icon={player.audioTrack?.id === track.id && !!track.id ? 'checkmark-circle' : 'musical-notes-outline'} title={track.name || track.label || track.language.toUpperCase()} subtitle={track.language || undefined} onPress={() => { player.audioTrack = track; setAudioOpen(false); revealPlayerChrome(); }} />)}</SwipeSheet>
    <SwipeSheet visible={playlistOpen} title={t('Add to playlist')} onClose={() => setPlaylistOpen(false)}><MenuItem icon="add-circle-outline" title={t('Create playlist')} subtitle={t('Create one and add this video')} onPress={() => { setPlaylistOpen(false); setPlaylistCreatorOpen(true); }} />{playlists.isLoading && <ActivityIndicator color={colors.accentBright} />}{playlists.data?.playlists.map((playlist) => <MenuItem key={playlist.id} icon="list-outline" title={playlist.title} subtitle={`${number(playlist.video_count)} ${t(playlist.video_count === 1 ? 'video' : 'videos')} · ${t(playlist.visibility)}`} onPress={() => void addToPlaylist(playlist.id)} />)}</SwipeSheet>
    <PlaylistCreator visible={playlistCreatorOpen} onClose={() => setPlaylistCreatorOpen(false)} onCreated={(playlist) => addToPlaylist(playlist.id)} />
    <GiphyPicker visible={gifOpen} onClose={() => setGIFOpen(false)} onSelect={(url) => setCommentText((current) => current.trim() ? `${current}\n${url}` : url)} />
  </KeyboardAvoidingView>;
}

function Action({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void }) { return <PressableScale onPress={onPress} style={[styles.action, active && styles.actionActive]}><Ionicons name={icon} size={19} color={active ? colors.accentBright : colors.text} /><Text style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text></PressableScale>; }
function MenuItem({ icon, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; onPress: () => void }) { return <PressableScale onPress={onPress} style={styles.menuItem}><View style={styles.menuIcon}><Ionicons name={icon} size={21} color={colors.text} /></View><View style={styles.menuCopy}><Text style={styles.menuTitle}>{title}</Text>{!!subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}</View></PressableScale>; }
function megabytes(bytes: number) { return `${(Math.max(0, bytes) / 1024 / 1024).toFixed(1)} MB`; }
function downloadStatusText(activity: import('@/downloads/DownloadProvider').DownloadActivity, t: (value: string) => string) { if (activity.status !== 'downloading' || activity.totalBytes <= 0) return t(activity.message); return `${t('Downloading')} ${megabytes(activity.bytesWritten)} / ${megabytes(activity.totalBytes)} · ${Math.round(activity.progress * 100)}%`; }
function LinkedDescription({ text, expanded }: { text: string; expanded: boolean }) { const parts = text.split(/((?:https?:\/\/|www\.)[^\s]+)/gi); return <Text numberOfLines={expanded ? undefined : 3} style={styles.description}>{parts.map((part, index) => /^(?:https?:\/\/|www\.)/i.test(part) ? <Text key={`${part}-${index}`} style={styles.descriptionLink} onPress={() => void Linking.openURL(part.startsWith('www.') ? `https://${part}` : part)}>{part}</Text> : part)}</Text>; }
function SeriesWatchSection({ context, currentVideoID }: { context: import('@/types/api').SeriesContext; currentVideoID: string }) { const { t } = useI18n(); const current = context.episodes[context.current_index]; return <View style={styles.contextCard}><PressableScale onPress={() => router.push({ pathname: '/series/[id]', params: { id: context.series.id } })} style={styles.contextHeading}><View style={styles.contextCopy}><Text style={styles.contextKicker}>{t('NOW WATCHING')}</Text><Text style={styles.contextTitle}>{context.series.title}</Text><Text style={styles.contextMeta}>{t('Season')} {current?.season_number} · {t('Episode')} {current?.episode_number}</Text></View><Ionicons name="chevron-forward" color={colors.textMuted} size={20} /></PressableScale><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.episodeRail}>{context.episodes.filter((item) => item.season_number === current?.season_number).map((item) => <PressableScale key={item.id} onPress={() => item.video_id !== currentVideoID && router.replace({ pathname: '/video/[id]', params: { id: item.video_id } })} style={[styles.watchEpisode, item.video_id === currentVideoID && styles.watchEpisodeActive]}><Image source={resolveMediaURL(item.video?.thumbnail_url || context.series.backdrop_url)} style={styles.watchThumb} contentFit="cover" /><Text numberOfLines={1} style={styles.watchEpisodeTitle}>E{item.episode_number} · {item.title}</Text></PressableScale>)}</ScrollView></View>; }
function MovieWatchSection({ movie }: { movie: import('@/types/api').Movie }) { const { t } = useI18n(); return <PressableScale onPress={() => router.push({ pathname: '/movies/[id]', params: { id: movie.id } })} style={styles.movieContext}><Image source={resolveMediaURL(movie.poster_url)} style={styles.moviePoster} contentFit="cover" /><View style={styles.contextCopy}><Text style={styles.contextKicker}>{t('GILTUBE MOVIE')}</Text><Text style={styles.contextTitle}>{movie.title}</Text><Text numberOfLines={2} style={styles.contextMeta}>{movie.release_year} · {(movie.genres || []).join(' · ')}</Text></View><Ionicons name="chevron-forward" color={colors.textMuted} size={20} /></PressableScale>; }
function TrailerSeriesSection({ series }: { series: import('@/types/api').Series }) { const { t } = useI18n(); return <View style={styles.trailerCard}><Image source={resolveMediaURL(series.poster_url || series.backdrop_url)} style={styles.trailerPoster} contentFit="cover" /><View style={styles.trailerCopy}><Text style={styles.contextKicker}>{t('SERIES TRAILER')}</Text><Text numberOfLines={2} style={styles.contextTitle}>{series.title}</Text><Text numberOfLines={3} style={styles.contextMeta}>{series.synopsis}</Text>{!!series.first_episode?.video_id && <PressableScale onPress={() => router.replace({ pathname: '/video/[id]', params: { id: series.first_episode!.video_id } })} style={styles.trailerButton}><Ionicons name="play" color={colors.white} size={15} /><Text style={styles.trailerButtonText}>{t('Watch series')}</Text></PressableScale>}</View></View>; }
function TrailerMovieSection({ movie }: { movie: import('@/types/api').Movie }) { const { t } = useI18n(); return <View style={styles.trailerCard}><Image source={resolveMediaURL(movie.poster_url || movie.backdrop_url)} style={styles.trailerPoster} contentFit="cover" /><View style={styles.trailerCopy}><Text style={styles.contextKicker}>{t('MOVIE TRAILER')}</Text><Text numberOfLines={2} style={styles.contextTitle}>{movie.title}</Text><Text numberOfLines={3} style={styles.contextMeta}>{movie.synopsis}</Text>{!!movie.video_id && <PressableScale onPress={() => router.replace({ pathname: '/video/[id]', params: { id: movie.video_id } })} style={styles.trailerButton}><Ionicons name="play" color={colors.white} size={15} /><Text style={styles.trailerButtonText}>{t('Watch movie')}</Text></PressableScale>}</View></View>; }
function CommentNode({ comment, focusedCommentID, highlightedCommentID, actorID, signedIn, busy, depth = 0, onRequireAccount, onReply, onToggleLike, onDelete }: { comment: Comment; focusedCommentID: string; highlightedCommentID: string; actorID: string; signedIn: boolean; busy: boolean; depth?: number; onRequireAccount: () => boolean; onReply: (parentID: string, text: string) => Promise<void>; onToggleLike: (comment: Comment) => void; onDelete: (comment: Comment) => void }) {
  const { t, compactNumber, relative } = useI18n();
  const [replying, setReplying] = useState(false); const [reply, setReply] = useState(''); const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null); const [gifOpen, setGIFOpen] = useState(false); const replies = comment.replies || []; const highlighted = comment.id === highlightedCommentID; const expanded = expandedByUser ?? commentHasDescendant(comment, focusedCommentID);
  const submitReply = async () => { if (!reply.trim() || busy) return; await onReply(comment.id, reply.trim()); setReply(''); setReplying(false); setExpandedByUser(true); };
  const startReply = () => { if (!onRequireAccount()) return; setReplying((value) => !value); };
  return <View style={[styles.comment, depth > 0 && styles.replyComment, highlighted && styles.commentFocused]}><PressableScale onPress={() => router.push({ pathname: '/channel/[id]', params: { id: comment.channel.id } })}><Image source={resolveMediaURL(comment.channel.avatar_url || '')} style={styles.commentAvatar} contentFit="cover" /></PressableScale><View style={styles.commentBody}><View style={styles.commentTop}><PressableScale onPress={() => router.push({ pathname: '/channel/[id]', params: { id: comment.channel.id } })} style={styles.commentAuthorRow}><Text style={styles.commentAuthor}>{comment.channel.name || t('GilTube user')}</Text><VerifiedBadge verified={comment.channel.verified} size={13} /></PressableScale><Text style={styles.commentDate}>{relative(comment.created_at)}</Text></View><CommentContent text={comment.text} /><View style={styles.commentActions}><PressableScale disabled={busy} onPress={() => { if (signedIn && actorID) onToggleLike(comment); else onRequireAccount(); }} style={styles.commentAction}><Ionicons name={comment.liked_by_actor ? 'heart' : 'heart-outline'} color={comment.liked_by_actor ? colors.accentBright : colors.textMuted} size={15} /><Text style={[styles.commentActionText, comment.liked_by_actor && { color: colors.accentBright }]}>{compactNumber(comment.likes_count || 0)}</Text></PressableScale><PressableScale onPress={startReply} style={styles.commentAction}><Ionicons name="return-down-forward-outline" color={colors.textMuted} size={15} /><Text style={styles.commentActionText}>{t(replying ? 'Cancel' : 'Reply')}</Text></PressableScale>{actorID === comment.channel.id && <PressableScale disabled={busy} onPress={() => onDelete(comment)} style={styles.commentAction}><Ionicons name="trash-outline" color={colors.textMuted} size={14} /><Text style={styles.commentActionText}>{t('Delete')}</Text></PressableScale>}</View>
    {replying && <View style={styles.replyComposer}><TextInput autoFocus value={reply} onChangeText={setReply} placeholder={`${t('Reply to')} ${comment.channel.name}…`} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} multiline maxLength={500} style={styles.replyInput} /><PressableScale onPress={() => setGIFOpen(true)} style={styles.gifButton}><Text style={styles.gifButtonText}>GIF</Text></PressableScale><PressableScale disabled={!reply.trim() || busy} onPress={() => void submitReply()} style={styles.replySend}><Ionicons name="send" color={reply.trim() ? colors.accentBright : colors.textDim} size={17} /></PressableScale></View>}
    {!!replies.length && <><PressableScale onPress={() => setExpandedByUser(!expanded)} style={styles.repliesToggle}><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.gilid} size={16} /><Text style={styles.repliesToggleText}>{expanded ? t('Hide replies') : `${t('View')} ${replies.length} ${t(replies.length === 1 ? 'reply' : 'replies')}`}</Text></PressableScale>{expanded && <View style={styles.replies}>{replies.map((item) => <CommentNode key={item.id} comment={item} focusedCommentID={focusedCommentID} highlightedCommentID={highlightedCommentID} actorID={actorID} signedIn={signedIn} busy={busy} depth={depth + 1} onRequireAccount={onRequireAccount} onReply={onReply} onToggleLike={onToggleLike} onDelete={onDelete} />)}</View>}</>}
    <GiphyPicker visible={gifOpen} onClose={() => setGIFOpen(false)} onSelect={(url) => setReply((current) => current.trim() ? `${current}\n${url}` : url)} />
  </View></View>;
}
function CommentContent({ text }: { text: string }) { const lines = text.split(/\s+/); const gifs = lines.filter((line) => /^https?:\/\//i.test(line) && (/(?:^|\.)giphy\.com/i.test(line) || /\.gif(?:\?|$)/i.test(line))); const plain = lines.filter((line) => !gifs.includes(line)).join(' ').trim(); return <View>{!!plain && <Text style={styles.commentText}>{plain}</Text>}{gifs.map((url) => <Image key={url} source={url} style={styles.commentGIF} contentFit="cover" />)}</View>; }
function commentContains(comment: Comment, commentID: string): boolean { return !!commentID && (comment.id === commentID || (comment.replies || []).some((reply) => commentContains(reply, commentID))); }
function commentHasDescendant(comment: Comment, commentID: string): boolean { return (comment.replies || []).some((reply) => commentContains(reply, commentID)); }
function prioritizeCommentTree(comment: Comment, commentID: string): Comment { const replies = comment.replies || []; const focusedReply = replies.findIndex((reply) => commentContains(reply, commentID)); if (focusedReply < 0) return comment; const ordered = focusedReply === 0 ? replies : [replies[focusedReply], ...replies.slice(0, focusedReply), ...replies.slice(focusedReply + 1)]; return { ...comment, replies: ordered.map((reply) => prioritizeCommentTree(reply, commentID)) }; }
function clock(value: number) { const safe = Math.max(0, Math.floor(value || 0)); const minutes = Math.floor(safe / 60); const seconds = safe % 60; return `${minutes}:${seconds.toString().padStart(2, '0')}`; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, playerShell: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: colors.black, zIndex: 2 }, playerFullscreen: { position: 'absolute', inset: 0, width: 'auto', height: 'auto', aspectRatio: undefined, zIndex: 100 }, fullscreenPartyChat: { position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 140, width: '36%', minWidth: 280, maxWidth: 390, paddingHorizontal: 8, backgroundColor: 'rgba(0,0,0,.34)', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,.16)' }, fullscreenPartyChatOpen: { position: 'absolute', right: 12, zIndex: 140, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,30,34,.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' }, fullscreenPartyChatBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright }, fullscreenPartyChatBadgeText: { color: colors.white, fontSize: 8, fontWeight: '900' }, playerLoading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }, buffering: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 3 }, bufferingDisc: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.62)' }, playerError: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 24, textAlign: 'center' }, seekFeedback: { position: 'absolute', top: '31%', zIndex: 5, minWidth: 102, alignItems: 'center', gap: 5, paddingVertical: 14, borderRadius: 52, backgroundColor: 'rgba(0,0,0,.58)' }, seekFeedbackBack: { left: '13%' }, seekFeedbackForward: { right: '13%' }, seekFeedbackText: { color: colors.white, fontSize: 10, fontWeight: '800' }, playerChrome: { position: 'absolute', inset: 0, zIndex: 4, alignItems: 'center' }, swipeHandle: { position: 'absolute', top: 8, width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.7)' }, close: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.68)' }, centerPlay: { position: 'absolute', top: '40%', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.56)' }, compactControls: { position: 'absolute', left: 8, right: 8, bottom: 7, height: 43, borderRadius: 12, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,.68)' }, controlButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, controlTime: { color: colors.white, fontSize: 9, fontWeight: '700', marginLeft: 1 }, controlSpacer: { flex: 1 }, playerProgress: { position: 'absolute', left: 13, right: 13, bottom: 38, height: 24, justifyContent: 'center', zIndex: 5 }, playerProgressTrack: { height: 7, overflow: 'hidden', borderRadius: 4, backgroundColor: 'rgba(255,255,255,.34)' }, playerProgressFill: { height: '100%', backgroundColor: colors.accentBright }, playerProgressThumb: { position: 'absolute', width: 15, height: 15, marginLeft: -7.5, borderRadius: 8, backgroundColor: colors.accentBright, borderWidth: 2, borderColor: colors.white }, skipIntro: { position: 'absolute', right: 14, bottom: 69, height: 39, borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(255,255,255,.45)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,.76)' }, skipIntroText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  introOverlay: { position: 'absolute', inset: 0, zIndex: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.black },
  introSkip: { position: 'absolute', right: 14, bottom: 18, height: 39, borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(255,255,255,.45)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,.76)' }, loader: { flex: 1 }, content: { paddingTop: 20, paddingBottom: 20 }, title: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -.6, paddingHorizontal: 20 }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9, paddingHorizontal: 20 }, meta: { color: colors.textMuted, fontSize: 13 }, offlineBadge: { height: 24, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: 'rgba(34,197,94,.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,.28)' }, offlineBadgeText: { color: colors.success, fontSize: 9, fontWeight: '900' }, hdrBadge: { height: 18, justifyContent: 'center', paddingHorizontal: 5, marginLeft: 6, borderRadius: 4, backgroundColor: '#f5c518' }, hdrBadgeText: { color: '#111', fontSize: 9, fontWeight: '900', letterSpacing: .4 },
  actions: { gap: 9, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 3 }, action: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }, actionActive: { borderColor: 'rgba(239,68,68,.42)', backgroundColor: 'rgba(127,29,29,.18)' }, actionText: { color: colors.text, fontSize: 12, fontWeight: '800' }, actionTextActive: { color: colors.accentBright }, downloadStatus: { marginHorizontal: 20, marginTop: 10 }, downloadStatusText: { color: colors.textMuted, fontSize: 11 }, progressTrack: { height: 3, overflow: 'hidden', borderRadius: 2, backgroundColor: colors.surfaceStrong, marginTop: 7 }, progressFill: { height: '100%', backgroundColor: colors.accentBright },
  channelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, channelLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceStrong }, channelCopy: { flex: 1, marginLeft: 12 }, channelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, channel: { color: colors.text, fontSize: 15, fontWeight: '800' }, channelHint: { color: colors.textDim, fontSize: 11, marginTop: 4 }, channelSubscribe: { minWidth: 88, height: 38, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }, channelSubscribed: { backgroundColor: colors.surfaceStrong }, channelSubscribeText: { color: colors.black, fontSize: 11, fontWeight: '900' }, channelSubscribedText: { color: colors.text }, descriptionCard: { marginTop: 20, marginHorizontal: 20, padding: 16, borderRadius: radii.lg, backgroundColor: colors.surface }, description: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, descriptionToggle: { color: colors.text, fontSize: 11, fontWeight: '900', marginTop: 10 }, sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, paddingHorizontal: 20 }, commentCount: { color: colors.textMuted, fontSize: 13 }, composer: { flexDirection: 'row', alignItems: 'flex-end', margin: 20, marginTop: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 13 }, commentInput: { flex: 1, minHeight: 48, maxHeight: 110, color: colors.text, fontSize: 14, paddingVertical: 13 }, gifButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, gifButtonText: { color: colors.gilid, fontSize: 10, fontWeight: '900', letterSpacing: .5 }, send: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, signInComments: { margin: 20, marginTop: 14, padding: 15, borderRadius: radii.lg, backgroundColor: colors.surface }, signInCommentsText: { color: colors.gilid, textAlign: 'center', fontSize: 13, fontWeight: '800' }, noComments: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 20, paddingVertical: 18 }, comment: { flexDirection: 'row', gap: 11, marginHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, commentFocused: { marginTop: 6, marginBottom: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.accentBright, borderRadius: radii.lg, backgroundColor: 'rgba(127,29,29,.24)' }, replyComment: { marginHorizontal: 0, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: colors.borderStrong }, commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceStrong }, commentBody: { flex: 1, minWidth: 0 }, commentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, commentAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }, commentAuthor: { color: colors.text, fontSize: 12, fontWeight: '800', flexShrink: 1 }, commentDate: { color: colors.textDim, fontSize: 9 }, commentText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 6 }, commentGIF: { width: '100%', maxWidth: 300, aspectRatio: 1.35, marginTop: 9, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, commentActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }, commentAction: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5 }, commentActionText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, replyComposer: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 9, borderRadius: radii.md, backgroundColor: colors.surfaceStrong, paddingLeft: 10 }, replyInput: { flex: 1, minHeight: 42, maxHeight: 90, color: colors.text, fontSize: 12, paddingVertical: 10 }, replySend: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, repliesToggle: { alignSelf: 'flex-start', height: 34, marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 }, repliesToggleText: { color: colors.gilid, fontSize: 10, fontWeight: '900' }, replies: { marginTop: 3 }, related: { marginTop: 6, marginHorizontal: -20 },
  explicitGate: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,.92)' }, explicitBadge: { borderRadius: 6, borderWidth: 1, borderColor: 'rgba(248,113,113,.7)', backgroundColor: 'rgba(127,29,29,.8)', paddingHorizontal: 8, paddingVertical: 2 }, explicitBadgeText: { color: '#fee2e2', fontSize: 12, fontWeight: '900' }, explicitTitle: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 2 }, explicitBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 320 }, explicitButtons: { flexDirection: 'row', gap: 10, marginTop: 8 }, explicitBack: { height: 36, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,.12)' }, explicitBackText: { color: colors.white, fontSize: 13, fontWeight: '700' }, explicitContinue: { height: 36, justifyContent: 'center', paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.white }, explicitContinueText: { color: colors.black, fontSize: 13, fontWeight: '800' },
  descriptionLink: { color: '#60a5fa', textDecorationLine: 'underline' }, menuItem: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 13 }, menuIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, menuCopy: { flex: 1 }, menuTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, menuSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 3 }, menuSection: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 18, marginBottom: 7 }, noPlaylists: { color: colors.textMuted, fontSize: 12, lineHeight: 18, paddingBottom: 10 },
  contextCard: { marginHorizontal: 20, marginTop: 18, borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, contextHeading: { flexDirection: 'row', alignItems: 'center', padding: 16 }, contextCopy: { flex: 1 }, contextKicker: { color: colors.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, contextTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 5 }, contextMeta: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5 }, episodeRail: { paddingHorizontal: 14, paddingBottom: 15, gap: 10 }, watchEpisode: { width: 130, borderRadius: radii.md, overflow: 'hidden', opacity: .72 }, watchEpisodeActive: { opacity: 1, borderWidth: 1, borderColor: colors.accentBright }, watchThumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surfaceStrong }, watchEpisodeTitle: { color: colors.text, fontSize: 10, fontWeight: '700', padding: 8 }, movieContext: { marginHorizontal: 20, marginTop: 18, padding: 13, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 13 }, moviePoster: { width: 55, height: 82, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, trailerCard: { marginHorizontal: 20, marginTop: 18, padding: 13, borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(239,68,68,.34)', backgroundColor: colors.surface, flexDirection: 'row', gap: 14 }, trailerPoster: { width: 86, aspectRatio: 2 / 3, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, trailerCopy: { flex: 1, minWidth: 0, paddingVertical: 3 }, trailerButton: { alignSelf: 'flex-start', height: 36, marginTop: 12, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 7 }, trailerButtonText: { color: colors.white, fontSize: 11, fontWeight: '900' }, nextEpisode: { marginHorizontal: 20, marginTop: 12, padding: 15, borderRadius: radii.lg, backgroundColor: 'rgba(127,29,29,.16)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, nextKicker: { color: colors.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, nextTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 5, maxWidth: 280 },
});
