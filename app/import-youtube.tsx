import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { YouTubeImportError, youtubeImportAPI, youtubeImportKeys, type YouTubeImportItem, type YouTubeImportPreview } from '@/api/youtubeImport';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

export default function ImportYouTubeScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { account, status } = useAuth();
  const signedIn = status === 'signedIn' && !!account;
  const { channels, activeChannelID } = useActiveChannel();
  const usableChannels = channels.filter((channel) => channel.status !== 'banned' && channel.status !== 'suspended');

  const access = useQuery({ queryKey: youtubeImportKeys.access, queryFn: youtubeImportAPI.access, enabled: signedIn });
  const available = !!access.data?.available;
  const imports = useQuery({
    queryKey: youtubeImportKeys.imports,
    queryFn: youtubeImportAPI.imports,
    enabled: signedIn && available,
    // Poll only while something is still downloading or processing.
    refetchInterval: (query) => (query.state.data ?? []).some((item) => item.status === 'downloading' || item.status === 'processing') ? 5000 : false,
  });

  const [url, setURL] = useState('');
  const [preview, setPreview] = useState<YouTubeImportPreview | null>(null);
  const [title, setTitle] = useState('');
  const [channelID, setChannelID] = useState('');
  const [explicit, setExplicit] = useState(false);
  const [rights, setRights] = useState(false);
  const [looking, setLooking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [retrying, setRetrying] = useState('');
  const [error, setError] = useState('');
  const [duplicateID, setDuplicateID] = useState('');
  const [success, setSuccess] = useState('');

  const selectedChannel = channelID || (usableChannels.some((channel) => channel.id === activeChannelID) ? activeChannelID : usableChannels[0]?.id || '');
  const limit = access.data?.daily_limit || 0;
  const usedToday = access.data?.used_today || 0;
  const limitReached = limit > 0 && usedToday >= limit;

  useEffect(() => {
    if (signedIn && available && !channels.length) router.replace('/create-channel');
  }, [available, channels.length, signedIn]);

  const handleError = (caught: unknown, fallback: string) => {
    if (caught instanceof YouTubeImportError && ['off', 'revoked', 'not_allowed', 'banned'].includes(caught.reason)) void access.refetch();
    setError(caught instanceof Error && caught.message ? caught.message : fallback);
    setDuplicateID(caught instanceof YouTubeImportError && caught.reason === 'duplicate' ? caught.videoID : '');
  };

  const lookUp = async (value = url) => {
    if (!value.trim() || looking) return;
    setError(''); setDuplicateID(''); setSuccess(''); setPreview(null); setLooking(true);
    try {
      const data = await youtubeImportAPI.preview(value.trim());
      setPreview(data); setTitle(data.title || ''); setExplicit(false); setRights(false);
      queryClient.setQueryData(youtubeImportKeys.access, (current: typeof access.data) => current ? { ...current, used_today: data.used_today, daily_limit: data.daily_limit } : current);
    } catch (caught) {
      handleError(caught, t("Couldn't look up that video. Check the link and try again."));
    } finally {
      setLooking(false);
    }
  };

  const onChangeURL = (value: string) => {
    const pasted = value.length - url.length > 8 && /youtu\.?be/i.test(value);
    setURL(value);
    if (pasted) void lookUp(value);
  };

  const reset = () => { setPreview(null); setURL(''); setTitle(''); setExplicit(false); setRights(false); };

  const submit = async () => {
    if (!preview || importing) return;
    setError(''); setDuplicateID(''); setImporting(true);
    try {
      await youtubeImportAPI.start({ url: url.trim(), channel_id: selectedChannel, title: title.trim(), explicit });
      setSuccess(t("Import started. It'll show up on your channel when it's ready. You can leave this screen."));
      reset();
      await Promise.all([access.refetch(), imports.refetch()]);
    } catch (caught) {
      handleError(caught, t("Couldn't start the import. Try again."));
    } finally {
      setImporting(false);
    }
  };

  const retry = async (item: YouTubeImportItem) => {
    setRetrying(item.id); setError('');
    try {
      await youtubeImportAPI.retry(item.id);
      await imports.refetch();
    } catch (caught) {
      handleError(caught, t("Couldn't retry the import."));
    } finally {
      setRetrying('');
    }
  };

  const limitsLine = [
    limit > 0 ? t('{used} of {limit} imports used today', { used: usedToday, limit }) : '',
    access.data?.max_duration_minutes ? formatMaxLength(access.data.max_duration_minutes, t) : '',
    access.data?.max_height ? t('Up to {height}p', { height: access.data.max_height }) : '',
  ].filter(Boolean).join(' · ');

  const header = <View style={styles.top}>
    <PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" color={colors.text} size={25} /></PressableScale>
    <View style={{ flex: 1 }}><Text style={styles.heading}>{t('Import from YouTube')}</Text><Text style={styles.subheading}>{t('Bring your videos to GilTube')}</Text></View>
  </View>;

  if (!signedIn || access.isLoading || (access.data && !available) || access.isError) {
    const reason = !signedIn ? 'signed_out' : access.data?.reason;
    return <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      {header}
      {signedIn && access.isLoading ? <ActivityIndicator style={{ marginTop: 80 }} color={colors.text} /> : <View style={styles.unavailable}>
        <View style={styles.lockIcon}><Ionicons name={reason === 'signed_out' ? 'person-circle-outline' : 'lock-closed-outline'} color={colors.textMuted} size={30} /></View>
        <Text style={styles.unavailableTitle}>{reason === 'signed_out' ? t('Sign in to import') : t("YouTube import isn't available")}</Text>
        <Text style={styles.unavailableBody}>{unavailableBody(reason, t)}</Text>
        <PressableScale onPress={() => router.replace(reason === 'signed_out' ? '/login' : '/upload')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{reason === 'signed_out' ? t('Sign in') : t('Upload a file instead')}</Text>
        </PressableScale>
      </View>}
    </View>;
  }

  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 44 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      {header}

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.playIcon}><Ionicons name="logo-youtube" color="#fff" size={22} /></View>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{t('Paste a YouTube link')}</Text><Text style={styles.cardBody}>{t("We'll bring the video, its title, description and captions over to your channel.")}</Text></View>
        </View>
        <View style={styles.urlRow}>
          <TextInput
            value={url}
            onChangeText={onChangeURL}
            onSubmitEditing={() => void lookUp()}
            placeholder="https://youtu.be/…"
            placeholderTextColor={colors.textDim}
            style={[styles.input, { flex: 1 }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            editable={!looking && !importing}
          />
          <PressableScale disabled={!url.trim() || looking || importing} onPress={() => void lookUp()} style={[styles.nextButton, (!url.trim() || looking) && { opacity: .5 }]}>
            {looking ? <ActivityIndicator color={colors.onText} /> : <Text style={styles.nextText}>{t('Next')}</Text>}
          </PressableScale>
        </View>
        {!!limitsLine && <Text style={styles.limits}>{limitsLine}</Text>}
        {!!error && <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {!!duplicateID && <PressableScale onPress={() => router.push({ pathname: '/video/[id]', params: { id: duplicateID } })}><Text style={styles.linkText}>{t('View it')}</Text></PressableScale>}
        </View>}
        {!!success && <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View>}
      </View>

      {preview && <View style={styles.card}>
        <View style={styles.previewMedia}>
          <Image source={preview.thumbnail} style={styles.previewImage} contentFit="cover" />
          {!!preview.duration_seconds && <Text style={styles.duration}>{formatDuration(preview.duration_seconds)}</Text>}
        </View>
        <Text numberOfLines={1} style={styles.from}>{t('From {channel}', { channel: preview.youtube_channel || 'YouTube' })}</Text>
        <Text numberOfLines={2} style={styles.previewTitle}>{preview.title}</Text>

        {preview.blocked_reason ? <View style={styles.warnBox}><Text style={styles.warnText}>{preview.blocked_reason}</Text></View>
          : preview.existing_video_id ? <View style={styles.warnBox}>
            <Text style={styles.warnText}>{t("You've already imported this video.")}</Text>
            <PressableScale onPress={() => router.push({ pathname: '/video/[id]', params: { id: preview.existing_video_id } })}><Text style={styles.linkText}>{t('View it')}</Text></PressableScale>
          </View>
          : <>
            <Text style={styles.label}>{t('TITLE')}</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} maxLength={200} placeholderTextColor={colors.textDim} />
            {usableChannels.length > 1 ? <>
              <Text style={styles.label}>{t('PUBLISHING CHANNEL')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{usableChannels.map((channel) => <PressableScale key={channel.id} onPress={() => setChannelID(channel.id)} style={[styles.chip, selectedChannel === channel.id && styles.chipActive]}><Text style={[styles.chipText, selectedChannel === channel.id && styles.chipTextActive]}>{channel.name}</Text></PressableScale>)}</ScrollView>
            </> : <Text style={styles.postingTo}>{t('Posting to')} <Text style={{ color: colors.text, fontWeight: '800' }}>{usableChannels[0]?.name}</Text></Text>}
            <View style={styles.toggle}><Text style={[styles.optionTitle, { flex: 1 }]}>{t('This video is for mature audiences (18+)')}</Text><Switch value={explicit} onValueChange={setExplicit} trackColor={{ true: colors.accent, false: colors.surfaceStrong }} /></View>
            <PressableScale onPress={() => setRights(!rights)} style={styles.rights}>
              <Ionicons name={rights ? 'checkbox' : 'square-outline'} color={rights ? colors.accentBright : colors.textMuted} size={22} />
              <Text style={styles.rightsText}>{t('I own this video or have permission to upload it. It will be posted to my channel as my own video.')}</Text>
            </PressableScale>
            {limitReached && <View style={styles.warnBox}><Text style={styles.warnText}>{t("You've reached today's import limit. Try again tomorrow.")}</Text></View>}
            <PressableScale
              disabled={importing || !rights || !title.trim() || !selectedChannel || limitReached}
              onPress={() => void submit()}
              style={[styles.importButton, (importing || !rights || !title.trim() || limitReached) && { opacity: .5 }]}
            >
              {importing ? <ActivityIndicator color="#fff" /> : <><Ionicons name="cloud-download" color="#fff" size={20} /><Text style={styles.importText}>{t('Import video')}</Text></>}
            </PressableScale>
            <PressableScale onPress={reset} style={styles.cancel}><Text style={styles.cancelText}>{t('Cancel')}</Text></PressableScale>
          </>}
      </View>}

      {!!imports.data?.length && <>
        <Text style={styles.label}>{t('YOUR IMPORTS')}</Text>
        <View style={styles.list}>
          {imports.data.map((item, index) => <View key={item.id} style={[styles.item, index > 0 && styles.itemBorder]}>
            <Image source={resolveMediaURL(item.thumbnail)} style={styles.itemThumb} contentFit="cover" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.itemMeta}>{item.channel_name}</Text>
              <View style={[styles.status, statusStyle(item.status, styles)]}><Text style={[styles.statusText, statusTextStyle(item.status, styles)]}>{statusLabel(item, t)}</Text></View>
              {item.status === 'failed' && !!item.error && <Text numberOfLines={2} style={styles.itemError}>{item.error}</Text>}
            </View>
            {item.status === 'ready' && <PressableScale onPress={() => router.push({ pathname: '/video/[id]', params: { id: item.video_id } })} style={styles.itemAction}><Text style={styles.itemActionText}>{t('Watch')}</Text></PressableScale>}
            {item.status === 'failed' && <PressableScale disabled={retrying === item.id} onPress={() => void retry(item)} style={[styles.itemAction, styles.itemActionSecondary]}>
              {retrying === item.id ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={[styles.itemActionText, { color: colors.text }]}>{t('Try again')}</Text>}
            </PressableScale>}
          </View>)}
        </View>
        <Text style={styles.limits}>{t('Imports keep going in the background. You can close this screen.')}</Text>
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

type Translate = (source: string, values?: Record<string, string | number>) => string;

function unavailableBody(reason: string | undefined, t: Translate) {
  switch (reason) {
    case 'signed_out': return t('Sign in to bring your YouTube videos to your GilTube channel.');
    case 'revoked': return t('YouTube import has been turned off for your account. You can still upload video files.');
    case 'not_allowed': return t('YouTube import is only open to invited creators right now. You can still upload video files.');
    case 'banned': return t("Your account can't upload videos.");
    default: return t('Importing from YouTube is turned off right now. You can still upload video files.');
  }
}

function formatMaxLength(minutes: number, t: Translate) {
  if (minutes % 60 === 0) return minutes === 60 ? t('Up to 1 hour long') : t('Up to {hours} hours long', { hours: minutes / 60 });
  return t('Up to {minutes} minutes long', { minutes });
}

function statusLabel(item: YouTubeImportItem, t: Translate) {
  switch (item.status) {
    case 'downloading': return t('Downloading');
    case 'processing': return item.progress > 0 ? t('Processing {percent}%', { percent: item.progress }) : t('Processing');
    case 'ready': return t('Ready');
    default: return t('Failed');
  }
}

function statusStyle(status: string, styles: ReturnType<typeof useStyles>) {
  return status === 'ready' ? styles.statusReady : status === 'failed' ? styles.statusFailed : null;
}
function statusTextStyle(status: string, styles: ReturnType<typeof useStyles>) {
  return status === 'ready' ? styles.statusReadyText : status === 'failed' ? styles.statusFailedText : null;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const useStyles = makeStyles(() => ({
  keyboard: { flex: 1, backgroundColor: colors.screen },
  screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { color: colors.text, fontSize: 26, fontWeight: '900' },
  subheading: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  card: { marginTop: 20, padding: 16, borderRadius: radii.xl, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardBody: { color: colors.textMuted, fontSize: 11, marginTop: 3, lineHeight: 16 },
  urlRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  input: { minHeight: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.screen, color: colors.text, paddingHorizontal: 14, fontSize: 14 },
  nextButton: { minWidth: 76, height: 50, paddingHorizontal: 16, borderRadius: radii.lg, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  nextText: { color: colors.onText, fontSize: 13, fontWeight: '900' },
  limits: { color: colors.textDim, fontSize: 10, marginTop: 10 },
  errorBox: { marginTop: 12, padding: 12, borderRadius: radii.md, backgroundColor: 'rgba(127,29,29,0.45)', gap: 6 },
  errorText: { color: '#fecaca', fontSize: 12, fontWeight: '700' },
  successBox: { marginTop: 12, padding: 12, borderRadius: radii.md, backgroundColor: 'rgba(20,83,45,0.45)' },
  successText: { color: '#bbf7d0', fontSize: 12, fontWeight: '700' },
  warnBox: { marginTop: 14, padding: 12, borderRadius: radii.md, backgroundColor: 'rgba(120,53,15,0.45)', gap: 6 },
  warnText: { color: '#fde68a', fontSize: 12, fontWeight: '700' },
  linkText: { color: colors.text, fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' },
  previewMedia: { aspectRatio: 16 / 9, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#000' },
  previewImage: { width: '100%', height: '100%' },
  duration: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  from: { color: colors.textMuted, fontSize: 11, marginTop: 12 },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 3 },
  label: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 22, marginBottom: 8 },
  chips: { gap: 8 },
  chip: { height: 38, paddingHorizontal: 15, borderRadius: radii.pill, backgroundColor: colors.screen, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.text },
  chipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  chipTextActive: { color: colors.onText },
  postingTo: { color: colors.textMuted, fontSize: 12, marginTop: 16 },
  toggle: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  optionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  rights: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.screen },
  rightsText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  importButton: { height: 54, marginTop: 18, borderRadius: radii.lg, backgroundColor: '#dc2626', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  importText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  cancel: { height: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  list: { borderRadius: radii.xl, backgroundColor: colors.surface, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  itemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  itemThumb: { width: 104, aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: '#000' },
  itemTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  itemMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  status: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong },
  statusText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  statusReady: { backgroundColor: 'rgba(20,83,45,0.6)' },
  statusReadyText: { color: '#86efac' },
  statusFailed: { backgroundColor: 'rgba(127,29,29,0.6)' },
  statusFailedText: { color: '#fca5a5' },
  itemError: { color: '#fca5a5', fontSize: 10, marginTop: 4 },
  itemAction: { minWidth: 64, height: 34, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  itemActionSecondary: { backgroundColor: colors.surfaceStrong },
  itemActionText: { color: colors.onText, fontSize: 11, fontWeight: '900' },
  unavailable: { marginTop: 40, padding: 24, borderRadius: radii.xl, backgroundColor: colors.surface, alignItems: 'center' },
  lockIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.screen, alignItems: 'center', justifyContent: 'center' },
  unavailableTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  unavailableBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: 'center' },
  secondaryButton: { marginTop: 18, height: 46, paddingHorizontal: 20, borderRadius: radii.lg, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.onText, fontSize: 13, fontWeight: '900' },
}));
