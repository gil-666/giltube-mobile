import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import type { SearchResult, Video } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export default function WatchPartiesScreen() {
  const insets = useSafeAreaInsets();
  const { t, number } = useI18n();
  const { video: initialVideoID = '', start = '0' } = useLocalSearchParams<{ video?: string; start?: string }>();
  const { status } = useAuth();
  const { activeChannelID } = useActiveChannel();
  const signedIn = status === 'signedIn';
  const [createOpen, setCreateOpen] = useState(!!initialVideoID);
  const [selectedVideo, setSelectedVideo] = useState<Video | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [partyType, setPartyType] = useState<'single' | 'queue'>('queue');

  const parties = useQuery({ queryKey: ['watch-parties-public'], queryFn: giltubeAPI.publicWatchParties, refetchInterval: 20_000 });
  const initialVideo = useQuery({ queryKey: ['video', initialVideoID], queryFn: () => giltubeAPI.video(initialVideoID), enabled: !!initialVideoID });
  const search = useQuery({ queryKey: ['watch-party-search', query.trim()], queryFn: () => giltubeAPI.search(query.trim(), 1), enabled: query.trim().length >= 2 });
  const videoResults = useMemo(() => (search.data?.results || []).filter((item) => item.type === 'video').slice(0, 12), [search.data?.results]);
  const effectiveVideo = selectedVideo === undefined ? initialVideo.data || null : selectedVideo;

  const create = useMutation({
    mutationFn: () => giltubeAPI.createWatchParty({ videoID: effectiveVideo!.id, title: title.trim(), visibility, partyType, channelID: activeChannelID, startTimeSeconds: Math.max(0, Number(start) || 0) }),
    onSuccess: ({ id }) => { setCreateOpen(false); router.replace({ pathname: '/watch-party/[id]', params: { id } }); },
    onError: (error) => Alert.alert(t('Could not start the party'), error.message),
  });

  const openCreate = () => {
    if (!signedIn) { router.push('/login'); return; }
    if (!activeChannelID) { Alert.alert(t('Channel needed'), t('Create or select a channel before starting a watch party.')); return; }
    setCreateOpen(true);
  };
  const join = (id: string) => {
    if (!signedIn) { router.push('/login'); return; }
    router.push({ pathname: '/watch-party/[id]', params: { id } });
  };
  const chooseResult = async (result: SearchResult) => {
    try { setSelectedVideo(await giltubeAPI.video(result.id)); setQuery(''); } catch (error) { Alert.alert(t('Could not select video'), error instanceof Error ? error.message : t('Please try again.')); }
  };

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <PressableScale accessibilityLabel={t('Go back')} onPress={() => router.back()} style={styles.headerButton}><Ionicons name="chevron-back" size={25} color={colors.text} /></PressableScale>
      <View style={styles.headerCopy}><Text style={styles.heading}>{t('Watch parties')}</Text><Text style={styles.subtitle}>{t('Watch together, wherever you are')}</Text></View>
      <PressableScale accessibilityLabel={t('Start watch party')} onPress={openCreate} style={styles.createIcon}><Ionicons name="add" size={26} color={colors.white} /></PressableScale>
    </View>
    <ScrollView refreshControl={<RefreshControl refreshing={parties.isRefetching} onRefresh={() => void parties.refetch()} tintColor={colors.accentBright} />} contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="people" color={colors.accentBright} size={28} /></View>
        <Text style={styles.heroTitle}>{t('Your room. Everyone in sync.')}</Text>
        <Text style={styles.heroBody}>{t('Create a room for any GilTube video, chat live, build a queue, and decide who controls playback.')}</Text>
        <PressableScale onPress={openCreate} style={styles.primary}><Ionicons name="play" size={17} color={colors.white} /><Text style={styles.primaryText}>{t('Start a watch party')}</Text></PressableScale>
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('Live now')}</Text><Text style={styles.sectionMeta}>{number(parties.data?.length || 0)} {t('public rooms')}</Text></View>
      {parties.isLoading && <ActivityIndicator style={styles.loader} color={colors.accentBright} />}
      {parties.isError && <PressableScale onPress={() => void parties.refetch()} style={styles.errorCard}><Text style={styles.errorTitle}>{t('Couldn’t load live rooms')}</Text><Text style={styles.errorBody}>{t('Tap to try again.')}</Text></PressableScale>}
      {!parties.isLoading && !parties.data?.length && <View style={styles.empty}><Ionicons name="moon-outline" size={30} color={colors.textDim} /><Text style={styles.emptyTitle}>{t('It’s quiet right now')}</Text><Text style={styles.emptyBody}>{t('Be the first to start a public room.')}</Text></View>}
      <View style={styles.grid}>{parties.data?.map((party) => <PressableScale key={party.id} onPress={() => join(party.id)} style={styles.partyCard}>
        <View style={styles.thumbnail}><Image source={resolveMediaURL(party.thumbnail_url)} style={StyleSheet.absoluteFill} contentFit="cover" /><View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>{t('LIVE')}</Text></View><View style={styles.peopleBadge}><Ionicons name="people" size={12} color={colors.white} /><Text style={styles.peopleText}>{number(party.participant_count)}</Text></View></View>
        <Text numberOfLines={2} style={styles.partyTitle}>{party.title || party.video_title}</Text>
        <Text numberOfLines={1} style={styles.videoTitle}>{party.video_title}</Text>
        <Text numberOfLines={1} style={styles.channel}>{party.channel_name}</Text>
      </PressableScale>)}</View>
    </ScrollView>

    <SwipeSheet visible={createOpen} title={t('Start a watch party')} onClose={() => setCreateOpen(false)}>
      {effectiveVideo ? <View style={styles.selected}><Image source={resolveMediaURL(effectiveVideo.thumbnail_url)} style={styles.selectedThumb} contentFit="cover" /><View style={styles.selectedCopy}><Text numberOfLines={2} style={styles.selectedTitle}>{effectiveVideo.title}</Text><Text numberOfLines={1} style={styles.selectedChannel}>{effectiveVideo.channel?.name || 'GilTube'}</Text></View><PressableScale onPress={() => setSelectedVideo(null)} style={styles.clearVideo}><Ionicons name="close" size={20} color={colors.textMuted} /></PressableScale></View> : <>
        <Text style={styles.fieldLabel}>{t('CHOOSE A VIDEO')}</Text>
        <View style={styles.searchBox}><Ionicons name="search" size={19} color={colors.textDim} /><TextInput value={query} onChangeText={setQuery} autoFocus={!initialVideoID} placeholder={t('Search GilTube videos')} placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>
        {search.isFetching && <ActivityIndicator style={{ margin: 18 }} color={colors.accentBright} />}
        {videoResults.map((result) => <PressableScale key={result.id} onPress={() => void chooseResult(result)} style={styles.result}><Image source={resolveMediaURL(result.thumbnail || '')} style={styles.resultThumb} contentFit="cover" /><View style={{ flex: 1 }}><Text numberOfLines={2} style={styles.resultTitle}>{result.title}</Text><Text numberOfLines={1} style={styles.resultMeta}>{result.channel || 'GilTube'}</Text></View></PressableScale>)}
      </>}
      {!!effectiveVideo && <>
        <Text style={styles.fieldLabel}>{t('ROOM NAME')} <Text style={styles.optional}>{t('OPTIONAL')}</Text></Text>
        <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder={effectiveVideo.title} placeholderTextColor={colors.textDim} style={styles.textField} />
        <Text style={styles.fieldLabel}>{t('WHO CAN JOIN')}</Text>
        <View style={styles.options}><Choice selected={visibility === 'public'} icon="globe-outline" title={t('Public')} subtitle={t('Shown in Live now')} onPress={() => setVisibility('public')} /><Choice selected={visibility === 'private'} icon="lock-closed-outline" title={t('Private')} subtitle={t('Invite link only')} onPress={() => setVisibility('private')} /></View>
        <Text style={styles.fieldLabel}>{t('ROOM TYPE')}</Text>
        <View style={styles.options}><Choice selected={partyType === 'queue'} icon="list-outline" title={t('Queue')} subtitle={t('Add more videos')} onPress={() => setPartyType('queue')} /><Choice selected={partyType === 'single'} icon="play-circle-outline" title={t('Single video')} subtitle={t('One and done')} onPress={() => setPartyType('single')} /></View>
        <PressableScale disabled={create.isPending} onPress={() => create.mutate()} style={[styles.startButton, create.isPending && { opacity: .6 }]}>{create.isPending ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="people" size={19} color={colors.white} /><Text style={styles.startText}>{t('Create room')}</Text></>}</PressableScale>
      </>}
    </SwipeSheet>
  </View>;
}

function Choice({ selected, icon, title, subtitle, onPress }: { selected: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return <PressableScale onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Ionicons name={icon} size={21} color={selected ? colors.accentBright : colors.textMuted} /><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceSubtitle}>{subtitle}</Text>{selected && <Ionicons name="checkmark-circle" size={18} color={colors.accentBright} style={styles.check} />}</PressableScale>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, header: { minHeight: 86, paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.canvasRaised }, headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, marginLeft: 3 }, heading: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -.5 }, subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, createIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  hero: { overflow: 'hidden', borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#190D10', padding: 20 }, heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(239,68,68,.12)', alignItems: 'center', justifyContent: 'center' }, heroTitle: { color: colors.text, fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: -.6, marginTop: 15 }, heroBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8 }, primary: { alignSelf: 'flex-start', height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 17, borderRadius: radii.pill, backgroundColor: colors.accent, marginTop: 18 }, primaryText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', marginTop: 28, marginBottom: 13 }, sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' }, sectionMeta: { color: colors.textDim, fontSize: 11, marginLeft: 'auto' }, loader: { marginVertical: 36 }, errorCard: { padding: 20, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong }, errorTitle: { color: colors.text, fontWeight: '800', textAlign: 'center' }, errorBody: { color: colors.textMuted, marginTop: 5, textAlign: 'center' }, empty: { alignItems: 'center', padding: 34, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 10 }, emptyBody: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, grid: { gap: 13 }, partyCard: { padding: 10, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, thumbnail: { aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, liveBadge: { position: 'absolute', left: 8, top: 8, height: 24, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: 'rgba(220,38,38,.94)' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white }, liveText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: .8 }, peopleBadge: { position: 'absolute', right: 8, bottom: 8, height: 24, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: 'rgba(0,0,0,.76)' }, peopleText: { color: colors.white, fontSize: 10, fontWeight: '800' }, partyTitle: { color: colors.text, fontSize: 15, fontWeight: '900', lineHeight: 19, marginTop: 11 }, videoTitle: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, channel: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  selected: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: radii.lg, backgroundColor: colors.canvasRaised, borderWidth: 1, borderColor: colors.border, marginBottom: 15 }, selectedThumb: { width: 92, aspectRatio: 16 / 9, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong }, selectedCopy: { flex: 1, marginLeft: 11 }, selectedTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, selectedChannel: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, clearVideo: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, fieldLabel: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginTop: 13, marginBottom: 7 }, optional: { color: colors.textDim, fontWeight: '500' }, searchBox: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, searchInput: { flex: 1, height: 48, color: colors.text, fontSize: 14 }, textField: { height: 48, paddingHorizontal: 13, borderRadius: radii.md, backgroundColor: colors.surfaceStrong, color: colors.text, fontSize: 14 }, result: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, resultThumb: { width: 88, aspectRatio: 16 / 9, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong }, resultTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, resultMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, options: { flexDirection: 'row', gap: 9 }, choice: { flex: 1, minHeight: 90, padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvasRaised }, choiceSelected: { borderColor: colors.borderStrong, backgroundColor: 'rgba(127,29,29,.15)' }, choiceTitle: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: 8 }, choiceSubtitle: { color: colors.textMuted, fontSize: 9, marginTop: 2 }, check: { position: 'absolute', top: 10, right: 10 }, startButton: { height: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: radii.lg, backgroundColor: colors.accent, marginTop: 22, marginBottom: 6 }, startText: { color: colors.white, fontSize: 14, fontWeight: '900' },
});
