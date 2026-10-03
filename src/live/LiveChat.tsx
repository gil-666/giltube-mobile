import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { GiphyPicker } from '@/components/GiphyPicker';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import type { LiveChatMessage, LivePoll } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export function LiveChat({ channelID, live, overlay = false, hideIcon = 'chevron-forward', onHide }: { channelID: string; live: boolean; overlay?: boolean; hideIcon?: 'chevron-forward' | 'close'; onHide?: () => void }) {
  const { account, status } = useAuth();
  const { t } = useI18n();
  const { activeChannelID, channels } = useActiveChannel();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [gifOpen, setGIFOpen] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [dismissedPollID, setDismissedPollID] = useState('');
  const listRef = useRef<ScrollView>(null);
  const messages = useQuery({
    queryKey: ['live-chat', channelID],
    queryFn: () => giltubeAPI.liveChatMessages(channelID, 120),
    enabled: !!channelID,
    refetchInterval: live ? (overlay ? 2_500 : 4_000) : false,
  });
  const poll = useQuery({
    queryKey: ['live-poll', channelID, activeChannelID],
    queryFn: () => giltubeAPI.livePoll(channelID, activeChannelID),
    enabled: !!channelID,
    refetchInterval: channelID ? (live ? 2_500 : 5_000) : false,
  });
  const signedIn = status === 'signedIn' && !!account;
  const canManagePoll = signedIn && channels.some((channel) => channel.id === channelID);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(`giltube.live-poll.dismissed.${channelID}`).then((pollID) => {
      if (active) setDismissedPollID(pollID || '');
    });
    return () => {
      active = false;
    };
  }, [channelID]);

  const dismissPoll = (pollID: string) => {
    setDismissedPollID(pollID);
    void SecureStore.setItemAsync(`giltube.live-poll.dismissed.${channelID}`, pollID);
  };

  const send = async (externalValue?: string) => {
    const fromComposer = externalValue === undefined;
    const value = (externalValue ?? message).trim();
    if (!value || busy || !live || !activeChannelID) return;
    const draft = message;
    if (fromComposer) setMessage('');
    try {
      setBusy(true);
      await giltubeAPI.postLiveChatMessage(channelID, activeChannelID, value);
      await messages.refetch();
    } catch (error) {
      if (fromComposer) setMessage(draft);
      Alert.alert(t('Message failed'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const createPoll = async () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!question || options.length < 2 || busy || !canManagePoll) return;
    try {
      setBusy(true);
      await giltubeAPI.createLivePoll(channelID, question, options);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollComposerOpen(false);
      await poll.refetch();
    } catch (error) {
      Alert.alert(t('Could not create poll'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const votePoll = async (optionID: string) => {
    if (!poll.data || !activeChannelID || busy) return;
    try {
      setBusy(true);
      await giltubeAPI.voteLivePoll(channelID, poll.data.id, activeChannelID, optionID);
      await poll.refetch();
    } catch (error) {
      Alert.alert(t('Vote failed'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const endPoll = async () => {
    if (!poll.data || busy || !canManagePoll) return;
    try {
      setBusy(true);
      await giltubeAPI.endLivePoll(channelID, poll.data.id);
      await poll.refetch();
    } catch (error) {
      Alert.alert(t('Could not end poll'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <View style={[styles.surface, overlay && styles.surfaceOverlay]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Ionicons name="chatbubbles" size={16} color={colors.accentBright} /></View>
        <View style={styles.headerCopy}><Text style={styles.title}>{t('Live chat')}</Text><Text style={styles.subtitle}>{t(live ? 'Chat updates automatically' : 'Stream is offline')}</Text></View>
        {canManagePoll && <PressableScale accessibilityLabel={t('Create poll')} onPress={() => setPollComposerOpen((open) => !open)} style={[styles.headerButton, pollComposerOpen && styles.headerButtonActive]}><Ionicons name="stats-chart" size={17} color={pollComposerOpen ? colors.white : colors.textMuted} /></PressableScale>}
        <PressableScale accessibilityLabel={t('Refresh live chat')} onPress={() => void messages.refetch()} style={styles.headerButton}><Ionicons name="refresh" size={17} color={colors.textMuted} /></PressableScale>
        {!!onHide && <PressableScale accessibilityLabel={t('Hide live chat')} onPress={onHide} style={styles.headerButton}><Ionicons name={hideIcon} size={21} color={colors.text} /></PressableScale>}
      </View>
      {pollComposerOpen && <View style={styles.pollComposer}>
        <Text style={styles.pollComposerTitle}>{t('Create a poll')}</Text>
        <TextInput value={pollQuestion} onChangeText={setPollQuestion} maxLength={120} placeholder={t('Ask a question…')} placeholderTextColor={colors.textDim} style={styles.pollInput} />
        {pollOptions.map((option, index) => <View key={index} style={styles.pollOptionInputRow}><TextInput value={option} onChangeText={(value) => setPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} maxLength={80} placeholder={t('Option {number}', { number: index + 1 })} placeholderTextColor={colors.textDim} style={styles.pollOptionInput} />{pollOptions.length > 2 && <PressableScale accessibilityLabel={t('Remove option')} onPress={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.pollRemove}><Ionicons name="close" size={17} color={colors.textMuted} /></PressableScale>}</View>)}
        <View style={styles.pollComposerActions}>{pollOptions.length < 4 && <PressableScale onPress={() => setPollOptions((current) => [...current, ''])} style={styles.pollSecondary}><Ionicons name="add" size={16} color={colors.text} /><Text style={styles.pollSecondaryText}>{t('Add option')}</Text></PressableScale>}<PressableScale disabled={busy || !pollQuestion.trim() || pollOptions.filter((option) => option.trim()).length < 2} onPress={() => void createPoll()} style={styles.pollCreate}><Text style={styles.pollCreateText}>{t('Ask your community')}</Text></PressableScale></View>
      </View>}
      <ScrollView ref={listRef} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} style={overlay ? styles.messagesOverlay : styles.messagesInline} contentContainerStyle={styles.messagesContent}>
        {!messages.data?.length && !poll.data && <View style={styles.empty}><Ionicons name="chatbubble-ellipses-outline" size={25} color={colors.textDim} /><Text style={styles.emptyText}>{t(messages.isLoading ? 'Loading chat…' : 'No messages yet. Say hello.')}</Text></View>}
        {messages.data?.map((item) => <MessageBubble key={item.id} item={item} mine={item.channel.id === activeChannelID} compact={overlay} />)}
        {!!poll.data && poll.data.id !== dismissedPollID && <PollCard poll={poll.data} canVote={signedIn && !!activeChannelID} canManage={canManagePoll} busy={busy} onVote={votePoll} onEnd={endPoll} onDismiss={() => dismissPoll(poll.data!.id)} />}
      </ScrollView>
      {live && signedIn && !!activeChannelID && <View style={styles.reactions}>{['❤️', '😂', '😮', '👏'].map((reaction) => <PressableScale disabled={busy} key={reaction} onPress={() => void send(reaction)} style={styles.reaction}><Text style={styles.reactionText}>{reaction}</Text></PressableScale>)}</View>}
      {!signedIn ? <PressableScale onPress={() => router.push('/login')} style={styles.signIn}><Text style={styles.signInText}>{t('Sign in to join live chat')}</Text></PressableScale> : !activeChannelID ? <Text style={styles.notice}>{t('Select or create a channel to chat.')}</Text> : !live ? <Text style={styles.notice}>{t('Chat will reopen when the channel is live.')}</Text> : <View style={styles.composer}><PressableScale disabled={busy} onPress={() => setGIFOpen(true)} style={styles.gif}><Text style={styles.gifText}>GIF</Text></PressableScale><TextInput value={message} onChangeText={setMessage} onSubmitEditing={() => void send()} returnKeyType="send" maxLength={500} placeholder={t('Say something…')} placeholderTextColor={colors.textDim} style={styles.input} /><PressableScale disabled={!message.trim() || busy} onPress={() => void send()} style={styles.send}><Ionicons name="send" size={18} color={message.trim() ? colors.accentBright : colors.textDim} /></PressableScale></View>}
    </View>
    <GiphyPicker visible={gifOpen} onClose={() => setGIFOpen(false)} onSelect={(url) => void send(url)} />
  </>;
}

function PollCard({ poll, canVote, canManage, busy, onVote, onEnd, onDismiss }: { poll: LivePoll; canVote: boolean; canManage: boolean; busy: boolean; onVote: (optionID: string) => void; onEnd: () => void; onDismiss: () => void }) {
  const { t } = useI18n();
  const revealed = poll.status === 'ended' || !!poll.selected_option_id;
  return <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOutUp.duration(200)} style={styles.pollCard}>
    <View style={styles.pollByline}><Image source={resolveMediaURL(poll.creator.avatar_url)} style={styles.pollAvatar} contentFit="cover" /><Text numberOfLines={1} style={styles.pollCreator}>{poll.creator.name}</Text><Text style={styles.pollVotes}>{t('{count} votes', { count: poll.total_votes })}</Text></View>
    <Text style={styles.pollQuestion}>{poll.question}</Text>
    <View style={styles.pollOptions}>{poll.options.map((option) => {
      const selected = poll.selected_option_id === option.id;
      return <PressableScale key={option.id} disabled={busy || poll.status !== 'active' || !canVote || !!poll.selected_option_id} onPress={() => onVote(option.id)} style={[styles.pollChoice, selected && styles.pollChoiceSelected]}>
        {revealed && <View style={[styles.pollProgress, { width: `${option.percentage}%` }]} />}
        <View style={[styles.pollRadio, selected && styles.pollRadioSelected]}>{selected && <View style={styles.pollRadioDot} />}</View>
        <Text style={styles.pollChoiceText}>{option.text}</Text>
        {revealed && <Text style={styles.pollPercentage}>{option.percentage}%</Text>}
      </PressableScale>;
    })}</View>
    <View style={styles.pollFooter}><Text style={styles.pollStatus}>{t(poll.status === 'active' ? 'Poll active' : 'Final results')}</Text>{canManage && poll.status === 'active' ? <PressableScale disabled={busy} onPress={onEnd} style={styles.endPoll}><Text style={styles.endPollText}>{t('End poll')}</Text></PressableScale> : poll.status === 'ended' ? <PressableScale onPress={onDismiss} style={styles.endPoll}><Text style={styles.endPollText}>{t('Dismiss')}</Text></PressableScale> : null}</View>
  </Animated.View>;
}

function MessageBubble({ item, mine, compact }: { item: LiveChatMessage; mine: boolean; compact: boolean }) {
  const { t, dateTime } = useI18n();
  const gif = /^https?:\/\//i.test(item.message) && (/(?:^|\.)giphy\.com/i.test(item.message) || /\.gif(?:\?|$)/i.test(item.message));
  return <View style={[styles.message, compact && styles.messageCompact, mine && styles.messageMine]}>
    <View style={styles.messageTop}>{!compact && <Image source={resolveMediaURL(item.channel.avatar_url)} style={styles.avatar} contentFit="cover" />}<Text numberOfLines={1} style={[styles.messageName, compact && styles.messageNameCompact]}>{mine ? t('You') : item.channel.name}</Text><Text style={styles.messageTime}>{dateTime(item.created_at, { hour: '2-digit', minute: '2-digit' })}</Text></View>
    {gif ? <Image source={item.message} style={[styles.messageGIF, compact && styles.messageGIFCompact]} contentFit="cover" /> : <Text style={styles.messageBody}>{item.message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  surface: { marginHorizontal: 14, marginBottom: 20, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  surfaceOverlay: { flex: 1, marginHorizontal: 0, marginBottom: 0, borderColor: 'rgba(255,255,255,.14)', backgroundColor: 'rgba(13,13,16,.86)' },
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(239,68,68,.12)' },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 9 }, title: { color: colors.text, fontSize: 14, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 9, marginTop: 2 },
  headerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.surfaceStrong, marginLeft: 5 },
  headerButtonActive: { backgroundColor: colors.accent },
  pollComposer: { marginTop: 10, padding: 12, gap: 8, borderRadius: radii.md, backgroundColor: colors.canvasRaised, borderWidth: 1, borderColor: colors.borderStrong }, pollComposerTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, pollInput: { minHeight: 43, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surfaceStrong, color: colors.text, fontSize: 13 }, pollOptionInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, pollOptionInput: { flex: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surfaceStrong, color: colors.text, fontSize: 12 }, pollRemove: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, pollComposerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }, pollSecondary: { minHeight: 38, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 19, backgroundColor: colors.surfaceStrong }, pollSecondaryText: { color: colors.text, fontSize: 10, fontWeight: '800' }, pollCreate: { flex: 1, minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.white }, pollCreateText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  messagesInline: { minHeight: 130, maxHeight: 340 }, messagesOverlay: { flex: 1 }, messagesContent: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 12 },
  empty: { flex: 1, minHeight: 115, alignItems: 'center', justifyContent: 'center' }, emptyText: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  message: { alignSelf: 'flex-start', maxWidth: '90%', padding: 10, marginBottom: 9, borderRadius: 14, borderTopLeftRadius: 4, backgroundColor: colors.surfaceStrong }, messageCompact: { paddingHorizontal: 9, paddingVertical: 7, marginBottom: 7, backgroundColor: 'rgba(50,50,55,.92)' }, messageMine: { alignSelf: 'flex-end', borderTopLeftRadius: 14, borderTopRightRadius: 4, backgroundColor: '#3B171B' },
  messageTop: { minWidth: 145, flexDirection: 'row', alignItems: 'center' }, avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.canvasRaised }, messageName: { flex: 1, color: colors.textMuted, fontSize: 9, fontWeight: '800', marginLeft: 7 }, messageNameCompact: { marginLeft: 0 }, messageTime: { color: colors.textDim, fontSize: 8, marginLeft: 10 }, messageBody: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 7 }, messageGIF: { width: 210, aspectRatio: 1.3, borderRadius: radii.md, marginTop: 8, backgroundColor: colors.canvasRaised }, messageGIFCompact: { width: 180 },
  pollCard: { width: '100%', padding: 14, marginTop: 5, marginBottom: 10, borderRadius: 16, backgroundColor: '#F4F4F5' }, pollByline: { flexDirection: 'row', alignItems: 'center' }, pollAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#D4D4D8' }, pollCreator: { flex: 1, marginLeft: 8, color: '#52525B', fontSize: 10, fontWeight: '800' }, pollVotes: { color: '#71717A', fontSize: 9 }, pollQuestion: { color: '#18181B', fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 13 }, pollOptions: { gap: 7, marginTop: 12 }, pollChoice: { minHeight: 42, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: '#D4D4D8', backgroundColor: '#FFFFFF' }, pollChoiceSelected: { borderColor: '#DC2626' }, pollProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#FECACA' }, pollRadio: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: '#71717A', alignItems: 'center', justifyContent: 'center' }, pollRadioSelected: { borderColor: '#DC2626' }, pollRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#DC2626' }, pollChoiceText: { flex: 1, marginLeft: 9, color: '#27272A', fontSize: 12, fontWeight: '700' }, pollPercentage: { color: '#3F3F46', fontSize: 11, fontWeight: '900' }, pollFooter: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }, pollStatus: { color: '#71717A', fontSize: 9, fontWeight: '700' }, endPoll: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10 }, endPollText: { color: '#2563EB', fontSize: 12, fontWeight: '800' },
  reactions: { flexDirection: 'row', gap: 8, marginTop: 10 }, reaction: { width: 42, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceStrong }, reactionText: { fontSize: 17 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, gif: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceStrong }, gifText: { color: colors.text, fontSize: 9, fontWeight: '900' }, input: { flex: 1, height: 43, paddingHorizontal: 13, borderRadius: 22, backgroundColor: colors.surfaceStrong, color: colors.text }, send: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  signIn: { minHeight: 43, marginTop: 12, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, signInText: { color: colors.accentBright, fontSize: 11, fontWeight: '900' }, notice: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingTop: 14, paddingBottom: 3 },
});
