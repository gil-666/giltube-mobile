import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { peopleAPI, peopleKeys } from '@/admin/people/api';
import { SearchField, VideoListRow } from '@/admin/people/shared';
import { AdminButton, AdminButtons, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminScreen, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

const PAGE = 50;
// The backend caps /admin/videos at 1000 rows and has no offset, so "load more" grows the limit.
const MAX_LIMIT = 1000;
type VideoFilter = 'all' | 'hidden' | 'explicit' | 'not-ready' | 'custom-thumbnail';

export default function AdminVideosScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState<VideoFilter>('all');

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setLimit(PAGE); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const videos = useQuery({ queryKey: peopleKeys.videos(query, limit), queryFn: () => peopleAPI.videos(query, limit), enabled: isAdmin, placeholderData: keepPreviousData });
  const rows = useMemo(() => (videos.data ?? []).filter((video) => {
    if (filter === 'hidden') return video.hidden;
    if (filter === 'explicit') return video.explicit;
    if (filter === 'not-ready') return video.status !== 'ready';
    if (filter === 'custom-thumbnail') return video.has_custom_thumbnail;
    return true;
  }), [videos.data, filter]);
  const canLoadMore = (videos.data?.length ?? 0) >= limit && limit < MAX_LIMIT;

  return <AdminScreen title={t('Videos')} subtitle={t('Edit, verify, tracks and removal')} refreshing={videos.isRefetching && !videos.isPlaceholderData} onRefresh={() => void videos.refetch()}>
    <SearchField value={search} onChangeText={setSearch} placeholder={t('Search title, description, ID, channel or owner')} />
    <AdminChips options={[
      { value: 'all', label: t('All') },
      { value: 'hidden', label: t('Hidden') },
      { value: 'explicit', label: t('18+') },
      { value: 'not-ready', label: t('Not ready') },
      { value: 'custom-thumbnail', label: t('Custom thumbnail') },
    ]} value={filter} onChange={setFilter} />
    <AdminError error={videos.error} />
    {videos.isLoading ? <AdminLoading /> : <>
      {!!videos.data && <Text style={styles.count}>{filter === 'all'
        ? t('{count} newest videos', { count: videos.data.length })
        : t('{count} of the {total} newest videos', { count: rows.length, total: videos.data.length })}</Text>}
      {rows.map((video) => <VideoListRow key={video.id} video={video} showChannel onPress={() => router.push({ pathname: '/admin/videos/[id]', params: { id: video.id } })} />)}
      {!rows.length && !videos.error && <AdminEmpty text={query || filter !== 'all' ? t('No videos match these filters.') : t('No videos yet.')} />}
      {canLoadMore && <AdminButtons><AdminButton label={t('Load more')} icon="chevron-down" busy={videos.isFetching} onPress={() => setLimit((value) => Math.min(MAX_LIMIT, value + PAGE))} /></AdminButtons>}
    </>}
  </AdminScreen>;
}

const styles = StyleSheet.create({
  count: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 4 },
});
