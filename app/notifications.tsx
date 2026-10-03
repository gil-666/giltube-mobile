import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { notificationData, openNotificationContext } from '@/notifications/navigation';
import { notificationAction } from '@/notifications/presentation';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';
import type { NotificationItem } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

const icons: Record<NotificationItem['type'], keyof typeof Ionicons.glyphMap> = { comment_video: 'chatbubble', reply_comment: 'return-down-forward', like_video: 'thumbs-up', like_comment: 'heart', live_started: 'radio', new_video: 'play', video_ready: 'checkmark-circle', watch_party_invite: 'people', watch_party_host: 'key', new_subscriber: 'person-add', featured_content: 'sparkles' };

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets(); const client = useQueryClient(); const { t, relative, dateTime } = useI18n();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: giltubeAPI.notifications });
  const refreshCounts = () => { void client.invalidateQueries({ queryKey: ['notifications'] }); void client.invalidateQueries({ queryKey: ['notification-count'] }); };
  const markAll = useMutation({ mutationFn: giltubeAPI.markAllNotificationsRead, onSuccess: refreshCounts });
  const open = (item: NotificationItem) => { if (!item.is_read) void giltubeAPI.markNotificationRead(item.id).then(refreshCounts); openNotificationContext(notificationData(item)); };
  return <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
    <View style={styles.header}><PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={25} color={colors.text} /></PressableScale><Text style={styles.heading}>{t('Notifications')}</Text><PressableScale accessibilityLabel={t('Notification preferences')} onPress={() => router.push('/notification-settings')} style={styles.settings}><Ionicons name="options-outline" size={20} color={colors.textMuted} /></PressableScale><PressableScale onPress={() => markAll.mutate()} style={styles.readAll}><Text style={styles.readAllText}>{t('Read all')}</Text></PressableScale></View>
    {notifications.isLoading && <ActivityIndicator style={styles.loader} color={colors.accentBright} />}
    <FlatList data={notifications.data?.items || []} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} refreshControl={<RefreshControl refreshing={notifications.isRefetching} onRefresh={notifications.refetch} tintColor={colors.accentBright} />} ListEmptyComponent={!notifications.isLoading ? <Text style={styles.empty}>{t('You’re all caught up.')}</Text> : null} renderItem={({ item }) => { const featuredTitle=typeof item.metadata?.push_title==='string'?item.metadata.push_title:''; const featuredBody=typeof item.metadata?.push_body==='string'?item.metadata.push_body:''; const featuredImage=typeof item.metadata?.image_url==='string'?item.metadata.image_url:''; return <PressableScale onPress={() => open(item)} style={[styles.item, !item.is_read && styles.unread]}><View><Image source={resolveMediaURL(featuredImage || item.actor_channel.avatar_url || '')} style={styles.avatar} contentFit="cover" /><View style={styles.eventIcon}><Ionicons name={icons[item.type]} color={colors.white} size={12} /></View></View><View style={styles.copy}><View style={styles.actorRow}><Text numberOfLines={2} style={styles.actor}>{featuredTitle || item.actor_channel.name}</Text>{!featuredTitle && <VerifiedBadge verified={item.actor_channel.verified} size={13} />}</View><Text style={styles.text}>{featuredBody || t(notificationAction[item.type])}</Text>{!!item.target_video && <View style={styles.context}><Ionicons name="play-outline" color={colors.accentBright} size={14} /><Text numberOfLines={2} style={styles.target}>{item.target_video.title}</Text></View>}{!!item.target_comment?.snippet && <Text numberOfLines={3} style={styles.snippet}>“{item.target_comment.snippet}”</Text>}<Text style={styles.date}>{relative(item.created_at)} · {dateTime(item.created_at)}</Text></View>{!item.is_read && <View style={styles.dot} />}</PressableScale>; }} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1, color: colors.text, fontSize: 24, fontWeight: '900' }, settings: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, readAll: { paddingHorizontal: 10, paddingVertical: 8 }, readAllText: { color: colors.accentBright, fontSize: 12, fontWeight: '800' }, loader: { marginTop: 80 }, empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 80 }, item: { minHeight: 104, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, unread: { backgroundColor: 'rgba(127,29,29,.14)' }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceStrong }, eventIcon: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.canvas, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, actorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, text: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 1 }, actor: { color: colors.text, fontSize: 14, fontWeight: '900', flexShrink: 1 }, context: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 }, target: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700' }, snippet: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', lineHeight: 16, marginTop: 7 }, date: { color: colors.textDim, fontSize: 9, lineHeight: 13, marginTop: 7 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentBright, marginTop: 5 },
});
