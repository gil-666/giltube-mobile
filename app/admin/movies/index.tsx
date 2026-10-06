import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { moviesAPI } from '@/admin/movies/api';
import { AdminBadge, AdminButton, AdminEmpty, AdminError, AdminField, AdminLoading, AdminRow, AdminScreen, AdminSection, adminStyles, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { resolveMediaURL } from '@/utils/media';

export default function AdminMoviesScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState('');
  const movies = useQuery({ queryKey: ['admin', 'movies', 'list'], queryFn: moviesAPI.list, enabled: isAdmin });

  const filtered = useMemo(() => {
    const list = [...(movies.data?.movies || [])].sort((a, b) => a.title.localeCompare(b.title));
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((movie) => [movie.title, movie.slug, movie.genre, movie.id, String(movie.release_year || '')].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [movies.data, search]);

  const open = (id: string) => router.push({ pathname: '/admin/movies/[id]', params: { id } });

  return <AdminScreen
    title={t('Movies')}
    subtitle={t('Details, ratings, files and tracks')}
    refreshing={movies.isRefetching}
    onRefresh={() => void movies.refetch()}
    right={<AdminButton compact variant="primary" icon="add" label={t('New')} onPress={() => open('new')} />}
  >
    <AdminField label={t('Search movies')} value={search} onChangeText={setSearch} placeholder={t('Title, genre, year or id')} autoCapitalize="none" />
    <AdminSection title={movies.data ? t('{count} movies', { count: filtered.length }) : t('Movies')}>
      {movies.isLoading ? <AdminLoading /> : movies.error ? <AdminError error={movies.error} /> : filtered.length === 0
        ? <AdminEmpty text={search.trim() ? t('No movies match your search.') : t('No movies yet.')} />
        : filtered.map((movie) => <AdminRow
          key={movie.id}
          title={movie.title}
          subtitle={[movie.release_year || null, movie.genre].filter(Boolean).join(' · ')}
          onPress={() => open(movie.id)}
          imageSlot={movie.poster_url
            ? <Image source={{ uri: resolveMediaURL(movie.poster_url) }} style={adminStyles.poster} contentFit="cover" />
            : <View style={adminStyles.poster} />}
          badges={<>
            <AdminBadge label={movie.video_id ? t('Linked') : t('No video')} tone={movie.video_id ? 'good' : 'warn'} />
            {!!movie.trailer_video_id && <AdminBadge label={t('Trailer')} tone="info" />}
            {movie.is_featured && <AdminBadge label={t('Featured')} tone="info" />}
            {!!movie.explicit && <AdminBadge label="18+" tone="bad" />}
            {!!movie.content_warning && <AdminBadge label={t('Warning')} tone="warn" />}
            {!!movie.content_rating?.rating && <AdminBadge label={movie.content_rating.rating} />}
          </>}
        />)}
    </AdminSection>
    <View style={styles.bottomGap} />
  </AdminScreen>;
}

const styles = StyleSheet.create({
  bottomGap: { height: 12 },
});
