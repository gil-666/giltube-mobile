import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { peopleAPI, peopleKeys, type AdminChannel } from '@/admin/people/api';
import { ModerationButtons, SearchField, StatusBadge, normalizedStatus, statusFilterOptions, useModeration, type StatusFilter } from '@/admin/people/shared';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminScreen, adminStyles, useIsAdmin } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

const PAGE = 40;
type SortKey = 'views' | 'videos' | 'newest' | 'name';

export default function AdminChannelsScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const params = useLocalSearchParams<{ q?: string }>();
  const channels = useQuery({ queryKey: peopleKeys.channels, queryFn: peopleAPI.channels, enabled: isAdmin });
  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('views');
  const [visible, setVisible] = useState(PAGE);
  const moderation = useModeration();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = (channels.data ?? []).filter((channel) => {
      if (query && !channel.name.toLowerCase().includes(query) && !channel.username.toLowerCase().includes(query)) return false;
      return filter === 'all' || normalizedStatus(channel.status) === filter;
    });
    // The API already orders by total views.
    if (sort === 'videos') return [...rows].sort((a, b) => b.video_count - a.video_count);
    if (sort === 'newest') return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (sort === 'name') return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [channels.data, search, filter, sort]);

  const resetPaging = () => setVisible(PAGE);

  return <AdminScreen title={t('Channels')} subtitle={t('Moderate channels and their videos')} refreshing={channels.isRefetching} onRefresh={() => void channels.refetch()}>
    <SearchField value={search} onChangeText={(value) => { setSearch(value); resetPaging(); }} placeholder={t('Search by channel or owner')} />
    <AdminChips options={statusFilterOptions(t)} value={filter} onChange={(value) => { setFilter(value); resetPaging(); }} />
    <AdminChips label={t('Sort by')} options={[
      { value: 'views', label: t('Most viewed') },
      { value: 'videos', label: t('Most videos') },
      { value: 'newest', label: t('Newest') },
      { value: 'name', label: t('Name') },
    ]} value={sort} onChange={setSort} />
    <AdminError error={channels.error} />
    {channels.isLoading ? <AdminLoading /> : <>
      {!!channels.data && <Text style={styles.count}>{t('{count} of {total} channels', { count: filtered.length, total: channels.data.length })}</Text>}
      {filtered.slice(0, visible).map((channel) => <ChannelCard key={channel.id} channel={channel} moderation={moderation} />)}
      {!filtered.length && !channels.error && <AdminEmpty text={search || filter !== 'all' ? t('No channels match these filters.') : t('No channels yet.')} />}
      {filtered.length > visible && <AdminButtons><AdminButton label={t('Load more')} icon="chevron-down" onPress={() => setVisible((value) => value + PAGE)} /></AdminButtons>}
    </>}
  </AdminScreen>;
}

function ChannelCard({ channel, moderation }: { channel: AdminChannel; moderation: ReturnType<typeof useModeration> }) {
  const { t, compactNumber, dateTime } = useI18n();
  const isProtected = channel.user_type === 'admin';
  const open = () => router.push({ pathname: '/admin/channels/[id]', params: { id: channel.id, name: channel.name } });
  return <AdminCard>
    <PressableScale onPress={open} style={styles.head}>
      <View style={styles.headCopy}>
        <Text numberOfLines={1} style={styles.name}>{channel.name}</Text>
        <Text numberOfLines={1} style={adminStyles.muted}>@{channel.username}</Text>
      </View>
      <View style={styles.badges}>
        {isProtected && <AdminBadge label={t('Admin')} tone="info" />}
        <StatusBadge status={channel.status} />
      </View>
      <Ionicons name="chevron-forward" color={colors.textDim} size={18} />
    </PressableScale>
    <Text style={styles.stats}>{t('{videos} videos · {views} views', { videos: channel.video_count, views: compactNumber(channel.total_views) })}</Text>
    {!!channel.created_at && <Text style={adminStyles.muted}>{t('Created {date}', { date: dateTime(channel.created_at, { dateStyle: 'medium' }) })}</Text>}
    <AdminButtons>
      <AdminButton compact icon="film-outline" label={t('Videos')} onPress={open} />
      <ModerationButtons kind="channel" id={channel.id} name={channel.name} status={channel.status} isProtected={isProtected} moderation={moderation} />
    </AdminButtons>
  </AdminCard>;
}

const styles = StyleSheet.create({
  count: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headCopy: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' },
  badges: { flexDirection: 'row', gap: 5 },
  stats: { color: colors.text, fontSize: 12, marginTop: 8, marginBottom: 2 },
});
