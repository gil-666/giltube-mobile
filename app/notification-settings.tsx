import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { NotificationItem } from '@/types/api';

type EventType = NotificationItem['type'];
const groups: { title: string; items: { type: EventType; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] }[] = [
  { title: 'FROM GILTUBE', items: [{ type: 'news', title: 'News and announcements', description: 'Updates and announcements from the GilTube team', icon: 'megaphone-outline' }] },
	{ title: 'FEATURED', items: [{ type: 'featured_content', title: 'Featured content', description: 'Platform picks, premieres, and scheduled live reminders', icon: 'sparkles-outline' }] },
  { title: 'VIDEOS & CHANNELS', items: [
    { type: 'new_video', title: 'New videos', description: 'A channel you subscribe to uploads a video', icon: 'play-circle-outline' },
    { type: 'live_started', title: 'Live streams', description: 'A channel you subscribe to goes live', icon: 'radio-outline' },
    { type: 'video_ready', title: 'Upload processing', description: 'Your uploaded video is ready to watch', icon: 'cloud-done-outline' },
    { type: 'new_subscriber', title: 'New subscribers', description: 'Someone subscribes to your channel', icon: 'person-add-outline' },
  ] },
  { title: 'WATCH PARTIES', items: [
    { type: 'watch_party_invite', title: 'Party invitations', description: 'A host invites you to a watch party', icon: 'people-outline' },
    { type: 'watch_party_host', title: 'Host transfers', description: 'Someone makes you the watch party host', icon: 'key-outline' },
  ] },
  { title: 'COMMENTS & REACTIONS', items: [
    { type: 'comment_video', title: 'Video comments', description: 'Someone comments on your video', icon: 'chatbubble-outline' },
    { type: 'reply_comment', title: 'Comment replies', description: 'Someone replies to your comment', icon: 'return-down-forward-outline' },
    { type: 'like_video', title: 'Video likes', description: 'Someone likes your video', icon: 'thumbs-up-outline' },
    { type: 'like_comment', title: 'Comment likes', description: 'Someone likes your comment', icon: 'heart-outline' },
  ] },
];

export default function NotificationSettingsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const { t } = useI18n();
  const preferences = useQuery({ queryKey: ['notification-preferences'], queryFn: giltubeAPI.notificationPreferences });
  const update = useMutation({
    mutationFn: ({ type, enabled }: { type: EventType; enabled: boolean }) => giltubeAPI.setNotificationPreference(type, enabled),
    onMutate: async ({ type, enabled }) => {
      await client.cancelQueries({ queryKey: ['notification-preferences'] });
      const previous = client.getQueryData<{ preferences: Record<EventType, boolean> }>(['notification-preferences']);
      client.setQueryData<{ preferences: Record<EventType, boolean> }>(['notification-preferences'], (current) => ({ preferences: { ...(current?.preferences || {} as Record<EventType, boolean>), [type]: enabled } }));
      return { previous };
    },
    onError: (error, _input, context) => { if (context?.previous) client.setQueryData(['notification-preferences'], context.previous); Alert.alert(t('Could not save preference'), error.message); },
    onSettled: () => void client.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}><PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={25} color={colors.text} /></PressableScale><View><Text style={styles.heading}>{t('Notifications')}</Text><Text style={styles.headerMeta}>{t('Saved across your GilTube account')}</Text></View></View>
    {preferences.isLoading ? <ActivityIndicator style={styles.loader} color={colors.accentBright} /> : <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 32 }}><View style={styles.info}><Ionicons name="sync-outline" size={20} color={colors.gilid} /><Text style={styles.infoText}>{t('Changes apply to mobile push, web push, and your notification feed on every signed-in device.')}</Text></View>{groups.map((group) => <View key={group.title}><Text style={styles.groupTitle}>{t(group.title)}</Text><View style={styles.group}>{group.items.map((item, index) => <View key={item.type} style={[styles.row, index > 0 && styles.rowBorder]}><View style={styles.icon}><Ionicons name={item.icon} size={20} color={colors.text} /></View><View style={styles.copy}><Text style={styles.title}>{t(item.title)}</Text><Text style={styles.description}>{t(item.description)}</Text></View><Switch value={preferences.data?.preferences[item.type] !== false} onValueChange={(enabled) => update.mutate({ type: item.type, enabled })} trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }} thumbColor={preferences.data?.preferences[item.type] !== false ? colors.accentBright : colors.textDim} /></View>)}</View></View>)}</ScrollView>}
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen }, header: { minHeight: 84, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.canvasRaised }, back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, heading: { color: colors.text, fontSize: 21, fontWeight: '900' }, headerMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 }, loader: { marginTop: 100 }, info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: withAlpha(colors.gilid, 0.2), backgroundColor: withAlpha(colors.gilid, 0.06) }, infoText: { flex: 1, color: colors.textMuted, fontSize: 11, lineHeight: 17 }, groupTitle: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginTop: 25, marginBottom: 8 }, group: { overflow: 'hidden', paddingHorizontal: 13, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, icon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, copy: { flex: 1, paddingVertical: 11 }, title: { color: colors.text, fontSize: 13, fontWeight: '800' }, description: { color: colors.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
}));
