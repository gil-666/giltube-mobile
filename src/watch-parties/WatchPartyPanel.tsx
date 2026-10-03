import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { GiphyPicker } from '@/components/GiphyPicker';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { usePlayer } from '@/player/PlayerProvider';
import { colors, radii } from '@/theme/tokens';
import type { SearchResult, WatchPartyMessage } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

type PartySheet = 'queue' | 'people' | null;

export function WatchPartyPanel() {
  const { account } = useAuth();
  const { t, number } = useI18n();
  const { activeChannelID } = useActiveChannel();
  const { watchParty, refreshWatchParty, leaveWatchParty } = usePlayer();
  const [sheet, setSheet] = useState<PartySheet>(null);
  const [inviteQuery, setInviteQuery] = useState('');
  const [queueQuery, setQueueQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const party = watchParty?.party;
  const isHost = !!party && party.host_user_id === account?.id;
  const me = watchParty?.participants.find((person) => person.user_id === account?.id);
  const canSuggest = isHost || !!me?.can_suggest;
  const inviteSearch = useQuery({
    queryKey: ['watch-party-member-search', inviteQuery.trim()],
    queryFn: () => giltubeAPI.search(inviteQuery.trim(), 1),
    enabled: sheet === 'people' && isHost && inviteQuery.trim().length >= 2,
  });
  const queueSearch = useQuery({
    queryKey: ['watch-party-video-search', queueQuery.trim()],
    queryFn: () => giltubeAPI.search(queueQuery.trim(), 1),
    enabled: sheet === 'queue' && canSuggest && queueQuery.trim().length >= 2,
  });
  const memberResults = useMemo(() => (inviteSearch.data?.results || []).filter((result) => result.type === 'channel').slice(0, 8), [inviteSearch.data?.results]);
  const videoResults = useMemo(() => (queueSearch.data?.results || []).filter((result): result is SearchResult => result.type === 'video').slice(0, 8), [queueSearch.data?.results]);

  if (!watchParty || !party) return null;
  const refresh = () => void refreshWatchParty().catch(() => undefined);
  const act = async (operation: () => Promise<unknown>, label = t('Party action failed')) => {
    try { setBusy(true); await operation(); refresh(); }
    catch (error) { Alert.alert(label, error instanceof Error ? error.message : t('Please try again.')); }
    finally { setBusy(false); }
  };
  const share = () => void Share.share({
    title: party.title,
    message: `${t('Join my GilTube watch party')}\nhttps://giltube.gilservers.com/watch-party/${party.id}`,
    url: `https://giltube.gilservers.com/watch-party/${party.id}`,
  });
  const leave = () => Alert.alert(
    t(isHost ? 'End watch party?' : 'Leave watch party?'),
    t(isHost ? 'This ends the room for everyone.' : 'You can rejoin while the room is still active.'),
    [{ text: t('Cancel'), style: 'cancel' }, { text: t(isHost ? 'End party' : 'Leave'), style: 'destructive', onPress: () => void leaveWatchParty().catch((error) => Alert.alert(t('Could not leave'), error instanceof Error ? error.message : t('Please try again.'))) }],
  );
  const invite = (result: SearchResult) => void act(async () => {
    const response = await giltubeAPI.inviteToWatchParty(party.id, result.id, activeChannelID);
    setInviteQuery('');
    Alert.alert(t(response.status === 'already_invited' ? 'Already invited' : 'Invitation sent'), `${result.name || result.title} ${t(response.status === 'already_invited' ? 'already has an unread invitation.' : 'will receive a GilTube notification.')}`);
  }, t('Invitation failed'));

  return <>
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.live}><View style={styles.dot} /><Text style={styles.liveText}>{t('LIVE WATCH PARTY')}</Text></View>
        <Text numberOfLines={1} style={styles.title}>{party.title}</Text>
        <Text style={styles.subtitle}>{t('Hosted by')} {watchParty.host.name} · {number(watchParty.participants.length)} {t('watching')}</Text>
      </View>
      <View style={styles.actions}>
        {party.party_type === 'queue' && <PartyAction icon="list-outline" label={`${t('Queue')} ${number(watchParty.queue.length)}`} onPress={() => setSheet('queue')} />}
        <PartyAction icon={isHost ? 'person-add-outline' : 'people-outline'} label={t(isHost ? 'Invite' : 'People')} onPress={() => setSheet('people')} />
        <PartyAction icon="share-outline" label={t('Share')} onPress={share} />
        <PartyAction icon="exit-outline" label={t(isHost ? 'End' : 'Leave')} danger onPress={leave} />
      </View>
      <View style={styles.syncRow}>
        <Ionicons name={party.sync_mode === 'open' ? 'hand-left-outline' : 'lock-closed-outline'} size={15} color={colors.textMuted} />
        <Text style={styles.syncText}>{party.sync_mode === 'open' ? t('Everyone can control playback') : isHost ? t('Only you control playback') : `${watchParty.host.name} ${t('controls playback')}`}</Text>
        {isHost && <PressableScale disabled={busy} onPress={() => void act(() => giltubeAPI.setWatchPartySyncMode(party.id, party.sync_mode === 'open' ? 'host-only' : 'open'))} style={styles.change}><Text style={styles.changeText}>{t('Change')}</Text></PressableScale>}
      </View>
    </View>

    <WatchPartyChat />

    <SwipeSheet visible={sheet === 'queue'} title={t('Party queue')} onClose={() => setSheet(null)}>
      {canSuggest && <View style={styles.search}><Ionicons name="search" size={18} color={colors.textDim} /><TextInput value={queueQuery} onChangeText={setQueueQuery} placeholder={t('Find a video to add')} placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>}
      {queueSearch.isFetching && <ActivityIndicator color={colors.accentBright} />}
      {videoResults.map((result) => <ResultRow key={result.id} result={result} icon="add-circle" onPress={() => void act(async () => { await giltubeAPI.addWatchPartyQueueItem(party.id, result.id); setQueueQuery(''); })} />)}
      {!watchParty.queue.length && <Text style={styles.empty}>{t('The queue is empty.')}</Text>}
      {watchParty.queue.map((item) => <View key={item.id} style={styles.row}><Image source={resolveMediaURL(item.thumbnail_url)} style={styles.thumb} contentFit="cover" /><View style={styles.rowCopy}><Text numberOfLines={2} style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{t('Added by')} {item.added_by}</Text></View>{isHost && <><PressableScale onPress={() => void act(() => giltubeAPI.playWatchPartyQueueItem(party.id, item.id))} style={styles.rowAction}><Ionicons name="play" size={18} color={colors.success} /></PressableScale><PressableScale onPress={() => void act(() => giltubeAPI.removeWatchPartyQueueItem(party.id, item.id))} style={styles.rowAction}><Ionicons name="trash-outline" size={17} color={colors.accentBright} /></PressableScale></>}</View>)}
    </SwipeSheet>

    <SwipeSheet visible={sheet === 'people'} title={t('Members and invitations')} onClose={() => setSheet(null)}>
      {isHost && <><Text style={styles.sectionLabel}>{t('INVITE GILTUBE MEMBERS')}</Text><View style={styles.search}><Ionicons name="search" size={18} color={colors.textDim} /><TextInput value={inviteQuery} onChangeText={setInviteQuery} placeholder={t('Search GilTube users or channels')} placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>{inviteSearch.isFetching && <ActivityIndicator color={colors.accentBright} />}{memberResults.map((result) => <ResultRow key={result.id} result={result} icon="paper-plane-outline" onPress={() => invite(result)} />)}</>}
      <Text style={styles.sectionLabel}>{t('IN THE ROOM')}</Text>
      {watchParty.participants.map((person) => <View key={person.user_id} style={styles.person}><Avatar name={person.name} uri={person.avatar_url} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{person.name}{person.user_id === account?.id ? ` (${t('you')})` : ''}</Text><Text style={styles.rowMeta}>{t(person.is_host ? 'Host' : person.can_suggest ? 'Can add to queue' : 'Member')}</Text></View>{isHost && !person.is_host && <><PressableScale accessibilityLabel={t('Toggle queue permission')} onPress={() => void act(() => giltubeAPI.setWatchPartySuggestPermission(party.id, person.user_id, !person.can_suggest))} style={styles.rowAction}><Ionicons name={person.can_suggest ? 'remove-circle-outline' : 'add-circle-outline'} size={19} color={colors.textMuted} /></PressableScale><PressableScale accessibilityLabel={t('Make host')} onPress={() => Alert.alert(t('Transfer host?'), `${person.name} ${t('will become the party host.')}`, [{ text: t('Cancel'), style: 'cancel' }, { text: t('Transfer'), onPress: () => void act(() => giltubeAPI.transferWatchPartyHost(party.id, person.user_id)) }])} style={styles.rowAction}><Ionicons name="key-outline" size={18} color={colors.warning} /></PressableScale></>}</View>)}
    </SwipeSheet>
  </>;
}

export function WatchPartyChat({ overlay = false, onHide }: { overlay?: boolean; onHide?: () => void }) {
  const { account } = useAuth();
  const { t, number } = useI18n();
  const { activeChannelID } = useActiveChannel();
  const { watchParty, refreshWatchParty } = usePlayer();
  const [message, setMessage] = useState('');
  const [gifOpen, setGIFOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<ScrollView>(null);

  if (!watchParty) return null;
  const party = watchParty.party;
  const act = async (operation: () => Promise<unknown>, label: string) => {
    try {
      setBusy(true);
      await operation();
      void refreshWatchParty().catch(() => undefined);
    } catch (error) {
      Alert.alert(t(label), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  const sendMessage = async () => {
    const value = message.trim();
    if (!value || busy) return;
    setMessage('');
    await act(() => giltubeAPI.watchPartyChat(party.id, { message: value, channelID: activeChannelID }), 'Message failed');
  };
  const sendGIF = (url: string) => void act(() => giltubeAPI.watchPartyChat(party.id, { gifURL: url, channelID: activeChannelID }), 'GIF failed');

  return <>
    <View style={[styles.chatSurface, overlay && styles.chatSurfaceOverlay]}>
      <View style={styles.chatHeader}>
        <View style={styles.chatHeaderIcon}><Ionicons name="chatbubbles" size={16} color={colors.accentBright} /></View>
        <View style={styles.chatHeaderCopy}><Text style={styles.chatTitle}>{t('Party chat')}</Text><Text style={styles.chatSubtitle}>{number(watchParty.participants.length)} {t('watching live')}</Text></View>
        {!!onHide && <PressableScale accessibilityLabel={t('Hide party chat')} onPress={onHide} style={styles.chatHide}><Ionicons name="chevron-forward" size={21} color={colors.text} /></PressableScale>}
      </View>
      <ScrollView ref={listRef} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} style={overlay ? styles.chatMessagesOverlay : styles.chatMessagesInline} contentContainerStyle={styles.chatMessagesContent}>
        {!watchParty.messages.length && <View style={styles.chatEmpty}><Ionicons name="chatbubble-ellipses-outline" size={25} color={colors.textDim} /><Text style={styles.empty}>{t('No messages yet. Say hello.')}</Text></View>}
        {watchParty.messages.slice(overlay ? -40 : -80).map((item) => <ChatMessage key={item.id} item={item} mine={item.actor.user_id === account?.id} compact={overlay} />)}
      </ScrollView>
      <View style={styles.reactions}>{['❤️', '😂', '😮', '👏'].map((reaction) => <PressableScale disabled={busy} key={reaction} onPress={() => void act(() => giltubeAPI.watchPartyChat(party.id, { reaction, channelID: activeChannelID }), t('Reaction failed'))} style={styles.reaction}><Text style={styles.reactionText}>{reaction}</Text></PressableScale>)}</View>
      <View style={styles.composer}><PressableScale disabled={busy} onPress={() => setGIFOpen(true)} style={styles.gif}><Text style={styles.gifText}>GIF</Text></PressableScale><TextInput value={message} onChangeText={setMessage} onSubmitEditing={() => void sendMessage()} returnKeyType="send" placeholder={t('Message the room')} placeholderTextColor={colors.textDim} style={styles.input} /><PressableScale disabled={!message.trim() || busy} onPress={() => void sendMessage()} style={styles.send}><Ionicons name="send" size={18} color={message.trim() ? colors.accentBright : colors.textDim} /></PressableScale></View>
    </View>
    <GiphyPicker visible={gifOpen} onClose={() => setGIFOpen(false)} onSelect={sendGIF} />
  </>;
}

function PartyAction({ icon, label, danger, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }) {
  return <PressableScale onPress={onPress} style={styles.action}><Ionicons name={icon} size={20} color={danger ? colors.accentBright : colors.text} /><Text style={[styles.actionText, danger && { color: colors.accentBright }]}>{label}</Text></PressableScale>;
}

function Avatar({ name, uri }: { name: string; uri?: string }) {
  return uri ? <Image source={resolveMediaURL(uri)} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text></View>;
}

function ResultRow({ result, icon, onPress }: { result: SearchResult; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { t } = useI18n(); return <PressableScale onPress={onPress} style={styles.row}><Image source={resolveMediaURL(result.avatar || result.thumbnail || '')} style={result.type === 'channel' ? styles.avatar : styles.thumb} contentFit="cover" /><View style={styles.rowCopy}><Text numberOfLines={2} style={styles.rowTitle}>{result.name || result.title}</Text><Text numberOfLines={1} style={styles.rowMeta}>{result.type === 'channel' ? t('GilTube member') : result.channel || t('Video')}</Text></View><Ionicons name={icon} size={20} color={colors.accentBright} /></PressableScale>;
}

function ChatMessage({ item, mine, compact = false }: { item: WatchPartyMessage; mine: boolean; compact?: boolean }) {
  const { t, dateTime } = useI18n(); return <View style={[styles.message, compact && styles.messageCompact, mine && styles.messageMine]}><View style={styles.messageTop}>{!compact && <Avatar name={item.actor.name} uri={item.actor.avatar_url} />}<Text style={[styles.messageName, compact && styles.messageNameCompact]}>{mine ? t('You') : item.actor.name}</Text><Text style={styles.messageTime}>{dateTime(item.created_at, { hour: '2-digit', minute: '2-digit' })}</Text></View>{!!item.message && <Text style={styles.messageBody}>{item.message}</Text>}{!!item.reaction && <Text style={styles.bigReaction}>{item.reaction}</Text>}{!!item.gif_url && <Image source={item.gif_url} style={[styles.messageGif, compact && styles.messageGifCompact]} contentFit="cover" />}</View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 0, marginHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: '#5A2026', borderRadius: radii.lg, backgroundColor: '#211114', overflow: 'hidden' },
  heading: { paddingHorizontal: 15, paddingTop: 14 }, live: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentBright }, liveText: { color: colors.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 5 }, subtitle: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  actions: { flexDirection: 'row', paddingHorizontal: 5, marginTop: 10 }, action: { flex: 1, minWidth: 55, height: 58, alignItems: 'center', justifyContent: 'center', gap: 5 }, actionText: { color: colors.text, fontSize: 9, fontWeight: '800' },
  syncRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#5A2026' }, syncText: { flex: 1, color: colors.textMuted, fontSize: 10 }, change: { padding: 8 }, changeText: { color: colors.accentBright, fontSize: 10, fontWeight: '900' },
  chatSurface: { marginHorizontal: 14, marginBottom: 18, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface }, chatSurfaceOverlay: { flex: 1, marginHorizontal: 0, marginBottom: 0, borderColor: 'rgba(255,255,255,.14)', backgroundColor: 'rgba(13,13,16,.86)' }, chatHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, chatHeaderIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(239,68,68,.12)' }, chatHeaderCopy: { flex: 1, marginLeft: 9 }, chatTitle: { color: colors.text, fontSize: 14, fontWeight: '900' }, chatSubtitle: { color: colors.textMuted, fontSize: 9, marginTop: 2 }, chatHide: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.surfaceStrong }, chatMessagesInline: { minHeight: 120, maxHeight: 320 }, chatMessagesOverlay: { flex: 1 }, chatMessagesContent: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 12 }, chatEmpty: { flex: 1, minHeight: 110, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 10 }, reactions: { flexDirection: 'row', gap: 8, marginTop: 10 }, reaction: { width: 42, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceStrong }, reactionText: { fontSize: 17 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, gif: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceStrong }, gifText: { color: colors.text, fontSize: 9, fontWeight: '900' }, input: { flex: 1, height: 43, paddingHorizontal: 13, borderRadius: 22, backgroundColor: colors.surfaceStrong, color: colors.text }, send: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  search: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 8, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, searchInput: { flex: 1, height: 46, color: colors.text }, sectionLabel: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 9, marginBottom: 8 },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, rowMeta: { color: colors.textMuted, fontSize: 9, marginTop: 3 }, rowAction: { width: 35, height: 42, alignItems: 'center', justifyContent: 'center' }, thumb: { width: 82, aspectRatio: 16 / 9, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong }, person: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceStrong }, avatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDark }, avatarLetter: { color: colors.white, fontWeight: '900' },
  message: { alignSelf: 'flex-start', maxWidth: '90%', padding: 10, marginBottom: 9, borderRadius: 14, borderTopLeftRadius: 4, backgroundColor: colors.surfaceStrong }, messageCompact: { paddingHorizontal: 9, paddingVertical: 7, marginBottom: 7, backgroundColor: 'rgba(50,50,55,.92)' }, messageMine: { alignSelf: 'flex-end', borderTopLeftRadius: 14, borderTopRightRadius: 4, backgroundColor: '#3B171B' }, messageTop: { minWidth: 150, flexDirection: 'row', alignItems: 'center' }, messageName: { flex: 1, color: colors.textMuted, fontSize: 9, fontWeight: '800', marginLeft: 7 }, messageNameCompact: { marginLeft: 0 }, messageTime: { color: colors.textDim, fontSize: 8, marginLeft: 10 }, messageBody: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 7 }, bigReaction: { fontSize: 27, marginTop: 5 }, messageGif: { width: 210, aspectRatio: 1.3, borderRadius: radii.md, marginTop: 8, backgroundColor: colors.canvasRaised }, messageGifCompact: { width: 180 },
});
