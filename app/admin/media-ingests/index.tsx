import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminLoading, AdminProgress, AdminScreen, adminStyles } from '@/admin/ui';
import { useIngestList } from '@/admin/ingest/api';
import { displayProgress, formatEta, formatSpeed, ingestStatusLabel, ingestTone } from '@/admin/ingest/helpers';
import type { MediaIngest } from '@/admin/ingest/types';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

export default function MediaIngestsScreen() {
  const { t } = useI18n();
  const ingests = useIngestList();
  const items = ingests.data ?? [];

  return <AdminScreen
    title={t('Media ingest')}
    subtitle={t('Download torrents or upload files, then attach them as movies or series.')}
    refreshing={ingests.isRefetching}
    onRefresh={() => void ingests.refetch()}
  >
    <AdminButtons>
      <AdminButton variant="primary" icon="add" label={t('New ingest')} onPress={() => router.push('/admin/media-ingests/new')} />
      <AdminButton icon="refresh" label={t('Refresh')} busy={ingests.isRefetching} onPress={() => void ingests.refetch()} />
    </AdminButtons>
    <AdminError error={ingests.error} />
    {ingests.isLoading ? <AdminLoading /> : !items.length ? <AdminEmpty text={t('No media ingests yet.')} /> : <View style={styles.list}>
      {items.map((item) => <IngestCard key={item.id} item={item} />)}
    </View>}
  </AdminScreen>;
}

function IngestCard({ item }: { item: MediaIngest }) {
  const { t } = useI18n();
  const progress = displayProgress(item);
  const extra = [`${progress}%`, formatSpeed(item.download_speed), item.eta > 0 ? formatEta(item.eta) : ''].filter(Boolean).join(' · ');
  return <PressableScale onPress={() => router.push({ pathname: '/admin/media-ingests/[id]', params: { id: item.id } })}>
    <AdminCard>
      <View style={adminStyles.inlineRow}>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
          <Text style={adminStyles.muted}>{[item.media_type === 'series' ? t('Series') : t('Movie'), item.year || ''].filter(Boolean).join(' · ')}</Text>
        </View>
        <AdminBadge label={ingestStatusLabel(t, item.status)} tone={ingestTone(item.status)} />
      </View>
      <AdminProgress value={progress} label={extra} />
      {!!item.video_status && <Text style={[adminStyles.muted, styles.gap]}>{t('Video: {status} ({progress}%)', { status: item.video_status, progress: item.video_progress || 0 })}</Text>}
      {!!item.error_message && <Text numberOfLines={3} style={styles.error}>{item.error_message}</Text>}
      <Text numberOfLines={1} style={[adminStyles.mono, styles.gap]}>{item.source_url}</Text>
    </AdminCard>
  </PressableScale>;
}

const styles = StyleSheet.create({
  list: { marginTop: 16 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  gap: { marginTop: 6 },
  error: { color: '#fca5a5', fontSize: 12, lineHeight: 17, marginTop: 6 },
});
