import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, PermissionsAndroid, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaDevices, MediaStream, RTCPeerConnection, RTCSessionDescription, RTCView } from 'react-native-webrtc';

import { authenticatedFetch } from '@/api/client';
import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { LiveChat } from '@/live/LiveChat';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { LiveChatMessage } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

function preferVideoCodec(sdp: string, codecName: string) {
  const lines = sdp.split('\r\n');
  const videoLine = lines.findIndex((line) => line.startsWith('m=video '));
  if (videoLine < 0) return sdp;
  const payloads = new Set<string>();
  const codec = new RegExp(`^a=rtpmap:(\\d+)\\s+${codecName}/`, 'i');
  lines.forEach((line) => { const match = line.match(codec); if (match?.[1]) payloads.add(match[1]); });
  if (!payloads.size) return sdp;
  const parts = lines[videoLine].split(' ');
  lines[videoLine] = [...parts.slice(0, 3), ...parts.slice(3).filter((part) => payloads.has(part)), ...parts.slice(3).filter((part) => !payloads.has(part))].join(' ');
  return lines.join('\r\n');
}

function waitForIce(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(done, 3_000);
    function done() { clearTimeout(timeout); pc.onicegatheringstatechange = null; resolve(); }
    function check() { if (pc.iceGatheringState === 'complete') done(); }
    pc.onicegatheringstatechange = check;
  });
}

function waitForConnection(pc: RTCPeerConnection) {
  if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('The live connection timed out.')), 12_000);
    function check() {
      if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') finish(new Error('The live connection failed.'));
      else if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') finish();
    }
    function finish(error?: Error) {
      clearTimeout(timeout);
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      if (error) reject(error); else resolve();
    }
    pc.onconnectionstatechange = check;
    pc.oniceconnectionstatechange = check;
    check();
  });
}

function apiPathFromLocation(location: string) {
  const parsed = new URL(location, 'https://giltube.gilservers.com');
  return `${parsed.pathname.replace(/^\/api\/v1/, '')}${parsed.search}`;
}

type StreamResolution = '480p' | '720p' | '1080p';
type CameraDevice = { deviceId: string; facing?: 'front' | 'environment'; groupId?: string; kind: string; label?: string };

const STREAM_RESOLUTIONS: Record<StreamResolution, { width: number; height: number; bitrate: number }> = {
  '480p': { width: 854, height: 480, bitrate: 1_500_000 },
  '720p': { width: 1280, height: 720, bitrate: 3_500_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 6_000_000 },
};

export default function GoLiveScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { t } = useI18n();
  const { status } = useAuth();
  const { channels, activeChannelID } = useActiveChannel();
  const [channelID, setChannelID] = useState(activeChannelID);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dvrEnabled, setDVREnabled] = useState(true);
  const [adaptiveTranscodingEnabled, setAdaptiveTranscodingEnabled] = useState(true);
	const [adaptiveSettingBusy, setAdaptiveSettingBusy] = useState(false);
	const [thumbnailURL, setThumbnailURL] = useState('');
	const [hasCustomThumbnail, setHasCustomThumbnail] = useState(false);
	const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatManagerOpen, setChatManagerOpen] = useState(false);
  const [hiddenChatAlert, setHiddenChatAlert] = useState<LiveChatMessage | null>(null);
  const [streamOrientation, setStreamOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [streamResolution, setStreamResolution] = useState<StreamResolution>('720p');
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraID, setSelectedCameraID] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPathRef = useRef('');
  const liveRef = useRef(false);
  const channelRef = useRef(channelID);
  const shuttingDownRef = useRef(false);
  const latestChatMessageRef = useRef('');
  const hiddenChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedChannelID = channelID || activeChannelID;
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelID);
  const isLandscape = window.width > window.height;
  const pollQuery = useQuery({ queryKey: ['live-poll', selectedChannelID, activeChannelID], queryFn: () => giltubeAPI.livePoll(selectedChannelID, activeChannelID), enabled: !!selectedChannelID, refetchInterval: isLive ? 2_500 : 5_000 });
  const broadcastChatQuery = useQuery({ queryKey: ['live-chat', selectedChannelID], queryFn: () => giltubeAPI.liveChatMessages(selectedChannelID, 40), enabled: isLive && !!selectedChannelID, refetchInterval: isLive ? 2_000 : false });

  useEffect(() => { channelRef.current = selectedChannelID; }, [selectedChannelID]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); };
  }, []);

  useEffect(() => {
    const latest = broadcastChatQuery.data?.[broadcastChatQuery.data.length - 1];
    if (!latest) return;
    if (!latestChatMessageRef.current) {
      latestChatMessageRef.current = latest.id;
      return;
    }
    if (latest.id === latestChatMessageRef.current) return;
    latestChatMessageRef.current = latest.id;
    if (chatOpen || chatManagerOpen) return;
    if (hiddenChatTimerRef.current) clearTimeout(hiddenChatTimerRef.current);
    hiddenChatTimerRef.current = setTimeout(() => {
      setHiddenChatAlert(latest);
      hiddenChatTimerRef.current = setTimeout(() => setHiddenChatAlert(null), 4_000);
    }, 0);
  }, [broadcastChatQuery.data, chatManagerOpen, chatOpen]);

  const closeWhip = useCallback(async () => {
    const path = sessionPathRef.current;
    sessionPathRef.current = '';
    peerRef.current?.close();
    peerRef.current = null;
    if (path) await authenticatedFetch(path, { method: 'DELETE' }).catch(() => undefined);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const endStream = useCallback(async (leaveScreen = false) => {
    if (shuttingDownRef.current) return;
    shuttingDownRef.current = true;
    try {
      await closeWhip();
      if (liveRef.current && channelRef.current) await giltubeAPI.stopMyLiveStream(channelRef.current);
      liveRef.current = false;
      setIsLive(false);
      if (leaveScreen) stopCamera();
    } finally {
      shuttingDownRef.current = false;
    }
  }, [closeWhip, stopCamera]);

  useEffect(() => () => {
    const wasLive = liveRef.current;
    const liveChannel = channelRef.current;
    peerRef.current?.close();
    if (sessionPathRef.current) void authenticatedFetch(sessionPathRef.current, { method: 'DELETE' }).catch(() => undefined);
    if (wasLive && liveChannel) void giltubeAPI.stopMyLiveStream(liveChannel).catch(() => undefined);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (hiddenChatTimerRef.current) clearTimeout(hiddenChatTimerRef.current);
  }, []);

  const requestAndroidPermissions = async () => {
    if (Platform.OS !== 'android') return true;
    const grants = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]);
    return grants[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED && grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
  };

  const cameraVideoConstraints = (targetOrientation: 'portrait' | 'landscape', targetResolution: StreamResolution, targetCameraID = selectedCameraID) => {
    const preset = STREAM_RESOLUTIONS[targetResolution];
    return {
      ...(targetCameraID ? { deviceId: { exact: targetCameraID } } : { facingMode: 'user' as const }),
      width: targetOrientation === 'portrait' ? preset.height : preset.width,
      height: targetOrientation === 'portrait' ? preset.width : preset.height,
      frameRate: { exact: 30, ideal: 30, min: 30, max: 30 },
    };
  };

  const prepareCamera = async (targetOrientation: 'portrait' | 'landscape' = streamOrientation, targetResolution: StreamResolution = streamResolution, targetCameraID = selectedCameraID) => {
    if (streamRef.current) return streamRef.current;
    if (!(await requestAndroidPermissions())) throw new Error(t('Camera and microphone permission is required to stream.'));
    const available = ((await mediaDevices.enumerateDevices()) as CameraDevice[]).filter((device) => device.kind === 'videoinput');
    setCameraDevices(available);
    const selected = available.find((device) => device.deviceId === targetCameraID) || available.find((device) => device.facing === 'front') || available[0];
    const cameraID = selected?.deviceId || '';
    if (cameraID) setSelectedCameraID(cameraID);
    setFrontCamera(selected?.facing !== 'environment');
    const next = await mediaDevices.getUserMedia({
      audio: true,
      video: cameraVideoConstraints(targetOrientation, targetResolution, cameraID),
    });
    streamRef.current = next;
    setStream(next);
    return next;
  };

  useEffect(() => {
    if (status !== 'signedIn') { router.replace('/login'); return; }
    const timer = setTimeout(() => {
      void prepareCamera('portrait').catch((error) => Alert.alert(t('Camera unavailable'), error instanceof Error ? error.message : t('Please try again.')));
    }, 0);
    // Camera initialization is intentionally only performed once on entry.
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const chooseStreamOrientation = async (next: 'portrait' | 'landscape') => {
    if (isLive || busy || next === streamOrientation) return;
    setStreamOrientation(next);
    await ScreenOrientation.lockAsync(next === 'landscape' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP);
    stopCamera();
    await prepareCamera(next, streamResolution).catch((error) => Alert.alert(t('Camera unavailable'), error instanceof Error ? error.message : t('Please try again.')));
  };

  const chooseStreamResolution = async (next: StreamResolution) => {
    if (isLive || busy || next === streamResolution) return;
    setStreamResolution(next);
    stopCamera();
    await prepareCamera(streamOrientation, next).catch((error) => Alert.alert(t('Camera unavailable'), error instanceof Error ? error.message : t('Please try again.')));
  };

  const chooseCamera = async (cameraID: string) => {
    if (cameraBusy || cameraID === selectedCameraID) return;
    const device = cameraDevices.find((camera) => camera.deviceId === cameraID);
    if (!device) return;
    setCameraBusy(true);
    try {
      const videoTrack = streamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        await videoTrack.applyConstraints(cameraVideoConstraints(streamOrientation, streamResolution, cameraID));
      } else {
        await prepareCamera(streamOrientation, streamResolution, cameraID);
      }
      setSelectedCameraID(cameraID);
      setFrontCamera(device.facing === 'front');
    } catch (error) {
      Alert.alert(t('Camera unavailable'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setCameraBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedChannelID) return;
    let active = true;
    void giltubeAPI.myLiveStream(selectedChannelID).then((live) => {
      if (!active) return;
      setTitle(live.title || '');
      setDescription(live.description || '');
      setDVREnabled(live.dvr_enabled !== false);
	  setAdaptiveTranscodingEnabled(live.adaptive_transcoding_enabled !== false);
	  setThumbnailURL(live.thumbnail_url || '');
	  setHasCustomThumbnail(!!live.has_custom_thumbnail);
      if (live.status === 'live') Alert.alert(t('Stream already live'), t('This channel is already marked live. End it from the existing broadcaster before starting another stream.'));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [selectedChannelID, t]);

  const start = async () => {
    if (!selectedChannelID || busy || isLive) return;
    setBusy(true);
    let pc: RTCPeerConnection | null = null;
    try {
      await ScreenOrientation.lockAsync(streamOrientation === 'landscape' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP);
      const local = await prepareCamera(streamOrientation);
      const liveTitle = title.trim() || t('Live Stream');
      await giltubeAPI.saveMyLiveStreamSettings(selectedChannelID, liveTitle, description.trim(), dvrEnabled, adaptiveTranscodingEnabled);
      // Let the backend reconcile GilTube's live state from the actual MediaMTX
      // publisher. This recovers correctly even if the app loses connectivity
      // after WHIP succeeds but before the explicit start request completes.
      await giltubeAPI.setMyPublisherPresence(selectedChannelID, true);
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const videoTrack = local.getVideoTracks()[0];
      const videoSender = videoTrack ? pc.addTrack(videoTrack, local) : null;
      local.getAudioTracks().forEach((track) => pc!.addTrack(track, local));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const sdp = preferVideoCodec(pc.localDescription?.sdp || offer.sdp || '', 'H264');
      const response = await authenticatedFetch(`/live/me/whip?channel_id=${encodeURIComponent(selectedChannelID)}`, {
        method: 'POST', headers: { Accept: 'application/sdp', 'Content-Type': 'application/sdp' }, body: sdp,
      });
      const location = response.headers.get('Location');
      if (location) sessionPathRef.current = apiPathFromLocation(location);
      const answer = await response.text();
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
      if (videoSender) {
        const preset = STREAM_RESOLUTIONS[streamResolution];
        const parameters = videoSender.getParameters();
        parameters.degradationPreference = 'maintain-resolution';
        parameters.encodings.forEach((encoding) => {
          encoding.maxFramerate = 30;
          encoding.maxBitrate = preset.bitrate;
          encoding.minBitrate = Math.round(preset.bitrate * .6);
          encoding.scaleResolutionDownBy = 1;
        });
        await videoSender.setParameters(parameters);
      }
      peerRef.current = pc;
      await giltubeAPI.startMyLiveStream(selectedChannelID, liveTitle, description.trim(), dvrEnabled, adaptiveTranscodingEnabled);
      liveRef.current = true;
      setIsLive(true);
      setChatOpen(true);
      await waitForConnection(pc);
    } catch (error) {
      pc?.close();
      await closeWhip();
      if (liveRef.current && selectedChannelID) {
        await giltubeAPI.stopMyLiveStream(selectedChannelID).catch(() => undefined);
        liveRef.current = false;
        setIsLive(false);
      }
      Alert.alert(t('Could not start live stream'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnd = () => Alert.alert(t('End live stream?'), t('Your broadcast will stop for everyone.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('End stream'), style: 'destructive', onPress: () => { setBusy(true); void endStream().catch((error) => Alert.alert(t('Could not end live stream'), error instanceof Error ? error.message : t('Please try again.'))).finally(() => setBusy(false)); } },
  ]);

  const goBack = () => {
    if (!isLive) { stopCamera(); router.back(); return; }
    Alert.alert(t('Leave live studio?'), t('Leaving will end your live stream.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('End and leave'), style: 'destructive', onPress: () => void endStream(true).finally(() => router.back()) },
    ]);
  };

  const toggleMic = () => { const next = !muted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); };
  const flipCamera = () => {
    const current = cameraDevices.find((camera) => camera.deviceId === selectedCameraID);
    const opposite = cameraDevices.find((camera) => camera.facing !== current?.facing);
    const next = opposite || cameraDevices.find((camera) => camera.deviceId !== selectedCameraID);
    if (next) void chooseCamera(next.deviceId);
    else streamRef.current?.getVideoTracks()[0]?._switchCamera();
  };

  const cameraLabel = (device: CameraDevice) => {
    const facingDevices = cameraDevices.filter((camera) => camera.facing === device.facing);
    const position = facingDevices.findIndex((camera) => camera.deviceId === device.deviceId) + 1;
    const base = t(device.facing === 'front' ? 'Front camera' : 'Rear camera');
    return facingDevices.length > 1 ? `${base} ${position}` : base;
  };
	const chooseThumbnail = async () => {
		if (!selectedChannelID || thumbnailBusy) return;
		const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
		if (result.canceled) return;
		setThumbnailBusy(true);
		try { const uploaded = await giltubeAPI.uploadMyLiveStreamThumbnail(selectedChannelID, result.assets[0]); setThumbnailURL(uploaded.thumbnail_url); setHasCustomThumbnail(true); }
		catch (error) { Alert.alert(t('Thumbnail upload failed'), error instanceof Error ? error.message : t('Please try again.')); }
		finally { setThumbnailBusy(false); }
	};
	const removeThumbnail = async () => {
		if (!selectedChannelID || thumbnailBusy) return;
		setThumbnailBusy(true);
		try { await giltubeAPI.deleteMyLiveStreamThumbnail(selectedChannelID); setThumbnailURL(''); setHasCustomThumbnail(false); }
		catch (error) { Alert.alert(t('Could not remove thumbnail'), error instanceof Error ? error.message : t('Please try again.')); }
		finally { setThumbnailBusy(false); }
	};
	const updateAdaptiveTranscoding = async (enabled: boolean) => {
		if (!selectedChannelID || adaptiveSettingBusy) return;
		const previous = adaptiveTranscodingEnabled;
		setAdaptiveTranscodingEnabled(enabled);
		setAdaptiveSettingBusy(true);
		try {
			await giltubeAPI.saveMyLiveStreamSettings(selectedChannelID, title.trim() || t('Live Stream'), description.trim(), dvrEnabled, enabled);
		} catch (error) {
			setAdaptiveTranscodingEnabled(previous);
			Alert.alert(t('Could not update live settings'), error instanceof Error ? error.message : t('Please try again.'));
		} finally {
			setAdaptiveSettingBusy(false);
		}
	};

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.preview}>
      {stream ? <RTCView streamURL={stream.toURL()} mirror={frontCamera} objectFit="cover" zOrder={0} style={StyleSheet.absoluteFill} /> : <View style={styles.cameraLoading}><ActivityIndicator color={colors.text} /><Text style={styles.cameraLoadingText}>{t('Preparing camera…')}</Text></View>}
      {cameraOff && <View style={styles.cameraDisabled}><Ionicons name="videocam-off" size={44} color={colors.textMuted} /><Text style={styles.cameraLoadingText}>{t('Camera is off')}</Text></View>}
      <View style={[styles.topBar, isLandscape && styles.topBarLandscape, { paddingTop: insets.top + (isLandscape ? 4 : 8) }]}> 
        <PressableScale accessibilityLabel={t('Back')} onPress={goBack} style={styles.circle}><Ionicons name="chevron-back" color={colors.white} size={25} /></PressableScale>
        <View style={styles.channelCopy}><Text numberOfLines={1} style={styles.channelName}>{selectedChannel?.name || t('Select a channel')}</Text><Text numberOfLines={1} style={styles.liveTitle}>{title.trim() || t('Untitled live stream')}</Text></View>
        {isLive && <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>LIVE</Text></View>}
        <PressableScale accessibilityLabel={t('Stream settings')} onPress={() => setSettingsOpen(true)} style={styles.circle}><Ionicons name="settings-outline" color={colors.white} size={21} /></PressableScale>
      </View>
      <View style={[styles.sideControls, isLandscape && styles.sideControlsLandscape]}>
        <StudioControl compact={isLandscape} label={t(frontCamera ? 'Rear camera' : 'Front camera')} icon="camera-reverse-outline" onPress={flipCamera} />
        <StudioControl compact={isLandscape} label={t(muted ? 'Unmute' : 'Mute')} icon={muted ? 'mic-off-outline' : 'mic-outline'} active={muted} onPress={toggleMic} />
        <StudioControl compact={isLandscape} label={t(cameraOff ? 'Camera on' : 'Camera off')} icon={cameraOff ? 'videocam-off-outline' : 'videocam-outline'} active={cameraOff} onPress={toggleCamera} />
        <StudioControl compact={isLandscape} label={t('Live chat')} icon="chatbubbles-outline" active={isLive ? chatOpen : chatManagerOpen} onPress={() => isLive ? setChatOpen((value) => !value) : setChatManagerOpen(true)} />
      </View>
      {isLive && chatOpen && <View style={[styles.broadcastChat, isLandscape && styles.broadcastChatLandscape, { bottom: isLandscape ? Math.max(insets.bottom, 8) + 70 : Math.max(insets.bottom, 8) + 86 }]}>
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,.64)']} style={StyleSheet.absoluteFill} />
        <View style={styles.broadcastChatHeader}><Text style={styles.broadcastChatTitle}>{t('Live chat')}</Text><View style={{ flex: 1 }} />{pollQuery.data?.status === 'active' && <PressableScale accessibilityLabel={t('Open active poll')} onPress={() => setChatManagerOpen(true)} style={styles.broadcastChatAction}><Ionicons name="stats-chart" size={15} color={colors.accentBright} /></PressableScale>}<PressableScale accessibilityLabel={t('Open full chat')} onPress={() => setChatManagerOpen(true)} style={styles.broadcastChatAction}><Ionicons name="expand-outline" size={15} color={colors.white} /></PressableScale><PressableScale accessibilityLabel={t('Hide live chat')} onPress={() => setChatOpen(false)} style={styles.broadcastChatAction}><Ionicons name="eye-off-outline" size={16} color={colors.white} /></PressableScale></View>
        <View style={styles.broadcastMessages}>{broadcastChatQuery.data?.slice(-6).map((item, index, visible) => <View key={item.id} style={[styles.broadcastMessage, { opacity: .28 + ((index + 1) / visible.length) * .72 }]}><Image source={resolveMediaURL(item.channel.avatar_url)} contentFit="cover" style={styles.broadcastAvatar} /><View style={styles.broadcastMessageCopy}><Text numberOfLines={1} style={styles.broadcastName}>{item.channel.name}</Text><Text numberOfLines={2} style={styles.broadcastBody}>{item.message}</Text></View></View>)}</View>
      </View>}
      {!chatOpen && !chatManagerOpen && !!hiddenChatAlert && <PressableScale accessibilityLabel={t('Open live chat')} onPress={() => { setChatOpen(true); setHiddenChatAlert(null); }} style={[styles.messageAlert, { top: insets.top + (isLandscape ? 58 : 82) }]}><Image source={resolveMediaURL(hiddenChatAlert.channel.avatar_url)} contentFit="cover" style={styles.messageAlertAvatar} /><View style={styles.messageAlertCopy}><Text numberOfLines={1} style={styles.messageAlertName}>{hiddenChatAlert.channel.name}</Text><Text numberOfLines={1} style={styles.messageAlertBody}>{hiddenChatAlert.message}</Text></View></PressableScale>}
      {!chatOpen && !chatManagerOpen && pollQuery.data?.status === 'active' && <PressableScale accessibilityLabel={t('Open active poll')} onPress={() => setChatManagerOpen(true)} style={[styles.pollAlert, isLandscape && styles.pollAlertLandscape]}><Ionicons name="stats-chart" size={17} color={colors.onAccent} /><View style={styles.pollAlertCopy}><Text style={styles.pollAlertTitle}>{t('Poll active')}</Text><Text numberOfLines={1} style={styles.pollAlertQuestion}>{pollQuery.data.question}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.onAccent} /></PressableScale>}
      <View style={[styles.bottom, isLandscape && styles.bottomLandscape, { paddingBottom: isLandscape ? Math.max(insets.bottom, 8) : insets.bottom + 18 }]}> 
        {!isLandscape && <Text style={styles.keepOpen}>{t('Keep GilTube open while you are live.')}</Text>}
        <PressableScale disabled={busy || !stream || !selectedChannelID} onPress={isLive ? confirmEnd : () => void start()} style={[styles.liveButton, isLive && styles.endButton, (busy || !stream || !selectedChannelID) && styles.disabled]}>
          {busy ? <ActivityIndicator color={isLive ? colors.text : colors.onAccent} /> : <><Ionicons name={isLive ? 'stop' : 'radio'} size={20} color={isLive ? colors.text : colors.onAccent} /><Text style={[styles.liveButtonText, isLive && styles.endButtonText]}>{t(isLive ? 'End stream' : 'Go live')}</Text></>}
        </PressableScale>
      </View>
    </View>

    {chatManagerOpen && !!selectedChannelID && <View style={[styles.chat, isLandscape && styles.chatLandscape, { paddingBottom: insets.bottom }]}><LiveChat channelID={selectedChannelID} live={isLive} onHide={() => setChatManagerOpen(false)} /></View>}

    <SwipeSheet visible={settingsOpen} title={t('Live settings')} onClose={() => setSettingsOpen(false)}>
      <Text style={styles.label}>{t('STREAM ORIENTATION')}</Text>
      <View style={styles.orientationChoices}><PressableScale disabled={isLive || busy} onPress={() => void chooseStreamOrientation('portrait')} style={[styles.orientationChoice, streamOrientation === 'portrait' && styles.orientationChoiceActive]}><Ionicons name="phone-portrait-outline" size={20} color={streamOrientation === 'portrait' ? colors.onText : colors.text} /><Text style={[styles.orientationChoiceText, streamOrientation === 'portrait' && styles.orientationChoiceTextActive]}>{t('Vertical')}</Text></PressableScale><PressableScale disabled={isLive || busy} onPress={() => void chooseStreamOrientation('landscape')} style={[styles.orientationChoice, streamOrientation === 'landscape' && styles.orientationChoiceActive]}><Ionicons name="phone-landscape-outline" size={20} color={streamOrientation === 'landscape' ? colors.onText : colors.text} /><Text style={[styles.orientationChoiceText, streamOrientation === 'landscape' && styles.orientationChoiceTextActive]}>{t('Horizontal')}</Text></PressableScale></View>
      <Text style={styles.orientationHint}>{t(isLive ? 'Stream orientation is locked while live.' : 'Choose before going live. The camera and screen will lock to this orientation.')}</Text>
      <Text style={styles.label}>{t('STREAM RESOLUTION')}</Text>
      <View style={styles.resolutionChoices}>{(Object.keys(STREAM_RESOLUTIONS) as StreamResolution[]).map((resolution) => <PressableScale key={resolution} disabled={isLive || busy} onPress={() => void chooseStreamResolution(resolution)} style={[styles.resolutionChoice, streamResolution === resolution && styles.resolutionChoiceActive]}><Text style={[styles.resolutionChoiceText, streamResolution === resolution && styles.resolutionChoiceTextActive]}>{resolution}</Text><Text style={[styles.resolutionFPS, streamResolution === resolution && styles.resolutionChoiceTextActive]}>30 FPS</Text></PressableScale>)}</View>
      <Text style={styles.orientationHint}>{t(isLive ? 'Stream resolution is locked while live.' : 'Higher resolutions use more upload bandwidth.')}</Text>
      <Text style={styles.label}>{t('CAMERA')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{cameraDevices.map((camera) => <PressableScale key={camera.deviceId} disabled={cameraBusy} onPress={() => void chooseCamera(camera.deviceId)} style={[styles.cameraChoice, camera.deviceId === selectedCameraID && styles.cameraChoiceActive]}><Ionicons name={camera.facing === 'front' ? 'person-outline' : 'camera-outline'} size={17} color={camera.deviceId === selectedCameraID ? colors.onText : colors.text} /><Text style={[styles.cameraChoiceText, camera.deviceId === selectedCameraID && styles.cameraChoiceTextActive]}>{cameraLabel(camera)}</Text></PressableScale>)}</ScrollView>
      <Text style={styles.orientationHint}>{t('You can switch cameras while live.')}</Text>
      <Text style={styles.label}>{t('PUBLISHING CHANNEL')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{channels.map((channel) => <PressableScale disabled={isLive} key={channel.id} onPress={() => setChannelID(channel.id)} style={[styles.chip, channel.id === selectedChannelID && styles.chipActive]}><Text style={[styles.chipText, channel.id === selectedChannelID && styles.chipTextActive]}>{channel.name}</Text></PressableScale>)}</ScrollView>
      <Text style={styles.label}>{t('TITLE')}</Text><TextInput editable={!isLive} value={title} onChangeText={setTitle} maxLength={150} placeholder={t('Name your live stream')} placeholderTextColor={colors.textDim} style={styles.input} />
      <Text style={styles.label}>{t('DESCRIPTION')}</Text><TextInput editable={!isLive} value={description} onChangeText={setDescription} maxLength={5000} multiline placeholder={t('Tell viewers what is happening')} placeholderTextColor={colors.textDim} style={[styles.input, styles.area]} />
	  <Text style={styles.label}>{t('LIVE THUMBNAIL')}</Text>
	  <View style={styles.thumbnailRow}>{thumbnailURL ? <Image source={resolveMediaURL(thumbnailURL)} contentFit="cover" style={styles.thumbnailPreview} /> : <View style={styles.thumbnailPreview}><Ionicons name="image-outline" size={25} color={colors.textDim} /></View>}<View style={styles.thumbnailActions}><Text style={styles.settingMeta}>{t('Shown in featured banners, live listings, and notifications.')}</Text><View style={styles.thumbnailButtons}><PressableScale disabled={thumbnailBusy} onPress={() => void chooseThumbnail()} style={styles.thumbnailButton}>{thumbnailBusy ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={styles.thumbnailButtonText}>{t('Choose image')}</Text>}</PressableScale>{hasCustomThumbnail && <PressableScale disabled={thumbnailBusy} onPress={() => void removeThumbnail()} style={[styles.thumbnailButton,styles.thumbnailRemove]}><Text style={styles.thumbnailButtonText}>{t('Remove')}</Text></PressableScale>}</View></View></View>
      <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{t('DVR recording')}</Text><Text style={styles.settingMeta}>{t('Save a replay after the stream ends')}</Text></View><Switch disabled={isLive} value={dvrEnabled} onValueChange={setDVREnabled} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} /></View>
	  <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{t('Adaptive live transcoding')}</Text><Text style={styles.settingMeta}>{t('Offer lower qualities automatically. Turn this off to serve the original stream directly.')}</Text></View><Switch disabled={adaptiveSettingBusy} value={adaptiveTranscodingEnabled} onValueChange={(enabled) => void updateAdaptiveTranscoding(enabled)} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} /></View>
      <Text style={styles.settingsHint}>{t(isLive ? 'Adaptive transcoding can be changed while live. Other settings require ending the stream.' : 'Settings are saved when you go live.')}</Text>
    </SwipeSheet>
  </KeyboardAvoidingView>;
}

function StudioControl({ label, icon, active, compact, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active?: boolean; compact?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return <View style={[styles.controlWrap, compact && styles.controlWrapCompact]}><PressableScale accessibilityLabel={label} onPress={onPress} style={[styles.control, compact && styles.controlCompact, active && styles.controlActive]}><Ionicons name={icon} color={active ? colors.onAccent : colors.white} size={compact ? 19 : 23} /></PressableScale>{!compact && <Text style={styles.controlLabel}>{label}</Text>}</View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.black },
  preview: { flex: 1, overflow: 'hidden', backgroundColor: colors.black },
  cameraLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  cameraDisabled: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  cameraLoadingText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 10 },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 22, backgroundColor: 'rgba(0,0,0,.38)' },
  topBarLandscape: { paddingHorizontal: 10, paddingBottom: 8 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,18,20,.75)' },
  channelCopy: { flex: 1, minWidth: 0 }, channelName: { color: colors.white, fontSize: 13, fontWeight: '900' }, liveTitle: { color: 'rgba(255,255,255,.7)', fontSize: 10, marginTop: 2 },
  livePill: { height: 28, paddingHorizontal: 10, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onAccent }, livePillText: { color: colors.onAccent, fontSize: 10, fontWeight: '900' },
  sideControls: { position: 'absolute', right: 12, top: '25%', gap: 13 }, sideControlsLandscape: { top: 'auto', right: 12, bottom: 12, flexDirection: 'row', gap: 7 }, controlWrap: { width: 70, alignItems: 'center' }, controlWrapCompact: { width: 42 }, control: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,18,20,.74)' }, controlCompact: { width: 40, height: 40, borderRadius: 20 }, controlActive: { backgroundColor: colors.accent }, controlLabel: { color: colors.white, fontSize: 9, fontWeight: '800', marginTop: 4, textAlign: 'center', textShadowColor: colors.black, textShadowRadius: 3 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 20, paddingTop: 28, backgroundColor: 'rgba(0,0,0,.48)' }, bottomLandscape: { left: 'auto', right: 205, width: 175, paddingHorizontal: 0, paddingTop: 0, backgroundColor: 'transparent' }, keepOpen: { color: 'rgba(255,255,255,.72)', fontSize: 10, marginBottom: 11 },
  liveButton: { minWidth: 172, height: 52, borderRadius: 26, paddingHorizontal: 24, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright }, endButton: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: withAlpha(colors.text, 0.2) }, disabled: { opacity: .5 }, liveButtonText: { color: colors.onAccent, fontSize: 14, fontWeight: '900' }, endButtonText: { color: colors.text },
  broadcastChat: { position: 'absolute', left: 10, width: '72%', maxWidth: 430, maxHeight: '50%', minHeight: 92, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8, borderRadius: radii.lg }, broadcastChatLandscape: { width: '48%', maxWidth: 480 }, broadcastChatHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center' }, broadcastChatTitle: { color: colors.white, fontSize: 10, fontWeight: '900', textShadowColor: colors.black, textShadowRadius: 3 }, broadcastChatAction: { width: 31, height: 31, marginLeft: 3, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.5)' }, broadcastMessages: { justifyContent: 'flex-end', gap: 6, paddingTop: 2 }, broadcastMessage: { flexDirection: 'row', alignItems: 'flex-start' }, broadcastAvatar: { width: 25, height: 25, borderRadius: 13, backgroundColor: 'rgba(255,255,255,.15)' }, broadcastMessageCopy: { flex: 1, minWidth: 0, marginLeft: 7, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, borderTopLeftRadius: 3, backgroundColor: 'rgba(0,0,0,.56)' }, broadcastName: { color: '#FCA5A5', fontSize: 9, fontWeight: '900' }, broadcastBody: { color: colors.white, fontSize: 11, lineHeight: 15, marginTop: 1, textShadowColor: colors.black, textShadowRadius: 2 },
  messageAlert: { position: 'absolute', left: 14, right: 90, zIndex: 8, minHeight: 49, maxWidth: 390, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(24,24,27,.94)' }, messageAlertAvatar: { width: 31, height: 31, borderRadius: 16, backgroundColor: colors.surfaceStrong }, messageAlertCopy: { flex: 1, minWidth: 0, marginLeft: 8 }, messageAlertName: { color: '#FCA5A5', fontSize: 9, fontWeight: '900' }, messageAlertBody: { color: colors.white, fontSize: 11, marginTop: 2 },
  chat: { ...StyleSheet.absoluteFill, paddingTop: 130, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,.42)' }, chatLandscape: { left: '50%', paddingTop: 62, backgroundColor: 'rgba(0,0,0,.68)' },
  pollAlert: { position: 'absolute', left: 14, right: 92, top: '25%', minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', backgroundColor: withAlpha(colors.accent, 0.92) }, pollAlertLandscape: { top: 72, right: '52%' }, pollAlertCopy: { flex: 1, minWidth: 0 }, pollAlertTitle: { color: colors.onAccent, fontSize: 9, fontWeight: '900', letterSpacing: .7, textTransform: 'uppercase' }, pollAlertQuestion: { color: colors.onAccent, fontSize: 11, fontWeight: '700', marginTop: 2 },
  label: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginTop: 18, marginBottom: 8 },
  orientationChoices: { flexDirection: 'row', gap: 8 }, orientationChoice: { flex: 1, minHeight: 48, paddingHorizontal: 12, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surfaceStrong }, orientationChoiceActive: { backgroundColor: colors.text }, orientationChoiceText: { color: colors.text, fontSize: 11, fontWeight: '900' }, orientationChoiceTextActive: { color: colors.onText }, orientationHint: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  resolutionChoices: { flexDirection: 'row', gap: 8 }, resolutionChoice: { flex: 1, minHeight: 55, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, resolutionChoiceActive: { backgroundColor: colors.text }, resolutionChoiceText: { color: colors.text, fontSize: 13, fontWeight: '900' }, resolutionChoiceTextActive: { color: colors.onText }, resolutionFPS: { color: colors.textMuted, fontSize: 9, fontWeight: '800', marginTop: 3 },
  cameraChoice: { minHeight: 44, paddingHorizontal: 14, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surfaceStrong }, cameraChoiceActive: { backgroundColor: colors.text }, cameraChoiceText: { color: colors.text, fontSize: 10, fontWeight: '900' }, cameraChoiceTextActive: { color: colors.onText },
  chips: { gap: 8 }, chip: { height: 38, paddingHorizontal: 15, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: colors.surfaceStrong }, chipActive: { backgroundColor: colors.text }, chipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' }, chipTextActive: { color: colors.onText },
  input: { minHeight: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvasRaised, color: colors.text, paddingHorizontal: 14, fontSize: 14 }, area: { height: 100, paddingTop: 14, textAlignVertical: 'top' },
	thumbnailRow: { flexDirection: 'row', gap: 12, alignItems: 'center' }, thumbnailPreview: { width: 118, aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: colors.canvasRaised, alignItems: 'center', justifyContent: 'center' }, thumbnailActions: { flex: 1 }, thumbnailButtons: { flexDirection: 'row', gap: 7, marginTop: 9 }, thumbnailButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, thumbnailRemove: { backgroundColor: withAlpha(colors.accentDark, 0.55) }, thumbnailButtonText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  settingRow: { minHeight: 68, marginTop: 18, paddingHorizontal: 14, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvasRaised }, settingTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, settingMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, settingsHint: { color: colors.textDim, fontSize: 10, textAlign: 'center', marginVertical: 18 },
}));
