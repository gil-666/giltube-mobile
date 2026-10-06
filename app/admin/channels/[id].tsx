import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { peopleAPI, peopleKeys } from '@/admin/people/api';
import { ModerationButtons, SearchField, StatusBadge, VideoListRow, useModeration } from '@/admin/people/shared';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminLoading, AdminScreen, AdminSection, useAdminStyles, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';

const PAGE = 40;

export default function AdminChannelDetailScreen() {
  const adminStyles = useAdminStyles();
  const { t, compactNumber, dateTime } = useI18n();
  const isAdmin = useIsAdmin();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const channelID = String(params.id ?? '');
  // There is no single-channel admin endpoint; the list is small and usually cached already.
  const channels = useQuery({ queryKey: peopleKeys.channels, queryFn: peopleAPI.channels, enabled: isAdmin });
  const videos = useQuery({ queryKey: peopleKeys.channelVideos(channelID), queryFn: () => peopleAPI.channelVideos(channelID), enabled: isAdmin && !!channelID });
  const moderation = useModeration();
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);

  const channel = channels.data?.find((item) => item.id === channelID);
  const title = channel?.name || (typeof params.name === 'string' ? params.name : '') || t('Channel');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return videos.data ?? [];
    return (videos.data ?? []).filter((video) => video.title.toLowerCase().includes(query) || video.description.toLowerCase().includes(query) || video.id.toLowerCase().includes(query));
  }, [videos.data, search]);

  const refresh = () => { void channels.refetch(); void videos.refetch(); };

  return <AdminScreen title={title} subtitle={channel ? `@${channel.username}` : undefined} refreshing={channels.isRefetching || videos.isRefetching} onRefresh={refresh}>
    <AdminError error={channels.error} />
    {channel && <AdminCard style={styles.card}>
      <View style={adminStyles.inlineRow}>
        <StatusBadge status={channel.status} />
        {channel.user_type === 'admin' && <AdminBadge label={t('Owned by an admin')} tone="info" />}
      </View>
      <Text style={[adminStyles.text, styles.stats]}>{t('{videos} videos · {views} views', { videos: channel.video_count, views: compactNumber(channel.total_views) })}</Text>
      {!!channel.created_at && <Text style={adminStyles.muted}>{t('Created {date}', { date: dateTime(channel.created_at, { dateStyle: 'medium' }) })}</Text>}
      <Text selectable style={[adminStyles.mono, styles.id]}>{channel.id}</Text>
      <AdminButtons>
        <ModerationButtons kind="channel" id={channel.id} name={channel.name} status={channel.status} isProtected={channel.user_type === 'admin'} moderation={moderation} />
        <AdminButton compact icon="open-outline" label={t('Open channel')} onPress={() => router.push({ pathname: '/channel/[id]', params: { id: channel.id } })} />
      </AdminButtons>
    </AdminCard>}

    <AdminSection title={t('Videos')} right={videos.data ? <Text style={adminStyles.muted}>{filtered.length}</Text> : undefined}>
      {(videos.data?.length ?? 0) > 5 && <SearchField value={search} onChangeText={(value) => { setSearch(value); setVisible(PAGE); }} placeholder={t('Search this channel')} />}
      <AdminError error={videos.error} />
      {videos.isLoading ? <AdminLoading /> : <>
        {filtered.slice(0, visible).map((video) => <VideoListRow key={video.id} video={video} onPress={() => router.push({ pathname: '/admin/videos/[id]', params: { id: video.id } })} />)}
        {filtered.length > visible && <AdminButtons><AdminButton label={t('Load more')} icon="chevron-down" onPress={() => setVisible((value) => value + PAGE)} /></AdminButtons>}
        {!filtered.length && !videos.error && <AdminEmpty text={search ? t('No videos match your search.') : t('This channel has no videos.')} />}
      </>}
    </AdminSection>
  </AdminScreen>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14 },
  stats: { marginTop: 8 },
  id: { marginTop: 6 },
});
