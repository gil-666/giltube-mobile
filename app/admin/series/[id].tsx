import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { seriesAPI, seriesKeys, type MetadataEpisode } from '@/admin/series/api';
import { EpisodesSection } from '@/admin/series/EpisodesSection';
import { SeriesDetailsForm, takePendingMetadataEpisodes } from '@/admin/series/SeriesDetailsForm';
import { TrailerSection } from '@/admin/series/TrailerSection';
import { AdminError, AdminLoading, AdminScreen, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';

export default function AdminSeriesEditorScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const isNew = id === 'new';
  const detail = useQuery({ queryKey: seriesKeys.detail(id), queryFn: () => seriesAPI.detail(id), enabled: isAdmin && !isNew });
  const [metadataEpisodes, setMetadataEpisodes] = useState<MetadataEpisode[]>(() => isNew ? [] : takePendingMetadataEpisodes(id));
  const series = detail.data?.series;

  return <AdminScreen
    title={isNew ? t('New series') : series?.title || t('Series')}
    subtitle={isNew ? t('Create metadata, upload a public trailer, and ingest hidden episode videos.') : t('{count} episodes', { count: detail.data?.episodes?.length || 0 })}
    refreshing={detail.isRefetching}
    onRefresh={isNew ? undefined : () => void detail.refetch()}
  >
    {isNew
      ? <SeriesDetailsForm key="new" seriesID="" metadataEpisodes={metadataEpisodes} onMetadataEpisodes={setMetadataEpisodes} />
      : detail.isLoading ? <AdminLoading />
        : !series ? <AdminError error={detail.error || t('Series not found.')} />
          : <>
            <SeriesDetailsForm key={series.id} seriesID={series.id} initial={series} metadataEpisodes={metadataEpisodes} onMetadataEpisodes={setMetadataEpisodes} />
            <TrailerSection series={series} />
            <EpisodesSection series={series} episodes={detail.data?.episodes || []} metadataEpisodes={metadataEpisodes} />
          </>}
  </AdminScreen>;
}
