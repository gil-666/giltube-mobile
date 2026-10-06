import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { router, usePathname } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVideoPlayer, VideoView } from 'expo-video';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { useDownloads } from '@/downloads/DownloadProvider';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { LiveStream, Video, WatchPartyEvent, WatchPartySnapshot } from '@/types/api';
import { useAppSettings } from '@/settings/AppSettingsProvider';
import { isLocalHLSManifest, loadHLSQualities, pinnedQualityManifest, probeHDRMaster, type QualityOption } from '@/utils/hls';
import { resolveMediaURL } from '@/utils/media';
import { canPlayHDR, deviceSupportsHDR } from '../../modules/giltube-hdr';
import { subscribeToWatchParty } from '@/watch-parties/events';

type PlayerMode = 'hidden' | 'expanded' | 'minimized';

// available: this title has an HDR ladder this device can present.
// playing: the HDR ladder is the loaded source.
export interface HDRState { available: boolean; playing: boolean }
const noHDR: HDRState = { available: false, playing: false };

// Picks master.m3u8 or its HDR sibling. Only HDR-capable devices probe, so
// everyone else starts playback without the extra request.
async function resolvePlaybackSource(masterURI: string, hdrEnabled: boolean): Promise<{ uri: string; hdrURI: string; hdr: HDRState }> {
  if (masterURI.startsWith('file:') || !deviceSupportsHDR()) return { uri: masterURI, hdrURI: '', hdr: noHDR };
  const probe = await probeHDRMaster(masterURI);
  if (!probe || !canPlayHDR(probe.videoRange)) return { uri: masterURI, hdrURI: '', hdr: noHDR };
  return { uri: hdrEnabled ? probe.url : masterURI, hdrURI: probe.url, hdr: { available: true, playing: hdrEnabled } };
}

interface PlayerContextValue {
  player: ReturnType<typeof useVideoPlayer>;
  video: Video | null;
  liveStream: LiveStream | null;
  mode: PlayerMode;
  quality: string;
  liveQualityOptions: QualityOption[];
  isLoading: boolean;
  // The master playlist actually loaded (master-hdr.m3u8 while HDR plays).
  playbackMasterURL: string;
  hdr: HDRState;
  setHDREnabled: (enabled: boolean) => Promise<void>;
  watchParty: WatchPartySnapshot | null;
  watchPartyEvent: { event: WatchPartyEvent; nonce: number } | null;
  // shouldAutoplay is evaluated once the source has loaded, so a caller (the
  // playback intro) can hold the video paused while it buffers.
  play: (video: Video, sourceUri?: string, options?: { shouldAutoplay?: () => boolean }) => Promise<void>;
  playLive: (stream: LiveStream) => Promise<void>;
  switchQuality: (sourceUri: string | null, label: string) => Promise<void>;
  joinWatchParty: (partyID: string) => Promise<WatchPartySnapshot>;
  refreshWatchParty: () => Promise<WatchPartySnapshot | null>;
  sendWatchPartyPlayback: (action: 'play' | 'pause' | 'seek', seconds?: number) => Promise<void>;
  leaveWatchParty: () => Promise<void>;
  minimize: () => void;
  expand: () => void;
  dismiss: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function isWatchPartyEndedError(error: unknown) {
  return error instanceof Error && error.name === 'WatchPartyEndedError';
}

function watchPartyEndedError() {
  const error = new Error('Watch party has ended.');
  error.name = 'WatchPartyEndedError';
  return error;
}

export function PlayerProvider({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { account, status: authStatus } = useAuth();
  const { activeChannelID } = useActiveChannel();
  const { getDownload } = useDownloads();
  const { settings, update: updateSettings } = useAppSettings();
  const [video, setVideo] = useState<Video | null>(null);
  const [liveStream, setLiveStream] = useState<LiveStream | null>(null);
  const [mode, setMode] = useState<PlayerMode>('hidden');
  const [quality, setQuality] = useState('Auto');
  const [liveQualityOptions, setLiveQualityOptions] = useState<QualityOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackMasterURL, setPlaybackMasterURL] = useState('');
  const [hdr, setHDR] = useState<HDRState>(noHDR);
  const hdrRef = useRef<HDRState>(noHDR);
  const sdrMasterRef = useRef('');
  const hdrMasterRef = useRef('');
  const hdrEnabledRef = useRef(settings.hdrEnabled);
  const [watchParty, setWatchParty] = useState<WatchPartySnapshot | null>(null);
  const [watchPartyEvent, setWatchPartyEvent] = useState<{ event: WatchPartyEvent; nonce: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null);
  const sourceRef = useRef('');
  const liveMasterSourceRef = useRef('');
  const liveQualityLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationRef = useRef(0);
  const replaceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const videoRef = useRef<Video | null>(null);
  const modeRef = useRef<PlayerMode>('hidden');
  const watchPartyRef = useRef<WatchPartySnapshot | null>(null);
  const pathnameRef = useRef(pathname);
  const endedPartyIDsRef = useRef(new Set<string>());
  const closingPartyIDsRef = useRef(new Set<string>());
  const partyRouteClosePendingRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemoteRef = useRef(false);
  const restoredUserRef = useRef('');
  const hiddenSubtitleRef = useRef<ReturnType<typeof useVideoPlayer>['subtitleTrack']>(null);
  const player = useVideoPlayer(null, (instance) => {
    instance.showNowPlayingNotification = true;
    instance.staysActiveInBackground = true;
    instance.timeUpdateEventInterval = 0.25;
    instance.bufferOptions = {
      preferredForwardBufferDuration: 60,
      minBufferForPlayback: 3,
      maxBufferBytes: 128 * 1024 * 1024,
      prioritizeTimeOverSizeThreshold: true,
      waitsToMinimizeStalling: true,
    };
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const liveVideoTrackChange = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });
  const currentLiveVideoTrackRef = useRef(player.videoTrack);

  useEffect(() => { videoRef.current = video; }, [video]);
  useEffect(() => { hdrEnabledRef.current = settings.hdrEnabled; }, [settings.hdrEnabled]);
  const applyHDR = useCallback((next: HDRState) => { hdrRef.current = next; setHDR(next); }, []);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { watchPartyRef.current = watchParty; }, [watchParty]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { currentLiveVideoTrackRef.current = liveVideoTrackChange?.videoTrack || player.videoTrack; }, [liveVideoTrackChange?.videoTrack, player]);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (liveQualityLockTimerRef.current) clearTimeout(liveQualityLockTimerRef.current);
  }, []);

  const replacePlayerSource = useCallback((source: Parameters<typeof player.replaceAsync>[0]) => {
    const task = replaceQueueRef.current.catch(() => undefined).then(() => player.replaceAsync(source));
    replaceQueueRef.current = task.catch(() => undefined);
    return task;
  }, [player]);

  const scheduleLiveQualityLock = useCallback((operation: number, stream: LiveStream, options: QualityOption[]) => {
    if (liveQualityLockTimerRef.current) clearTimeout(liveQualityLockTimerRef.current);
    if (options.length < 2) return;
    let remainingTrackChecks = 6;
    const lockSelectedTrack = () => {
      liveQualityLockTimerRef.current = null;
      if (operation !== operationRef.current) return;
      const selectedTrack = currentLiveVideoTrackRef.current || player.videoTrack;
      const selectedHeight = selectedTrack?.size ? Math.min(selectedTrack.size.width, selectedTrack.size.height) : 0;
      const selectedURL = selectedTrack?.url || '';
      const selected = options.find((option) => option.url === selectedURL)
        || options.find((option) => option.height === selectedHeight);
      if (!selected) {
        remainingTrackChecks -= 1;
        if (remainingTrackChecks > 0) liveQualityLockTimerRef.current = setTimeout(lockSelectedTrack, 1_000);
        return;
      }
      setIsLoading(true);
      void replacePlayerSource({
        uri: selected.url,
        contentType: 'hls',
        metadata: {
          title: stream.title || 'GilTube Live',
          artist: stream.channel?.name || 'GilTube',
          artwork: resolveMediaURL(stream.thumbnail_url || stream.channel?.avatar_url),
        },
      }).then(() => {
        if (operation !== operationRef.current) return;
        sourceRef.current = selected.url;
        setQuality(selected.label);
        setIsLoading(false);
        player.play();
      }).catch(() => {
        if (operation === operationRef.current) setIsLoading(false);
      });
    };
    liveQualityLockTimerRef.current = setTimeout(lockSelectedTrack, 6_000);
  }, [player, replacePlayerSource]);

  const loadVideo = useCallback(async (nextVideo: Video, sourceUri: string | undefined, nextMode: PlayerMode, autoplay: boolean | (() => boolean)) => {
    const operation = ++operationRef.current;
    const offline = getDownload(nextVideo.id);
    const masterURI = sourceUri || offline?.fileUri || resolveMediaURL(nextVideo.hls_path);
    if (!masterURI) throw new Error('This video does not have a playable source.');

    sourceRef.current = masterURI;
    sdrMasterRef.current = masterURI;
    hdrMasterRef.current = '';
    applyHDR(noHDR);
    setPlaybackMasterURL(masterURI);
	if (liveQualityLockTimerRef.current) clearTimeout(liveQualityLockTimerRef.current);
	liveMasterSourceRef.current = '';
	setLiveQualityOptions([]);
    setQuality('Auto');
    setIsLoading(true);
    setLiveStream(null);
    setVideo(nextVideo);
    setMode(nextMode);
    player.muted = false;
    player.showNowPlayingNotification = true;
    player.staysActiveInBackground = true;
    player.bufferOptions = {
      preferredForwardBufferDuration: 60,
      minBufferForPlayback: 3,
      maxBufferBytes: 128 * 1024 * 1024,
      prioritizeTimeOverSizeThreshold: true,
      waitsToMinimizeStalling: true,
    };
    const resolved = await resolvePlaybackSource(masterURI, hdrEnabledRef.current);
    if (operation !== operationRef.current) return;
    const uri = resolved.uri;
    sourceRef.current = uri;
    hdrMasterRef.current = resolved.hdrURI;
    applyHDR(resolved.hdr);
    setPlaybackMasterURL(uri);
    try {
      await replacePlayerSource({
        uri,
        contentType: uri.startsWith('file:') ? 'progressive' : 'hls',
        metadata: {
          title: nextVideo.title,
          artist: nextVideo.channel?.name || 'GilTube',
          artwork: resolveMediaURL(nextVideo.thumbnail_url),
        },
      });
    } catch (error) {
      if (operation === operationRef.current) setIsLoading(false);
      throw error;
    }
    if (operation !== operationRef.current) { player.pause(); return; }
    setIsLoading(false);
    const shouldPlay = typeof autoplay === 'function' ? autoplay() : autoplay;
    if (shouldPlay) player.play(); else player.pause();
  }, [applyHDR, getDownload, player, replacePlayerSource]);

  const play = useCallback(async (nextVideo: Video, sourceUri?: string, options?: { shouldAutoplay?: () => boolean }) => {
    if (watchPartyRef.current) throw new Error('Leave your active watch party before playing another video.');
    await loadVideo(nextVideo, sourceUri, 'expanded', options?.shouldAutoplay ?? true);
  }, [loadVideo]);

  const playLive = useCallback(async (stream: LiveStream) => {
    if (watchPartyRef.current) throw new Error('Leave your active watch party before opening a live stream.');
    const uri = resolveMediaURL(stream.playback_url_public || stream.playback_url);
    if (!uri) throw new Error('This live stream does not have a playable source.');
    const operation = ++operationRef.current;
    sourceRef.current = uri;
    sdrMasterRef.current = '';
    hdrMasterRef.current = '';
    applyHDR(noHDR);
    setPlaybackMasterURL(uri);
	liveMasterSourceRef.current = uri;
	if (liveQualityLockTimerRef.current) clearTimeout(liveQualityLockTimerRef.current);
	setLiveQualityOptions([]);
    setQuality('Auto');
    setIsLoading(true);
    setVideo(null);
    setLiveStream(stream);
    setMode('expanded');
    player.muted = false;
    player.showNowPlayingNotification = true;
    player.staysActiveInBackground = true;
    player.bufferOptions = {
      preferredForwardBufferDuration: 18,
      minBufferForPlayback: 2,
      maxBufferBytes: 48 * 1024 * 1024,
      prioritizeTimeOverSizeThreshold: true,
      waitsToMinimizeStalling: true,
    };
    try {
      await replacePlayerSource({
        uri,
        contentType: 'hls',
        metadata: {
          title: stream.title || 'GilTube Live',
          artist: stream.channel?.name || 'GilTube',
          artwork: resolveMediaURL(stream.thumbnail_url || stream.channel?.avatar_url),
        },
      });
    } catch (error) {
      if (operation === operationRef.current) setIsLoading(false);
      throw error;
    }
    if (operation !== operationRef.current) { player.pause(); return; }
    setIsLoading(false);
    player.play();
	const options = await loadHLSQualities(uri).catch(() => []);
	if (operation !== operationRef.current) return;
	setLiveQualityOptions(options);
	scheduleLiveQualityLock(operation, stream, options);
  }, [applyHDR, player, replacePlayerSource, scheduleLiveQualityLock]);

  const switchQuality = useCallback(async (sourceUri: string | null, label: string) => {
	if (liveStream) {
	  const uri = sourceUri || liveMasterSourceRef.current;
	  if (!uri) return;
	  const operation = ++operationRef.current;
	  if (liveQualityLockTimerRef.current) clearTimeout(liveQualityLockTimerRef.current);
	  setIsLoading(true);
	  try {
		await replacePlayerSource({ uri, contentType: 'hls', metadata: { title: liveStream.title || 'GilTube Live', artist: liveStream.channel?.name || 'GilTube', artwork: resolveMediaURL(liveStream.thumbnail_url || liveStream.channel?.avatar_url) } });
	  } catch (error) {
		if (operation === operationRef.current) setIsLoading(false);
		throw error;
	  }
	  if (operation !== operationRef.current) return;
	  sourceRef.current = uri;
	  setQuality(label);
	  setIsLoading(false);
	  player.play();
	  if (!sourceUri) {
		const options = await loadHLSQualities(uri).catch(() => []);
		if (operation !== operationRef.current) return;
		setLiveQualityOptions(options);
		scheduleLiveQualityLock(operation, liveStream, options);
	  }
	  return;
	}
	if (!video) return;
    const masterURI = sourceRef.current;
    if (!sourceUri && !masterURI) return;
    const operation = ++operationRef.current;
    setIsLoading(true);
    const position = player.currentTime;
    const wasPlaying = player.playing;
    try {
      // A bare variant playlist has no audio renditions; on Android pin the
      // quality through a one-variant copy of the master instead.
      const uri = sourceUri && Platform.OS === 'android' && masterURI.startsWith('http')
        ? await pinnedQualityManifest(masterURI, sourceUri)
        : sourceUri || masterURI;
      if (operation !== operationRef.current) return;
      await replacePlayerSource({ uri, contentType: uri.startsWith('file:') && !isLocalHLSManifest(uri) ? 'progressive' : 'hls', metadata: { title: video.title, artist: video.channel?.name || 'GilTube', artwork: resolveMediaURL(video.thumbnail_url) } });
    } catch (error) {
      if (operation === operationRef.current) setIsLoading(false);
      throw error;
    }
    if (operation !== operationRef.current) return;
    player.currentTime = position;
    setQuality(label);
    setIsLoading(false);
    if (wasPlaying) player.play();
  }, [liveStream, player, replacePlayerSource, scheduleLiveQualityLock, video]);

  // Swaps between master.m3u8 and master-hdr.m3u8 at the current position.
  const swapHDRSource = useCallback(async (playHDR: boolean) => {
    const current = videoRef.current;
    const uri = playHDR ? hdrMasterRef.current : sdrMasterRef.current;
    if (!current || !uri) return;
    const operation = ++operationRef.current;
    const position = player.currentTime;
    const wasPlaying = player.playing;
    setIsLoading(true);
    try {
      await replacePlayerSource({ uri, contentType: 'hls', metadata: { title: current.title, artist: current.channel?.name || 'GilTube', artwork: resolveMediaURL(current.thumbnail_url) } });
    } catch (error) {
      if (operation === operationRef.current) setIsLoading(false);
      throw error;
    }
    if (operation !== operationRef.current) return;
    sourceRef.current = uri;
    setPlaybackMasterURL(uri);
    setQuality('Auto');
    applyHDR({ available: !!hdrMasterRef.current, playing: playHDR });
    player.currentTime = position;
    setIsLoading(false);
    if (wasPlaying) player.play();
  }, [applyHDR, player, replacePlayerSource]);

  const setHDREnabled = useCallback(async (enabled: boolean) => {
    hdrEnabledRef.current = enabled;
    await updateSettings({ hdrEnabled: enabled });
    if (!hdrRef.current.available || hdrRef.current.playing === enabled) return;
    await swapHDRSource(enabled);
  }, [swapHDRSource, updateSettings]);

  // A decoder that rejects the HEVC HDR ladder must not strand playback:
  // drop back to SDR at the same position.
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status !== 'error' || !hdrRef.current.playing) return;
      hdrMasterRef.current = '';
      void swapHDRSource(false).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [player, swapHDRSource]);

  const minimize = useCallback(() => setMode((current) => current === 'hidden' ? current : 'minimized'), []);
  const expand = useCallback(() => setMode((current) => current === 'hidden' ? current : 'expanded'), []);
  const dismiss = useCallback(() => {
    operationRef.current += 1;
	if (liveQualityLockTimerRef.current) clearTimeout(liveQualityLockTimerRef.current);
    videoRef.current = null;
    modeRef.current = 'hidden';
    watchPartyRef.current = null;
    player.pause();
    player.muted = true;
    player.staysActiveInBackground = false;
    player.showNowPlayingNotification = false;
    setVideo(null);
    setLiveStream(null);
    setMode('hidden');
    setQuality('Auto');
	setLiveQualityOptions([]);
    setIsLoading(false);
    setWatchParty(null);
    setWatchPartyEvent(null);
    sourceRef.current = '';
	liveMasterSourceRef.current = '';
    sdrMasterRef.current = '';
    hdrMasterRef.current = '';
    applyHDR(noHDR);
    setPlaybackMasterURL('');
    applyingRemoteRef.current = false;
    void replacePlayerSource(null).catch(() => undefined);
  }, [applyHDR, player, replacePlayerSource]);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, nonce: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 3_500);
  }, []);

  const closeWatchPartyRoute = useCallback(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    const currentPath = pathnameRef.current;
    if ((!currentPath.startsWith('/video/') && !currentPath.startsWith('/watch-party/')) || partyRouteClosePendingRef.current) return;
    partyRouteClosePendingRef.current = true;
    setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      setTimeout(() => { partyRouteClosePendingRef.current = false; }, 300);
    }, 0);
  }, []);

  const handleWatchPartyEnded = useCallback((partyID: string) => {
    endedPartyIDsRef.current.add(partyID);
    closingPartyIDsRef.current.add(partyID);
    dismiss();
    closeWatchPartyRoute();
    showToast('Watch party ended');
  }, [closeWatchPartyRoute, dismiss, showToast]);

  const applyRemotePlayback = useCallback((action: 'play' | 'pause' | 'seek' | 'progress', seconds: number, state?: 'playing' | 'paused') => {
    if (!Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    const drift = Math.abs(player.currentTime - target);
    applyingRemoteRef.current = true;
    if (action === 'pause' || state === 'paused') {
      if (drift > 2) player.currentTime = target;
      player.pause();
    } else if (action === 'seek') {
      player.currentTime = target;
    } else if (drift > 2 || !player.playing) {
      player.currentTime = target;
      player.play();
    }
    setTimeout(() => { applyingRemoteRef.current = false; }, 700);
  }, [player]);

  const loadPartySnapshot = useCallback(async (snapshot: WatchPartySnapshot, nextMode: PlayerMode) => {
    const partyID = snapshot.party.id;
    if (snapshot.party.status === 'ended' || endedPartyIDsRef.current.has(partyID)) {
      handleWatchPartyEnded(partyID);
      return;
    }
    if (closingPartyIDsRef.current.has(partyID)) return;
    const partyVideo: Video = {
      ...snapshot.video,
      title: snapshot.video.display_title || snapshot.video.title,
      views: snapshot.video.views || 0,
      created_at: snapshot.video.created_at || snapshot.party.created_at,
      channel: snapshot.video.channel || { id: snapshot.video.channel_id, name: snapshot.video.channel_name || 'GilTube' },
    };
    setWatchParty(snapshot);
    if (videoRef.current?.id !== partyVideo.id || !sourceRef.current) {
      await loadVideo(partyVideo, resolveMediaURL(partyVideo.hls_path), nextMode, false);
    } else {
      setVideo(partyVideo);
      setMode(nextMode);
    }
    if (endedPartyIDsRef.current.has(partyID) || closingPartyIDsRef.current.has(partyID)) return;
    const base = Number(snapshot.party.current_time || 0);
    const updated = new Date(snapshot.party.playback_updated_at || Date.now()).getTime();
    const elapsed = snapshot.party.playback_state === 'playing' ? Math.max(0, (Date.now() - updated) / 1000) : 0;
    applyRemotePlayback(snapshot.party.playback_state === 'playing' ? 'play' : 'pause', base + elapsed, snapshot.party.playback_state);
  }, [applyRemotePlayback, handleWatchPartyEnded, loadVideo]);

  const joinWatchParty = useCallback(async (partyID: string) => {
    if (endedPartyIDsRef.current.has(partyID)) {
      handleWatchPartyEnded(partyID);
      throw watchPartyEndedError();
    }
    const currentPartyID = watchPartyRef.current?.party.id;
    if (currentPartyID && currentPartyID !== partyID) throw new Error('Leave your current watch party before joining another room.');
    try {
      await giltubeAPI.joinWatchParty(partyID, activeChannelID);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('already ended')) {
        handleWatchPartyEnded(partyID);
        throw watchPartyEndedError();
      }
      throw error;
    }
    const snapshot = await giltubeAPI.watchParty(partyID);
    await loadPartySnapshot(snapshot, 'expanded');
    if (snapshot.party.status === 'ended' || endedPartyIDsRef.current.has(partyID)) throw watchPartyEndedError();
    return snapshot;
  }, [activeChannelID, handleWatchPartyEnded, loadPartySnapshot]);

  const refreshWatchParty = useCallback(async () => {
    const partyID = watchPartyRef.current?.party.id;
    if (!partyID || closingPartyIDsRef.current.has(partyID) || endedPartyIDsRef.current.has(partyID)) return null;
    const snapshot = await giltubeAPI.watchParty(partyID);
    if (snapshot.party.status === 'ended') {
      handleWatchPartyEnded(partyID);
      return snapshot;
    }
    if (watchPartyRef.current?.party.id !== partyID || closingPartyIDsRef.current.has(partyID) || endedPartyIDsRef.current.has(partyID)) return snapshot;
    await loadPartySnapshot(snapshot, modeRef.current === 'hidden' ? 'minimized' : modeRef.current);
    return snapshot;
  }, [handleWatchPartyEnded, loadPartySnapshot]);

  const sendWatchPartyPlayback = useCallback(async (action: 'play' | 'pause' | 'seek', seconds = player.currentTime) => {
    const snapshot = watchPartyRef.current;
    if (!snapshot || applyingRemoteRef.current) return;
    const isHost = snapshot.party.host_user_id === account?.id;
    if (!isHost && snapshot.party.sync_mode !== 'open') return;
    const duration = Math.max(0, player.duration || 0);
    const target = Math.max(0, action === 'seek' && duration > 0 ? Math.min(duration, seconds) : seconds);
    if (action === 'play') player.play();
    if (action === 'pause') player.pause();
    if (action === 'seek') player.currentTime = target;
    await giltubeAPI.watchPartyPlayback(snapshot.party.id, action, action === 'seek' ? target : player.currentTime, activeChannelID);
  }, [account?.id, activeChannelID, player]);

  const leaveWatchParty = useCallback(async () => {
    const snapshot = watchPartyRef.current;
    const partyID = snapshot?.party.id;
    if (!partyID) { dismiss(); return; }
    closingPartyIDsRef.current.add(partyID);
    try {
      await giltubeAPI.leaveWatchParty(partyID);
    } catch (error) {
      if (endedPartyIDsRef.current.has(partyID)) return;
      closingPartyIDsRef.current.delete(partyID);
      throw error;
    }
    if (snapshot.party.host_user_id === account?.id) {
      handleWatchPartyEnded(partyID);
      return;
    }
    dismiss();
    closeWatchPartyRoute();
    showToast('You left the watch party');
  }, [account?.id, closeWatchPartyRoute, dismiss, handleWatchPartyEnded, showToast]);

  useEffect(() => {
    if (authStatus !== 'signedIn' || !account?.id) {
      restoredUserRef.current = '';
      return;
    }
    if (restoredUserRef.current === account.id) return;
    restoredUserRef.current = account.id;
    let cancelled = false;
    void giltubeAPI.activeWatchParty().then(async ({ party }) => {
      if (cancelled || !party || videoRef.current || modeRef.current !== 'hidden') return;
      await loadPartySnapshot(party, 'minimized');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [account?.id, authStatus, loadPartySnapshot]);

  useEffect(() => {
    const partyID = watchParty?.party.id;
    if (!partyID || !account?.id || watchParty.party.status === 'ended') return;
    return subscribeToWatchParty(partyID, account.id, (event) => {
      if ((closingPartyIDsRef.current.has(partyID) || endedPartyIDsRef.current.has(partyID)) && event.type !== 'ended') return;
      setWatchPartyEvent({ event, nonce: Date.now() + Math.random() });
      if (event.type === 'ready') return;
      if (event.type === 'chat') {
        setWatchParty((current) => current && current.party.id === partyID && !current.messages.some((item) => item.id === event.message.id)
          ? { ...current, messages: [...current.messages, event.message] }
          : current);
        return;
      }
      if (event.type === 'playback') {
        setWatchParty((current) => current && current.party.id === partyID ? {
          ...current,
          party: { ...current.party, current_time: event.current_time, playback_state: event.playback_state, playback_updated_at: event.at },
        } : current);
        if (event.actor?.user_id !== account.id) applyRemotePlayback(event.action, Number(event.current_time || 0), event.playback_state);
        return;
      }
      if (event.type === 'ended') {
        handleWatchPartyEnded(partyID);
        return;
      }
      void refreshWatchParty().catch(() => undefined);
    });
  }, [account?.id, applyRemotePlayback, handleWatchPartyEnded, refreshWatchParty, watchParty?.party.id, watchParty?.party.status]);

  useEffect(() => {
    const snapshot = watchParty;
    if (!snapshot || !isPlaying || snapshot.party.status === 'ended') return;
    const isHost = snapshot.party.host_user_id === account?.id;
    if (!isHost && snapshot.party.sync_mode !== 'open') return;
    const timer = setInterval(() => {
      if (!applyingRemoteRef.current) void giltubeAPI.watchPartyPlayback(snapshot.party.id, 'progress', player.currentTime, activeChannelID).catch(() => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [account?.id, activeChannelID, isPlaying, player, watchParty]);

  useEffect(() => {
    const expandedPath = video ? `/video/${video.id}` : liveStream ? `/live/${liveStream.channel_id}` : '';
    if ((!video && !liveStream) || mode !== 'expanded' || pathname === expandedPath) return;
    const timer = setTimeout(() => {
      // Re-check with live values: going back to an earlier watch screen loads
      // its video in the same tick, and must not be minimized by this stale run.
      const currentVideo = videoRef.current;
      const currentPath = currentVideo ? `/video/${currentVideo.id}` : expandedPath;
      if (modeRef.current === 'expanded' && pathnameRef.current !== currentPath) setMode('minimized');
    }, 0);
    return () => clearTimeout(timer);
  }, [liveStream, mode, pathname, video, watchParty]);

  useEffect(() => {
    if (mode === 'minimized') {
      hiddenSubtitleRef.current = player.subtitleTrack;
      player.subtitleTrack = null;
      return;
    }
    if (mode === 'expanded' && hiddenSubtitleRef.current) {
      const language = hiddenSubtitleRef.current.language;
      const restored = player.availableSubtitleTracks.find((track) => track.language === language);
      if (restored) player.subtitleTrack = restored;
      hiddenSubtitleRef.current = null;
    }
    if (mode === 'hidden') hiddenSubtitleRef.current = null;
  }, [mode, player]);

  const value = useMemo(
    () => ({ player, video, liveStream, mode, quality, liveQualityOptions, isLoading, playbackMasterURL, hdr, setHDREnabled, watchParty, watchPartyEvent, play, playLive, switchQuality, joinWatchParty, refreshWatchParty, sendWatchPartyPlayback, leaveWatchParty, minimize, expand, dismiss }),
    [player, video, liveStream, mode, quality, liveQualityOptions, isLoading, playbackMasterURL, hdr, setHDREnabled, watchParty, watchPartyEvent, play, playLive, switchQuality, joinWatchParty, refreshWatchParty, sendWatchPartyPlayback, leaveWatchParty, minimize, expand, dismiss],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <MiniPlayer />
      {!!toast && <PlayerToast key={toast.nonce} message={toast.message} />}
    </PlayerContext.Provider>
  );
}

function PlayerToast({ message }: { message: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      style={[styles.toast, { bottom: Math.max(insets.bottom, 10) + 76 }]}
    >
      <Ionicons name="information-circle" color={colors.accentBright} size={20} />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

function MiniPlayer() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { account } = useAuth();
  const { player, video, liveStream, mode, watchParty, hdr, expand, dismiss, sendWatchPartyPlayback, leaveWatchParty } = usePlayer();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const media = video || liveStream;
  if (!media || mode !== 'minimized') return null;

  const open = () => {
    expand();
    if (watchParty && video) router.push({ pathname: '/video/[id]', params: { id: video.id, party: watchParty.party.id } });
    else if (liveStream) router.push({ pathname: '/live/[channelId]', params: { channelId: liveStream.channel_id } });
    else if (video) router.push({ pathname: '/video/[id]', params: { id: video.id } });
  };

  const togglePlayback = () => {
    if (watchParty) void sendWatchPartyPlayback(isPlaying ? 'pause' : 'play').catch(() => undefined);
    else if (isPlaying) player.pause(); else player.play();
  };

  const close = () => {
    if (!watchParty) { dismiss(); return; }
    const isHost = watchParty.party.host_user_id === account?.id;
    Alert.alert(t(isHost ? 'End watch party?' : 'Leave watch party?'), t(isHost ? 'This ends the room for everyone.' : 'You will leave the room.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t(isHost ? 'End party' : 'Leave'), style: 'destructive', onPress: () => void leaveWatchParty().catch((error) => Alert.alert(t('Could not leave'), error instanceof Error ? error.message : t('Please try again.'))) },
    ]);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.mini, { bottom: Math.max(insets.bottom, 8) + 66 }]}
    >
      <PressableScale onPress={open} style={styles.preview}>
        {/* Android only presents HDR on a SurfaceView; TextureView washes it out. */}
        <VideoView key={hdr.playing ? 'hdr' : 'sdr'} player={player} style={StyleSheet.absoluteFill} nativeControls={false} allowsPictureInPicture startsPictureInPictureAutomatically contentFit="cover" surfaceType={hdr.playing ? 'surfaceView' : 'textureView'} />
      </PressableScale>
      <PressableScale onPress={open} style={styles.copy}>
        {!!watchParty && <View style={styles.partyLabel}><View style={styles.partyDot} /><Text style={styles.partyLabelText}>{t('WATCH PARTY')}</Text></View>}
        {!!liveStream && <View style={styles.partyLabel}><View style={styles.partyDot} /><Text style={styles.partyLabelText}>{t('LIVE')}</Text></View>}
        <Text numberOfLines={1} style={styles.title}>{media.title}</Text>
        <Text numberOfLines={1} style={styles.channel}>{watchParty ? watchParty.party.title : media.channel?.name || 'GilTube'}</Text>
      </PressableScale>
      <PressableScale onPress={togglePlayback} style={styles.iconButton}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} color={colors.text} size={21} />
      </PressableScale>
      <PressableScale onPress={close} style={styles.iconButton}>
        <Ionicons name="close" color={colors.text} size={24} />
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  toast: {
    position: 'absolute',
    zIndex: 200,
    alignSelf: 'center',
    maxWidth: '88%',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: withAlpha(colors.surface, .98),
    shadowColor: colors.black,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 20,
  },
  toastText: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  mini: {
    position: 'absolute',
    zIndex: 100,
    left: 10,
    right: 10,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: withAlpha(colors.surface, .98),
    shadowColor: colors.black,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 16,
  },
  preview: { width: 112, height: '100%', backgroundColor: colors.black },
  copy: { flex: 1, minWidth: 0, paddingHorizontal: 12, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 13, fontWeight: '800' },
  channel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  partyLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  partyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accentBright },
  partyLabelText: { color: colors.accentBright, fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  iconButton: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center' },
}));

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
}
