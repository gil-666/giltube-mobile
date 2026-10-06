import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { VideoCard } from '@/components/VideoCard';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { Channel, Video } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export default function SubscriptionsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets(); const { account, status } = useAuth(); const signedIn = status === 'signedIn' && !!account;
  const { t } = useI18n();
  const { activeChannelID: actorID, isLoading: channelsLoading } = useActiveChannel();
  const subscribed = useQuery({ queryKey: ['subscriptions', actorID], queryFn: () => giltubeAPI.subscribedChannels(actorID), enabled: signedIn && !!actorID });
  const feed = useQuery({ queryKey: ['subscriptions-feed', actorID], queryFn: () => giltubeAPI.subscriptionsFeed(actorID), enabled: signedIn && !!actorID });
  const channels = useMemo(() => Array.isArray(subscribed.data?.channels) ? subscribed.data.channels : [], [subscribed.data]);
  const videos = useMemo(() => Array.isArray(feed.data?.videos) ? feed.data.videos : [], [feed.data]);
  const channelRows = useMemo(() => channels.map((channel) => ({ channel, videos: videos.filter((video) => (video.channel?.id || video.channel_id) === channel.id) })).filter((row) => row.videos.length > 0), [channels, videos]);
  const refreshing = subscribed.isRefetching || feed.isRefetching;
  if (!signedIn) return <View style={[styles.center, { paddingTop: insets.top }]}><Text style={styles.emptyTitle}>{t('Follow your favorites')}</Text><Text style={styles.emptyBody}>{t('Guest browsing stays open. Sign in to sync subscriptions across devices.')}</Text><PressableScale onPress={() => router.push('/login')} style={styles.action}><Text style={styles.actionText}>{t('Sign in with GILid')}</Text></PressableScale></View>;
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void Promise.all([subscribed.refetch(), feed.refetch()])} tintColor={colors.accentBright} />}>
    <View style={styles.titleRow}><Text style={styles.heading}>{t('Subscriptions')}</Text>{!!channels.length && <View style={styles.count}><Text style={styles.countText}>{channels.length}</Text></View>}</View>
    {(channelsLoading || subscribed.isLoading || feed.isLoading) && <ActivityIndicator style={styles.loader} color={colors.accentBright} />}
    {!!channels.length && <><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t('Channels')}</Text><Text style={styles.sectionMeta}>{t('Tap to visit')}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelRail}>{channels.map((channel) => <PressableScale key={channel.id} onPress={() => router.push({ pathname: '/channel/[id]', params: { id: channel.id } })} style={styles.channelItem}><Image source={resolveMediaURL(channel.avatar_url || '')} style={styles.avatar} contentFit="cover" /><View style={styles.channelLabel}><Text numberOfLines={1} style={styles.channelName}>{channel.name}</Text><VerifiedBadge verified={channel.verified} size={12} /></View></PressableScale>)}</ScrollView></>}
    {!feed.isLoading && !videos.length && <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{t(channels.length ? 'No uploads yet' : 'No subscriptions yet')}</Text><Text style={styles.emptyBody}>{t(channels.length ? 'New videos from these channels will appear here.' : 'Find a channel in Search and tap Subscribe.')}</Text></View>}
    {channelRows.map((row) => <SubscriptionRow key={row.channel.id} channel={row.channel} videos={row.videos} />)}
  </ScrollView>;
}

function SubscriptionRow({ channel, videos }: { channel: Channel; videos: Video[] }) {
  const styles = useStyles();
  const { t } = useI18n();
  return <View style={styles.channelSection}><PressableScale onPress={() => router.push({ pathname: '/channel/[id]', params: { id: channel.id } })} style={styles.rowHeader}><Image source={resolveMediaURL(channel.avatar_url || '')} style={styles.rowAvatar} contentFit="cover" /><View style={styles.rowName}><Text numberOfLines={1} style={styles.rowTitle}>{channel.name}</Text><VerifiedBadge verified={channel.verified} size={14} /></View><Text style={styles.latest}>{videos.length} {t('latest')}</Text><Ionicons name="chevron-forward" color={colors.textDim} size={18} /></PressableScale><FlatList horizontal data={videos} keyExtractor={(item) => item.id} renderItem={({ item, index }) => <VideoCard video={item} index={index} />} contentContainerStyle={styles.videoRail} ItemSeparatorComponent={() => <View style={styles.separator} />} showsHorizontalScrollIndicator={false} initialNumToRender={3} windowSize={4} /></View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen }, titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 }, heading: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.2 }, count: { minWidth: 27, height: 27, marginLeft: 10, paddingHorizontal: 7, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, countText: { color: colors.textMuted, fontSize: 11, fontWeight: '900' }, loader: { marginTop: 60 }, sectionHeading: { marginTop: 24, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, sectionMeta: { color: colors.textDim, fontSize: 10, fontWeight: '700' }, channelRail: { paddingHorizontal: 18, gap: 16, paddingTop: 14, paddingBottom: 5 }, channelItem: { width: 72, alignItems: 'center' }, avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.border }, channelLabel: { width: 78, marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }, channelName: { color: colors.text, fontSize: 11, fontWeight: '700', maxWidth: 62, textAlign: 'center' }, channelSection: { marginTop: 28 }, rowHeader: { minHeight: 48, marginHorizontal: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }, rowAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceStrong }, rowName: { flex: 1, minWidth: 0, marginLeft: 11, flexDirection: 'row', alignItems: 'center', gap: 5 }, rowTitle: { color: colors.text, fontSize: 17, fontWeight: '900', flexShrink: 1 }, latest: { color: colors.textDim, fontSize: 10, marginRight: 4 }, videoRail: { paddingHorizontal: 18 }, separator: { width: 14 }, center: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.screen }, emptyCard: { margin: 18, marginTop: 32, padding: 24, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }, emptyBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' }, action: { height: 50, paddingHorizontal: 24, marginTop: 22, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gilid }, actionText: { color: colors.black, fontWeight: '900' },
}));
