import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminProgress, AdminScreen, adminStyles, alertError, confirmAction, useIsAdmin } from '@/admin/ui';
import { listTranscodeJobs, runTranscodeAction, transcodeKeys } from '@/admin/ingest/api';
import type { TranscodeAction, TranscodeJob } from '@/admin/ingest/types';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

const STATUSES = ['all', 'queued', 'running', 'paused', 'failed', 'cancelled', 'completed'] as const;
type StatusFilter = typeof STATUSES[number];
const STATUS_LABELS: Record<StatusFilter, string> = { all: 'All', queued: 'Queued', running: 'Running', paused: 'Paused', failed: 'Failed', cancelled: 'Cancelled', completed: 'Completed' };

const canStart = (status: string) => ['paused', 'failed', 'cancelled'].includes(status);
const canPause = (status: string) => ['queued', 'running', 'failed'].includes(status);
const canCancel = (status: string) => ['queued', 'running', 'paused', 'failed'].includes(status);
const safeProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value || 0)));

function statusTone(status: string) {
  if (status === 'running' || status === 'completed') return 'good' as const;
  if (status === 'queued') return 'info' as const;
  if (status === 'paused') return 'warn' as const;
  if (status === 'failed' || status === 'cancelled') return 'bad' as const;
  return 'neutral' as const;
}

export default function TranscodeJobsScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const jobs = useQuery({
    queryKey: transcodeKeys.list(status),
    queryFn: () => listTranscodeJobs(status),
    enabled: isAdmin,
    refetchInterval: (query) => focused && query.state.data?.some((job) => job.status === 'queued' || job.status === 'running') ? 5000 : false,
  });
  const action = useMutation({
    mutationFn: ({ job, kind }: { job: TranscodeJob; kind: TranscodeAction }) => runTranscodeAction(job.video_id, kind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'transcode'] }),
    onError: alertError(t),
  });
  const items = jobs.data ?? [];

  return <AdminScreen title={t('Transcode jobs')} subtitle={t('Queue, progress and retries')} refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()}>
    <AdminNotice tone="warn" text={t('Pause/cancel prevents queued and recovered jobs from starting; an already-running ffmpeg process may finish its current pass.')} />
    <AdminChips value={status} onChange={setStatus} options={STATUSES.map((value) => ({ value, label: t(STATUS_LABELS[value]) }))} />
    <AdminError error={jobs.error} />
    {jobs.isLoading ? <AdminLoading /> : !items.length ? <AdminEmpty text={t('No transcode jobs.')} /> : <View style={styles.list}>
      {items.map((job) => <JobCard
        key={job.video_id}
        job={job}
        busyAction={action.isPending && action.variables?.job.video_id === job.video_id ? action.variables.kind : undefined}
        onAction={(kind) => {
          if (kind === 'cancel') {
            confirmAction(t, t('Cancel transcode?'), t('Cancel transcoding for "{title}"?', { title: job.title || job.video_id }), () => action.mutateAsync({ job, kind }), 'Cancel job');
            return;
          }
          action.mutate({ job, kind });
        }}
      />)}
    </View>}
  </AdminScreen>;
}

function JobCard({ job, busyAction, onAction }: { job: TranscodeJob; busyAction?: TranscodeAction; onAction: (kind: TranscodeAction) => void }) {
  const { t, dateTime } = useI18n();
  const progress = safeProgress(job.progress);
  const statusLabel = (STATUS_LABELS as Record<string, string>)[job.status];
  const date = (value?: string) => value ? dateTime(value) : '';
  const busy = !!busyAction;
  return <AdminCard>
    <View style={adminStyles.inlineRow}>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>{job.title || job.video_id}</Text>
        <Text selectable numberOfLines={1} style={adminStyles.mono}>{job.video_id}</Text>
      </View>
      <AdminBadge label={statusLabel ? t(statusLabel) : job.status} tone={statusTone(job.status)} />
    </View>
    <AdminProgress value={progress} label={`${progress}% · ${t('Video: {status} ({progress}%)', { status: job.video_status || t('unknown'), progress: job.video_progress || 0 })}`} />
    {!!job.file_path && <Text selectable numberOfLines={2} style={[adminStyles.mono, styles.gap]}>{job.file_path}</Text>}
    {!!job.error_message && <Text style={styles.error}>{job.error_message}</Text>}
    <View style={styles.meta}>
      <Text style={adminStyles.muted}>{t('Attempts: {count}', { count: job.attempts || 0 })}</Text>
      {!!job.worker_id && <Text selectable style={adminStyles.muted}>{t('Worker: {id}', { id: job.worker_id })}</Text>}
      {!!job.updated_at && <Text style={adminStyles.muted}>{t('Updated: {date}', { date: date(job.updated_at) })}</Text>}
      {!!job.started_at && <Text style={adminStyles.muted}>{t('Started: {date}', { date: date(job.started_at) })}</Text>}
      {!!job.finished_at && <Text style={adminStyles.muted}>{t('Finished: {date}', { date: date(job.finished_at) })}</Text>}
    </View>
    <AdminButtons>
      {canStart(job.status) && <AdminButton compact variant="primary" icon="play" label={t('Start')} busy={busyAction === 'start'} disabled={busy} onPress={() => onAction('start')} />}
      <AdminButton compact icon="refresh" label={t('Restart')} busy={busyAction === 'restart'} disabled={busy} onPress={() => onAction('restart')} />
      {canPause(job.status) && <AdminButton compact icon="pause" label={t('Pause')} busy={busyAction === 'pause'} disabled={busy} onPress={() => onAction('pause')} />}
      {canCancel(job.status) && <AdminButton compact variant="danger" icon="close-circle-outline" label={t('Cancel job')} busy={busyAction === 'cancel'} disabled={busy} onPress={() => onAction('cancel')} />}
    </AdminButtons>
  </AdminCard>;
}

const styles = StyleSheet.create({
  list: { marginTop: 14 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  gap: { marginTop: 8 },
  meta: { marginTop: 8, gap: 2 },
  error: { color: '#fca5a5', fontSize: 12, lineHeight: 17, marginTop: 8 },
});
