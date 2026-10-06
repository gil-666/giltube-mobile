import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { seriesAPI, seriesKeys } from '@/admin/series/api';
import { AdminBadge, AdminButton, AdminButtons, AdminEmpty, AdminError, AdminLoading, AdminRow, AdminScreen, AdminSection, useAdminStyles, useIsAdmin } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

export default function AdminSeriesListScreen() {
  const styles = useStyles();
  const adminStyles = useAdminStyles();
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState('');
  const series = useQuery({ queryKey: seriesKeys.list, queryFn: seriesAPI.list, enabled: isAdmin });
  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = series.data?.series || [];
    return query ? all.filter((item) => `${item.title} ${item.slug} ${item.genre}`.toLowerCase().includes(query)) : all;
  }, [search, series.data]);
  const openNew = () => router.push({ pathname: '/admin/series/[id]', params: { id: 'new' } });

  return <AdminScreen
    title={t('Series')}
    subtitle={t('Create metadata, upload a public trailer, and ingest hidden episode videos.')}
    refreshing={series.isRefetching}
    onRefresh={() => void series.refetch()}
    right={<PressableScale accessibilityLabel={t('New series')} onPress={openNew} style={styles.add}><Ionicons name="add" size={24} color={colors.onText} /></PressableScale>}
  >
    <TextInput value={search} onChangeText={setSearch} placeholder={t('Search series')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} autoCapitalize="none" style={styles.search} />
    <AdminButtons>
      <AdminButton variant="primary" icon="add" label={t('New series')} onPress={openNew} />
      <AdminButton icon="play-skip-forward-outline" label={t('Intro suggestions')} onPress={() => router.push('/admin/intro-suggestions')} />
    </AdminButtons>
    <AdminError error={series.error} />
    <AdminSection title={t('{count} series', { count: items.length })}>
      {series.isLoading ? <AdminLoading /> : !items.length ? <AdminEmpty text={t('No series yet.')} /> : items.map((item) => <AdminRow
        key={item.id}
        title={item.title}
        subtitle={[item.genre, t('{count} episodes', { count: item.episode_count || 0 }), t('{count} seasons', { count: item.seasons || 1 })].filter(Boolean).join(' · ')}
        imageSlot={<Image source={resolveMediaURL(item.poster_url)} style={adminStyles.poster} contentFit="cover" />}
        badges={(item.is_featured || item.explicit || item.content_rating?.rating || !item.trailer_video_id) ? <>
          {item.is_featured && <AdminBadge tone="info" label={t('Featured')} />}
          {item.explicit && <AdminBadge tone="bad" label="18+" />}
          {!!item.content_rating?.rating && <AdminBadge label={item.content_rating.rating} />}
          {!item.trailer_video_id && <AdminBadge tone="warn" label={t('No trailer')} />}
        </> : undefined}
        onPress={() => router.push({ pathname: '/admin/series/[id]', params: { id: item.id } })}
      />)}
    </AdminSection>
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  add: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 46, marginTop: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 14, paddingHorizontal: 16 },
}));
