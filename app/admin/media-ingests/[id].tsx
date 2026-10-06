import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminProgress, AdminScreen, AdminSection, adminStyles, alertError, confirmAction } from '@/admin/ui';
import { deleteIngest, deleteIngestFiles, ingestKeys, pauseIngest, retryIngest, useIngestList } from '@/admin/ingest/api';
import { AttachPanel } from '@/admin/ingest/AttachPanel';
import { canDelete, canDeleteFiles, canOpenAttach, canPause, canRetry, canUseAsTrackSource, displayProgress, formatEta, formatSpeed, ingestStatusLabel, ingestTone } from '@/admin/ingest/helpers';
import { TrackImportPanel } from '@/admin/ingest/TrackImportPanel';
import type { MediaIngest } from '@/admin/ingest/types';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

type Tool = 'attach' | 'audio' | 'subtitles';
type Action = 'retry' | 'pause' | 'files' | 'delete';

export default function MediaIngestDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ingests = useIngestList();
  const item = ingests.data?.find((entry) => entry.id === id);

  return <AdminScreen
    title={item?.title ?? t('Media ingest')}
    subtitle={item ? [item.media_type === 'series' ? t('Series') : t('Movie'), item.year || ''].filter(Boolean).join(' · ') : undefined}
    refreshing={ingests.isRefetching}
    onRefresh={() => void ingests.refetch()}
  >
    <AdminError error={ingests.error} />
    {ingests.isLoading ? <AdminLoading /> : !item ? <AdminEmpty text={t('This ingest no longer exists.')} /> : <IngestDetail item={item} />}
  </AdminScreen>;
}

function IngestDetail({ item }: { item: MediaIngest }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const trackSource = canUseAsTrackSource(item);
  const tools: { value: Tool; label: string }[] = [
    ...(canOpenAttach(item) ? [{ value: 'attach' as const, label: item.attached_video_id ? t('Attach again') : t('Attach') }] : []),
    ...(trackSource ? [{ value: 'audio' as const, label: t('Audio tracks') }, { value: 'subtitles' as const, label: t('Subtitles') }] : []),
  ];
  const [tool, setTool] = useState<Tool | ''>('');
  const activeTool = tools.some((entry) => entry.value === tool) ? tool : '';

  const action = useMutation({
    mutationFn: async (kind: Action) => {
      if (kind === 'retry') await retryIngest(item.id);
      if (kind === 'pause') await pauseIngest(item.id);
      if (kind === 'files') await deleteIngestFiles(item.id);
      if (kind === 'delete') await deleteIngest(item.id);
      return kind;
    },
    onSuccess: async (kind) => {
      await queryClient.invalidateQueries({ queryKey: ingestKeys.list });
      if (kind === 'delete') { router.back(); return; }
      setMessage(kind === 'retry' ? t('Retry queued.') : kind === 'pause' ? t('Ingest paused.') : t('Downloaded files deleted.'));
    },
    onError: alertError(t),
  });
  const run = (kind: Action) => { setMessage(''); action.mutate(kind); };
  const busy = (kind: Action) => action.isPending && action.variables === kind;

  const progress = displayProgress(item);
  const progressLine = [`${progress}%`, formatSpeed(item.download_speed), item.eta > 0 ? formatEta(item.eta) : ''].filter(Boolean).join(' · ');

  return <View>
    <AdminCard style={styles.first}>
      <View style={adminStyles.inlineRow}>
        <AdminBadge label={ingestStatusLabel(t, item.status)} tone={ingestTone(item.status)} />
        {!!item.attached_video_id && <AdminBadge label={t('Attached')} tone="good" />}
      </View>
      <AdminProgress value={progress} label={progressLine} />
      {!!item.video_status && <Text style={[adminStyles.muted, styles.gap]}>{t('Video: {status} ({progress}%)', { status: item.video_status, progress: item.video_progress || 0 })}</Text>}
      {!!item.error_message && <Text style={styles.error}>{item.error_message}</Text>}
      <Text style={[styles.label, styles.gapLarge]}>{t('Source')}</Text>
      <Text selectable style={adminStyles.mono}>{item.source_url}</Text>
      <Text style={[styles.label, styles.gap]}>{t('Path')}</Text>
      <Text selectable style={adminStyles.mono}>{item.content_path || item.save_path || '-'}</Text>
      {item.media_type === 'series' && <Text style={[adminStyles.muted, styles.gap]}>{t('{count} season(s)', { count: item.season_count || 1 })}</Text>}
    </AdminCard>

    {!!message && <AdminNotice tone="good" text={message} />}
    <AdminButtons>
      {canRetry(item) && <AdminButton variant="primary" icon="refresh" label={t('Retry')} busy={busy('retry')} disabled={action.isPending} onPress={() => run('retry')} />}
      {canPause(item) && <AdminButton icon="pause" label={t('Pause')} busy={busy('pause')} disabled={action.isPending} onPress={() => run('pause')} />}
      {canDeleteFiles(item) && <AdminButton variant="danger" icon="folder-open-outline" label={t('Delete files')} busy={busy('files')} disabled={action.isPending} onPress={() => confirmAction(t, t('Delete downloaded files?'), t('Delete the downloaded files for "{title}"? Attached videos keep their own copies.', { title: item.title }), () => run('files'), 'Delete files')} />}
      {canDelete(item) && <AdminButton variant="danger" icon="trash-outline" label={t('Delete ingest')} busy={busy('delete')} disabled={action.isPending} onPress={() => confirmAction(t, t('Delete ingest?'), t('Delete this ingest and stop its download?'), () => run('delete'))} />}
    </AdminButtons>

    <AdminSection title={t('Tools')}>
      {!tools.length ? <AdminNotice tone="warn" text={t('Attach, audio and subtitle tools unlock once the download has finished.')} /> : <>
        <AdminChips value={activeTool} onChange={setTool} options={tools} />
        {activeTool === 'attach' && <AttachPanel item={item} onDone={(text) => { setMessage(text); setTool(''); }} />}
        {activeTool === 'audio' && <TrackImportPanel key="audio" item={item} kind="audio" />}
        {activeTool === 'subtitles' && <TrackImportPanel key="subtitles" item={item} kind="subtitle" />}
      </>}
    </AdminSection>
  </View>;
}

const styles = StyleSheet.create({
  first: { marginTop: 14 },
  gap: { marginTop: 6 },
  gapLarge: { marginTop: 12 },
  label: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 3 },
  error: { color: '#fca5a5', fontSize: 12, lineHeight: 17, marginTop: 8 },
});
