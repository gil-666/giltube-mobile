import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { Geel } from '@/api/geels';
import { giltubeAPI } from '@/api/giltube';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';
import type { Comment } from '@/types/api';
import { compactNumber, resolveMediaURL } from '@/utils/media';

export function GeelComments({ geel, actorID, signedIn, onClose, onCommented }: {
  geel: Geel | null; actorID: string; signedIn: boolean; onClose: () => void; onCommented: (geel: Geel) => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);
  const comments = useQuery({
    queryKey: ['comments', geel?.id, actorID],
    queryFn: () => giltubeAPI.comments(geel!.id, actorID),
    enabled: !!geel,
  });
  const list = [...(comments.data || [])].reverse();

  const submit = async () => {
    const body = text.trim();
    if (!geel || !body) return;
    if (!signedIn) { onClose(); router.push('/login'); return; }
    if (!actorID) { Alert.alert(t('Channel needed'), t('Create or select a channel on GilTube first.')); return; }
    setPosting(true);
    try {
      await giltubeAPI.comment(geel.id, actorID, body, replyTo?.id);
      setText('');
      setReplyTo(null);
      onCommented({ ...geel, comments_count: geel.comments_count + 1 });
      void comments.refetch();
    } catch (error) {
      Alert.alert(t('Comment failed'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (comment: Comment) => {
    if (!signedIn || !actorID) return;
    try {
      if (comment.liked_by_actor) await giltubeAPI.unlikeComment(comment.id, actorID);
      else await giltubeAPI.likeComment(comment.id, actorID);
      void comments.refetch();
    } catch { /* ignore */ }
  };

  const row = (comment: Comment, reply = false) => <View key={comment.id} style={[styles.comment, reply && styles.reply]}>
    <Image source={resolveMediaURL(comment.channel.avatar_url || '')} style={reply ? styles.replyAvatar : styles.avatar} contentFit="cover" />
    <View style={styles.body}>
      <Text style={styles.author}>{comment.channel.name}</Text>
      <Text style={styles.text}>{comment.text}</Text>
      {!reply && <Pressable onPress={() => setReplyTo(replyTo?.id === comment.id ? null : comment)} hitSlop={6}><Text style={styles.replyAction}>{t(replyTo?.id === comment.id ? 'Cancel' : 'Reply')}</Text></Pressable>}
      {comment.replies?.map((child) => row(child, true))}
    </View>
    <Pressable accessibilityLabel={t('Like')} onPress={() => void toggleLike(comment)} style={styles.likeButton} hitSlop={8}>
      <Ionicons name={comment.liked_by_actor ? 'heart' : 'heart-outline'} size={16} color={comment.liked_by_actor ? colors.accentBright : colors.textMuted} />
      {!!comment.likes_count && <Text style={styles.likeCount}>{compactNumber(comment.likes_count)}</Text>}
    </Pressable>
  </View>;

  return <SwipeSheet visible={!!geel} title={geel ? `${t('Comments')} · ${compactNumber(geel.comments_count)}` : ''} onClose={onClose}>
    <KeyboardAvoidingView behavior="padding">
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {comments.isLoading && <ActivityIndicator color={colors.accentBright} style={styles.loading} />}
        {!comments.isLoading && !list.length && <Text style={styles.empty}>{t('No comments yet. Start the conversation.')}</Text>}
        {list.map((comment) => row(comment))}
      </ScrollView>
      {replyTo && <Text style={styles.replying}>{t('Replying to')} {replyTo.channel.name}</Text>}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('Add a comment…')}
          placeholderTextColor={colors.textDim}
          style={styles.input}
          maxLength={2000}
          onSubmitEditing={() => void submit()}
          returnKeyType="send"
        />
        <Pressable disabled={!text.trim() || posting} onPress={() => void submit()} style={[styles.send, (!text.trim() || posting) && styles.sendDisabled]}>
          <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </SwipeSheet>;
}

const useStyles = makeStyles(() => ({
  list: { maxHeight: 420 },
  listContent: { paddingBottom: 12, gap: 16 },
  loading: { marginVertical: 30 },
  empty: { color: colors.textMuted, textAlign: 'center', marginVertical: 30, fontSize: 13 },
  comment: { flexDirection: 'row', gap: 10 },
  reply: { marginTop: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceStrong },
  replyAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceStrong },
  body: { flex: 1, minWidth: 0 },
  author: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  text: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: 2 },
  replyAction: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 5 },
  likeButton: { alignItems: 'center', paddingTop: 4, minWidth: 28 },
  likeCount: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  replying: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  input: { flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, color: colors.text, backgroundColor: colors.surfaceStrong, fontSize: 14 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  sendDisabled: { opacity: 0.4 },
}));
