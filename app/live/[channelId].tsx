import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { useEvent } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { LiveChat } from '@/live/LiveChat';
import { useI18n } from '@/i18n';
import { usePlayer } from '@/player/PlayerProvider';
import { colors, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

export default function LiveScreen() {
  const { channelId = '' } = useLocalSearchParams<{ channelId: string }>();
  const insets = useSafeAreaInsets();
  const { t, dateTime } = useI18n();
  const window = useWindowDimensions();
  const { status: authStatus } = useAuth();
  const { activeChannel, activeChannelID } = useActiveChannel();
  const { player, liveStream: activeLiveStream, mode, quality, liveQualityOptions, isLoading: playerLoading, playLive, switchQuality, expand, minimize } = usePlayer();
  const [error, setError] = useState('');
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [fullscreenChatVisible, setFullscreenChatVisible] = useState(true);
	const [qualityOpen, setQualityOpen] = useState(false);
  const [chromeInteractive, setChromeInteractive] = useState(true);
  const chromeOpacity = useSharedValue(1);
  const [countdownNow, setCountdownNow] = useState<number | null>(null);
  const [viewerID] = useState(() => Crypto.randomUUID());
  const liveQuery = useQuery({ queryKey: ['live-stream', channelId], queryFn: () => giltubeAPI.liveStream(channelId), enabled: !!channelId, refetchInterval: 2_000 });
  const statusChange = useEvent(player, 'statusChange', { status: player.status });
  const playingChange = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: player.currentTime, bufferedPosition: 0, currentLiveTimestamp: null, currentOffsetFromLive: null });
  const live = liveQuery.data;
  const isLive = !!live && (live.is_live || live.status === 'live');
  const pollQuery = useQuery({ queryKey: ['live-poll', channelId, activeChannelID], queryFn: () => giltubeAPI.livePoll(channelId, activeChannelID), enabled: !!channelId, refetchInterval: isLive ? 2_500 : 5_000 });
  const showingPlayer = activeLiveStream?.channel_id === channelId && mode === 'expanded';
  const isFullscreen = showingPlayer && window.width > window.height;
  const offsetFromLive = Math.abs(timeUpdate?.currentOffsetFromLive ?? player.currentOffsetFromLive ?? 0);
  const atLiveEdge = offsetFromLive < 8;
  const revealPlayerChrome = useCallback(() => {
    setChromeInteractive(true);
    chromeOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withDelay(2_600, withTiming(0, { duration: 420 }, (finished) => {
        if (finished) runOnJS(setChromeInteractive)(false);
      })),
    );
  }, [chromeOpacity]);
  const chromeMotion = useAnimatedStyle(() => ({ opacity: chromeOpacity.value }));
  const scheduledCountdown = (() => {
    if (isLive || !live?.scheduled_for || countdownNow === null) return '';
    const scheduledAt = new Date(live.scheduled_for).getTime();
    if (!Number.isFinite(scheduledAt)) return '';
    const totalSeconds = Math.max(0, Math.ceil((scheduledAt - countdownNow) / 1000));
    if (totalSeconds === 0) return t('Starting soon');
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(t(hours === 1 ? '{count} hour' : '{count} hours', { count: hours }));
    if (minutes > 0 || hours > 0) parts.push(t(minutes === 1 ? '{count} minute' : '{count} minutes', { count: minutes }));
    parts.push(t(seconds === 1 ? '{count} second' : '{count} seconds', { count: seconds }));
    return t('Starts in {countdown}', { countdown: parts.join(' ') });
  })();

  useEffect(() => {
    if (!live || !isLive) {
      if (activeLiveStream?.channel_id === channelId) player.pause();
      return;
    }
    if (activeLiveStream?.channel_id === channelId) {
      const activePlaybackURL = activeLiveStream.playback_url_public || activeLiveStream.playback_url || '';
      const nextPlaybackURL = live.playback_url_public || live.playback_url || '';
      if (activePlaybackURL !== nextPlaybackURL) {
        void playLive(live).then(() => setError('')).catch((reason) => setError(reason instanceof Error ? reason.message : t('Unable to play this live stream.')));
        return;
      }
      if (mode !== 'expanded') expand();
      return;
    }
    void playLive(live).then(() => setError('')).catch((reason) => setError(reason instanceof Error ? reason.message : t('Unable to play this live stream.')));
  }, [activeLiveStream?.channel_id, activeLiveStream?.playback_url, activeLiveStream?.playback_url_public, channelId, expand, isLive, live, mode, playLive, player, t]);

  useEffect(() => {
    const streamID = live?.id || channelId;
    if (!isLive || !streamID) return;
    const heartbeat = () => void giltubeAPI.joinLivePresence(streamID, {
      viewerID,
      name: activeChannel?.name || '',
      avatarURL: activeChannel?.avatar_url || '',
      anonymous: authStatus !== 'signedIn' || !activeChannel,
    }).catch(() => undefined);
    heartbeat();
    const timer = setInterval(heartbeat, 45_000);
    return () => {
      clearInterval(timer);
      void giltubeAPI.leaveLivePresence(streamID, viewerID).catch(() => undefined);
    };
  }, [activeChannel, authStatus, channelId, isLive, live?.id, viewerID]);

  useEffect(() => {
    void (isLive && showingPlayer ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP));
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); };
  }, [isLive, showingPlayer]);

  useEffect(() => {
    if (isLive || !live?.scheduled_for) return;
    const initialTick = setTimeout(() => setCountdownNow(Date.now()), 0);
    const timer = setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, [isLive, live?.scheduled_for]);

  useEffect(() => {
    if (!showingPlayer || !isLive) {
      cancelAnimation(chromeOpacity);
      chromeOpacity.value = 1;
      setChromeInteractive(true);
      return;
    }
    const timer = setTimeout(revealPlayerChrome, 0);
    return () => {
      clearTimeout(timer);
      cancelAnimation(chromeOpacity);
    };
  }, [chromeOpacity, isLive, revealPlayerChrome, showingPlayer]);

  const toggleFullscreen = () => {
    revealPlayerChrome();
    void ScreenOrientation.lockAsync(isFullscreen ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE);
  };
  const togglePlayback = () => {
    if (playingChange?.isPlaying) player.pause(); else player.play();
    revealPlayerChrome();
  };
  const goLive = () => {
    const duration = player.duration;
    if (Number.isFinite(duration) && duration > 0) player.currentTime = Math.max(0, duration - 0.1);
    player.play();
    revealPlayerChrome();
  };
  const close = () => {
    if (isFullscreen) { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); return; }
    minimize();
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
  };
  const share = () => void Share.share({ title: live?.title || 'GilTube Live', message: `${live?.title || t('Watch live on GilTube')}\nhttps://giltube.gilservers.com/live/${channelId}`, url: `https://giltube.gilservers.com/live/${channelId}` });

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <StatusBar hidden={isFullscreen} />
    <View style={[styles.player, isFullscreen ? styles.playerFullscreen : { marginTop: insets.top }]}>
      {showingPlayer ? <VideoView player={player} onTouchStart={revealPlayerChrome} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} allowsPictureInPicture startsPictureInPictureAutomatically contentFit="contain" surfaceType="textureView" /> : <Image source={resolveMediaURL(live?.thumbnail_url || live?.channel?.avatar_url)} style={[StyleSheet.absoluteFill, !isLive && styles.offlineThumbnail]} contentFit="cover" />}
      {(liveQuery.isLoading || playerLoading || statusChange?.status === 'loading') && <View style={styles.playerLoading}><ActivityIndicator color={colors.white} size="large" /></View>}
      {!!error && <View style={styles.playerLoading}><Ionicons name="alert-circle-outline" size={28} color={colors.accentBright} /><Text style={styles.errorText}>{error}</Text></View>}
	  {!liveQuery.isLoading && !isLive && <View style={[styles.playerLoading, (!!live?.scheduled_for || live?.waiting_for_publisher) && styles.scheduledOverlay]}><Ionicons name={live?.waiting_for_publisher ? 'time-outline' : live?.scheduled_for ? 'calendar-outline' : 'radio-outline'} size={32} color={colors.textMuted} /><Text style={styles.offlineTitle}>{t(live?.waiting_for_publisher ? 'Stream will start shortly…' : live?.scheduled_for ? 'Upcoming live stream' : 'Stream offline')}</Text>{!live?.waiting_for_publisher && <Text style={styles.offlineText}>{live?.scheduled_for ? `${t('Scheduled for')} ${dateTime(live.scheduled_for)}` : t('This page will reconnect automatically when the channel goes live.')}</Text>}{!!scheduledCountdown && <Text style={styles.countdown}>{scheduledCountdown}</Text>}</View>}
      <Animated.View pointerEvents={chromeInteractive ? 'box-none' : 'none'} style={[styles.chrome, chromeMotion]}>
        <PressableScale accessibilityLabel={t('Minimize live stream')} onPress={close} style={styles.close}><Ionicons name={isFullscreen ? 'contract-outline' : 'chevron-down'} size={24} color={colors.white} /></PressableScale>
        {isLive && <PressableScale onPress={togglePlayback} style={styles.play}><Ionicons name={playingChange?.isPlaying ? 'pause' : 'play'} size={28} color={colors.white} /></PressableScale>}
		{isLive && <View style={styles.controls}><View style={styles.liveBadge}><View style={[styles.liveDot, !atLiveEdge && styles.liveDotBehind]} /><Text style={styles.liveText}>{atLiveEdge ? t('LIVE') : `${Math.round(offsetFromLive)} ${t('seconds behind')}`}</Text></View>{!atLiveEdge && <PressableScale onPress={goLive} style={styles.goLive}><Text style={styles.goLiveText}>{t('Go live')}</Text></PressableScale>}<View style={{ flex: 1 }} />{liveQualityOptions.length > 1 && <PressableScale accessibilityLabel={t('Playback quality')} onPress={() => { revealPlayerChrome(); setQualityOpen(true); }} style={styles.controlButton}><Ionicons name="settings-outline" size={20} color={colors.white} /></PressableScale>}<PressableScale accessibilityLabel={t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')} onPress={toggleFullscreen} style={styles.controlButton}><Ionicons name={isFullscreen ? 'contract-outline' : 'scan-outline'} size={21} color={colors.white} /></PressableScale></View>}
      </Animated.View>
    </View>

    {isFullscreen && isLive && fullscreenChatVisible && <View style={[styles.fullscreenChat, { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) }]}><LiveChat channelID={channelId} live overlay onHide={() => setFullscreenChatVisible(false)} /></View>}
    {isFullscreen && isLive && !fullscreenChatVisible && (pollQuery.data?.status === 'active' ? <PressableScale accessibilityLabel={t('Open active poll')} onPress={() => setFullscreenChatVisible(true)} style={[styles.fullscreenPollAlert, { top: Math.max(insets.top, 8) + 50 }]}><Ionicons name="stats-chart" size={17} color={colors.white} /><Text numberOfLines={1} style={styles.fullscreenPollAlertText}>{t('Poll active')}</Text></PressableScale> : <PressableScale accessibilityLabel={t('Show live chat')} onPress={() => setFullscreenChatVisible(true)} style={[styles.fullscreenChatOpen, { top: Math.max(insets.top, 8) + 50 }]}><Ionicons name="chatbubbles" size={21} color={colors.white} /></PressableScale>)}

    {!isFullscreen && <View style={styles.body}>
      <ScrollView contentContainerStyle={{ paddingTop: 62, paddingBottom: insets.bottom + 34 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.details}>
		<View style={styles.liveHeading}><View style={styles.livePageBadge}><View style={styles.liveDot} /><Text style={styles.livePageBadgeText}>{t(isLive ? 'LIVE NOW' : live?.waiting_for_publisher ? 'STARTING SOON' : live?.scheduled_for ? 'UPCOMING' : 'OFFLINE')}</Text></View><Text style={styles.title}>{live?.title || 'GilTube Live'}</Text></View>
		{!!live?.scheduled_for && !isLive && <Text style={styles.started}>{t('Scheduled for')} {dateTime(live.scheduled_for)}</Text>}
		{!!live?.waiting_for_publisher && !isLive && <Text style={styles.detailsCountdown}>{t('Stream will start shortly…')}</Text>}
        {!!live?.started_at && isLive && <Text style={styles.started}>{t('Started')} {dateTime(live.started_at)}</Text>}
        <View style={styles.actions}><PressableScale onPress={() => router.push({ pathname: '/channel/[id]', params: { id: channelId } })} style={styles.channelLink}><Image source={resolveMediaURL(live?.channel?.avatar_url)} style={styles.avatar} contentFit="cover" /><View style={styles.channelCopy}><View style={styles.channelNameRow}><Text numberOfLines={1} style={styles.channelName}>{live?.channel?.name || 'GilTube'}</Text><VerifiedBadge verified={live?.channel?.verified} size={15} /></View><Text style={styles.channelHint}>{t('View channel')}</Text></View></PressableScale><PressableScale accessibilityLabel={t('Share live stream')} onPress={share} style={styles.share}><Ionicons name="share-outline" size={20} color={colors.text} /></PressableScale></View>
        {!!live?.description && <Text style={styles.description}>{live.description}</Text>}
        </View>
      </ScrollView>
      {!chatDrawerOpen && (pollQuery.data?.status === 'active' ? <PressableScale accessibilityLabel={t('Open active poll')} onPress={() => setChatDrawerOpen(true)} style={styles.pollAlert}><View style={styles.pollAlertIcon}><Ionicons name="stats-chart" size={17} color={colors.white} /></View><View style={styles.chatLauncherCopy}><Text style={styles.pollAlertTitle}>{t('Poll active')}</Text><Text numberOfLines={1} style={styles.pollAlertQuestion}>{pollQuery.data.question}</Text></View><Ionicons name="chevron-up" size={20} color={colors.textMuted} /></PressableScale> : <PressableScale accessibilityLabel={t('Show live chat')} onPress={() => setChatDrawerOpen(true)} style={styles.chatLauncher}><View style={styles.chatLauncherIcon}><Ionicons name="chatbubbles" size={17} color={colors.accentBright} /></View><View style={styles.chatLauncherCopy}><Text style={styles.chatLauncherTitle}>{t('Live chat')}</Text><Text style={styles.chatLauncherSubtitle}>{t(isLive ? 'Chat updates automatically' : 'Stream is offline')}</Text></View><Ionicons name="chevron-up" size={20} color={colors.textMuted} /></PressableScale>)}
      {chatDrawerOpen && <View style={[styles.chatDrawer, { paddingBottom: insets.bottom }]}><LiveChat channelID={channelId} live={isLive} overlay hideIcon="close" onHide={() => setChatDrawerOpen(false)} /></View>}
    </View>}
	<SwipeSheet visible={qualityOpen} title={t('Playback quality')} onClose={() => setQualityOpen(false)}>
	  <PressableScale onPress={() => { setQualityOpen(false); void switchQuality(null, 'Auto'); }} style={styles.qualityOption}><View style={styles.qualityOptionIcon}><Ionicons name={quality === 'Auto' ? 'checkmark-circle' : 'hardware-chip-outline'} size={21} color={quality === 'Auto' ? colors.accentBright : colors.text} /></View><View><Text style={styles.qualityOptionTitle}>{t('Auto')}</Text><Text style={styles.qualityOptionSubtitle}>{t('Tests your connection, then locks the best quality')}</Text></View></PressableScale>
	  {liveQualityOptions.map((option) => <PressableScale key={option.url} onPress={() => { setQualityOpen(false); void switchQuality(option.url, option.label); }} style={styles.qualityOption}><View style={styles.qualityOptionIcon}><Ionicons name={quality === option.label ? 'checkmark-circle' : 'radio-button-off'} size={21} color={quality === option.label ? colors.accentBright : colors.text} /></View><Text style={styles.qualityOptionTitle}>{option.label}</Text></PressableScale>)}
	</SwipeSheet>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, player: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', zIndex: 2, backgroundColor: colors.black }, playerFullscreen: { position: 'absolute', inset: 0, zIndex: 100, width: 'auto', height: 'auto', aspectRatio: undefined }, offlineThumbnail: { opacity: .4 }, playerLoading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 28, backgroundColor: 'rgba(0,0,0,.44)' }, scheduledOverlay: { backgroundColor: 'rgba(0,0,0,.22)' }, errorText: { color: colors.text, fontSize: 12, textAlign: 'center' }, offlineTitle: { color: colors.text, fontSize: 17, fontWeight: '900' }, offlineText: { maxWidth: 320, color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' }, countdown: { color: colors.white, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  chrome: { position: 'absolute', inset: 0, zIndex: 4 }, close: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.68)' }, play: { position: 'absolute', alignSelf: 'center', top: '38%', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.58)' }, controls: { position: 'absolute', left: 9, right: 9, bottom: 8, height: 44, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,.72)' }, liveBadge: { height: 27, paddingHorizontal: 9, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(127,29,29,.44)' }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentBright }, liveDotBehind: { backgroundColor: colors.textMuted }, liveText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: .5 }, goLive: { height: 30, paddingHorizontal: 11, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, goLiveText: { color: colors.white, fontSize: 9, fontWeight: '900' }, controlButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  fullscreenChat: { position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 140, width: '36%', minWidth: 280, maxWidth: 390, paddingHorizontal: 8, backgroundColor: 'rgba(0,0,0,.34)', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,.16)' }, fullscreenChatOpen: { position: 'absolute', right: 12, zIndex: 140, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,30,34,.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' }, fullscreenPollAlert: { position: 'absolute', right: 12, zIndex: 140, maxWidth: 155, height: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 21, backgroundColor: 'rgba(220,38,38,.94)' }, fullscreenPollAlertText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  body: { flex: 1, position: 'relative' }, chatLauncher: { position: 'absolute', top: 8, left: 12, right: 12, zIndex: 5, height: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }, pollAlert: { position: 'absolute', top: 8, left: 12, right: 12, zIndex: 5, minHeight: 52, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,.45)', borderRadius: radii.md, backgroundColor: '#321315', flexDirection: 'row', alignItems: 'center' }, pollAlertIcon: { width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, pollAlertTitle: { color: colors.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: .7, textTransform: 'uppercase' }, pollAlertQuestion: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 2 }, chatLauncherIcon: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,.12)' }, chatLauncherCopy: { flex: 1, marginLeft: 9 }, chatLauncherTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, chatLauncherSubtitle: { color: colors.textMuted, fontSize: 9, marginTop: 1 }, chatDrawer: { position: 'absolute', inset: 0, zIndex: 20, paddingTop: 5, paddingHorizontal: 5, backgroundColor: colors.canvas },
  details: { padding: 18 }, liveHeading: { alignItems: 'flex-start' }, livePageBadge: { height: 25, paddingHorizontal: 9, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(127,29,29,.3)', borderWidth: 1, borderColor: 'rgba(239,68,68,.35)' }, livePageBadgeText: { color: colors.accentBright, fontSize: 8, fontWeight: '900', letterSpacing: .9 }, title: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -.5, marginTop: 10 }, started: { color: colors.textMuted, fontSize: 10, marginTop: 7 }, detailsCountdown: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 5 }, actions: { minHeight: 66, marginTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' }, channelLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceStrong }, channelCopy: { flex: 1, minWidth: 0, marginLeft: 10 }, channelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, channelName: { color: colors.text, fontSize: 14, fontWeight: '900', flexShrink: 1 }, channelHint: { color: colors.textMuted, fontSize: 9, marginTop: 3 }, share: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, description: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 16 },
	qualityOption: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, qualityOptionIcon: { width: 30, alignItems: 'center' }, qualityOptionTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, qualityOptionSubtitle: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
});
