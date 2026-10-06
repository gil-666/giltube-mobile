import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { opsAPI, type EnrollmentCode, type WorkerNode, type WorkerRelease } from '@/admin/ops/api';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminProgress, AdminScreen, AdminSection, AdminToggle, adminStyles, alertError, confirmAction, formatBytes, useIsAdmin } from '@/admin/ui';
import { mediaOrigin } from '@/config/environment';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

const WORKERS_KEY = ['admin', 'ops', 'workers'] as const;

const osLabel = (os: string) => os === 'darwin' ? 'macOS' : os === 'windows' ? 'Windows' : os === 'linux' ? 'Linux' : os;
const archLabel = (arch: string) => arch === 'amd64' ? 'x64' : 'ARM64';
const statusTone = (status: string) => status === 'online' ? 'good' as const : status === 'revoked' ? 'bad' as const : 'neutral' as const;

export default function WorkersAdminScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const isFocused = useIsFocused();
  const client = useQueryClient();
  const workers = useQuery({ queryKey: WORKERS_KEY, queryFn: opsAPI.workers, enabled: isAdmin, refetchInterval: isFocused ? 20_000 : false });
  const [enrollment, setEnrollment] = useState<EnrollmentCode | null>(null);

  const createCode = useMutation({ mutationFn: opsAPI.createEnrollmentCode, onSuccess: setEnrollment, onError: alertError(t) });
  const list = useMemo(() => workers.data ?? [], [workers.data]);
  const onlineCount = list.filter((worker) => worker.status === 'online' && worker.effective_enabled).length;
  const gpuCount = list.filter((worker) => worker.is_gpu && !worker.disabled && worker.effective_enabled).length;
  const activeJobs = list.filter((worker) => worker.current_job).length;
  const refresh = () => client.invalidateQueries({ queryKey: WORKERS_KEY });

  return <AdminScreen title={t('Workers')} subtitle={t('Remote encoders that pick up transcode and live jobs.')} refreshing={workers.isRefetching} onRefresh={() => void workers.refetch()}>
    <View style={styles.stats}>
      <Stat label={t('Online')} value={onlineCount} color={colors.success} />
      <Stat label={t('GPU')} value={gpuCount} color={colors.text} />
      <Stat label={t('Active jobs')} value={activeJobs} color={colors.warning} />
    </View>
    <AdminButtons>
      <AdminButton variant="primary" icon="add" label={t('Add worker')} busy={createCode.isPending} onPress={() => createCode.mutate()} />
    </AdminButtons>

    {!!enrollment && <EnrollmentCard enrollment={enrollment} onClose={() => setEnrollment(null)} />}

    <AdminSection title={t('Workers')}>
      <AdminError error={workers.error} />
      {workers.isLoading ? <AdminLoading /> : !list.length ? <AdminEmpty text={t('No workers have been enrolled yet.')} /> : list.map((worker) => <WorkerCard key={worker.id} worker={worker} onChanged={refresh} />)}
    </AdminSection>
  </AdminScreen>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.statLabel}>{label.toUpperCase()}</Text></View>;
}

function WorkerCard({ worker, onChanged }: { worker: WorkerNode; onChanged: () => Promise<unknown> }) {
  const { t, relative } = useI18n();
  const action = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSettled: () => onChanged(), onError: alertError(t) });
  const busy = action.isPending;
  const role = worker.roles[0] || 'transcode';
  const liveEligible = worker.is_gpu && ['linux', 'windows'].includes(worker.platform.toLowerCase());
  const canEditRole = worker.managed && !worker.is_primary;
  const roleLocked = worker.disabled || !!worker.current_job || busy;

  const changeRole = (next: string) => {
    if (next === role) return;
    action.mutate(() => opsAPI.setRoles(worker.id, [next]));
  };
  const toggleScheduling = (enabled: boolean) => {
    if (!enabled && worker.current_job) {
      confirmAction(t, t('Stop accepting jobs?'), t('{name} is encoding right now. Its current job will be handed back to the queue.', { name: worker.name }), () => action.mutate(() => opsAPI.setScheduling(worker.id, false)), 'Pause');
      return;
    }
    action.mutate(() => opsAPI.setScheduling(worker.id, enabled));
  };
  const revoke = () => confirmAction(t, t('Revoke worker?'), t('{name} will stop receiving jobs and its credential will be revoked.', { name: worker.name }), () => action.mutate(() => opsAPI.revokeWorker(worker.id)), 'Revoke');
  const remove = () => confirmAction(t, t('Delete worker?'), t('Remove {name} permanently? It will need a new enrollment code to come back.', { name: worker.name }), () => action.mutate(() => opsAPI.deleteWorker(worker.id)));

  return <AdminCard>
    <View style={adminStyles.inlineRow}>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{worker.name}</Text>
        <Text selectable numberOfLines={1} style={adminStyles.mono}>{worker.id}</Text>
      </View>
      {worker.managed && !worker.disabled && <AdminButton compact variant="danger" icon="warning-outline" label={t('Revoke')} disabled={busy} onPress={revoke} />}
    </View>
    <View style={styles.badges}>
      <AdminBadge label={t(worker.status === 'online' ? 'Online' : worker.status === 'revoked' ? 'Revoked' : 'Offline')} tone={statusTone(worker.status)} />
      {!worker.managed && <AdminBadge label={t('Local')} />}
      {worker.is_primary && <AdminBadge label={t('Primary')} tone="info" />}
      {worker.fallback_active && <AdminBadge label={t('Fallback active')} tone="warn" />}
      {worker.is_gpu && <AdminBadge label="GPU" tone="info" />}
    </View>

    <View style={styles.facts}>
      <Fact label={t('System')} value={`${osLabel(worker.platform)} · ${worker.arch}`} />
      <Fact label={t('Encoder')} value={worker.encoder || '—'} />
      <Fact label={t('Last seen')} value={worker.last_seen ? relative(worker.last_seen) : '—'} />
      <Fact label={t('Version')} value={worker.version || '—'} />
      {!!worker.last_ip && <Fact label={t('Address')} value={worker.last_ip} />}
    </View>

    {canEditRole ? <>
      {roleLocked
        ? <Fact label={t('Role')} value={role === 'live-adaptive' ? t('Adaptive live') : t('Video transcoding')} />
        : <AdminChips label={t('Role')} value={role} onChange={changeRole} options={[{ value: 'transcode', label: t('Video transcoding') }, ...(liveEligible || role === 'live-adaptive' ? [{ value: 'live-adaptive', label: t('Adaptive live') }] : [])]} />}
      {!liveEligible && !roleLocked && <Text style={adminStyles.muted}>{t('Adaptive live needs a Linux or Windows GPU worker.')}</Text>}
      {!!worker.current_job && !worker.disabled && <Text style={adminStyles.muted}>{t('Roles can change once the current job finishes.')}</Text>}
    </> : <Fact label={t('Roles')} value={worker.roles.join(', ') || '—'} />}

    {!worker.disabled && <AdminToggle label={t('Accept jobs')} help={worker.fallback_active ? t('No other worker is available, so this one keeps working as a fallback.') : t('Turn off to drain this worker without revoking it.')} value={!worker.scheduling_disabled} disabled={busy} onChange={toggleScheduling} />}

    {!!worker.current_job && <AdminProgress value={worker.current_job.progress} label={`${worker.current_job.video_title || worker.current_job.video_id} · ${worker.current_job.progress}%`} />}

    {worker.disabled && <AdminButtons>
      <AdminButton compact icon="refresh" label={t('Enable')} busy={busy} onPress={() => action.mutate(() => opsAPI.enableWorker(worker.id))} />
      <AdminButton compact variant="danger" icon="trash-outline" label={t('Delete')} disabled={busy} onPress={remove} />
    </AdminButtons>}
  </AdminCard>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text numberOfLines={2} style={styles.factValue}>{value}</Text></View>;
}

function EnrollmentCard({ enrollment, onClose }: { enrollment: EnrollmentCode; onClose: () => void }) {
  const { t, dateTime } = useI18n();
  const releases = useQuery({ queryKey: ['admin', 'ops', 'workers', 'releases'], queryFn: opsAPI.releases });
  const [platform, setPlatform] = useState('linux/amd64');
  const options = useMemo(() => {
    const seen = new Set<string>();
    return (releases.data ?? []).filter((release) => {
      const key = `${release.os}/${release.arch}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((release) => ({ value: `${release.os}/${release.arch}`, label: `${osLabel(release.os)} · ${archLabel(release.arch)}` }));
  }, [releases.data]);
  const selected = releases.data?.find((release) => `${release.os}/${release.arch}` === platform) ?? releases.data?.[0];
  const wget = selected ? `wget --content-disposition "${mediaOrigin}/api/v1/worker-releases/latest/${selected.os}/${selected.arch}/download"` : '';

  return <AdminSection title={t('Enroll a worker')} right={<AdminButton compact icon="close" label={t('Close')} onPress={onClose} />}>
    <AdminCard>
      <Text style={styles.factLabel}>{t('One-time code')}</Text>
      <Text selectable style={styles.code}>{enrollment.code}</Text>
      <Text style={adminStyles.muted}>{t('Long-press to copy.')}</Text>
      <AdminNotice tone="warn" text={t('Expires at {time}', { time: dateTime(enrollment.expires_at, { timeStyle: 'short' }) })} />
    </AdminCard>

    <AdminCard>
      <Text style={styles.factLabel}>{t('Download')}</Text>
      {releases.isLoading ? <AdminLoading /> : <AdminError error={releases.error} />}
      {options.length > 1 && <AdminChips value={selected ? `${selected.os}/${selected.arch}` : platform} onChange={setPlatform} options={options} />}
      {!!selected && <ReleaseRow release={selected} primary />}
      {!!wget && <View style={styles.command}>
        <Text style={styles.factLabel}>{t('Headless download')}</Text>
        <Text selectable style={styles.commandText}>{wget}</Text>
      </View>}
      {(releases.data?.length ?? 0) > 1 && <>
        <Text style={[styles.factLabel, styles.spaced]}>{t('All builds')}</Text>
        {releases.data?.filter((release) => release.filename !== selected?.filename).map((release) => <ReleaseRow key={release.filename} release={release} />)}
      </>}
    </AdminCard>

    <AdminCard>
      {[t('Download the worker on the computer that will encode videos.'), t('Run it and follow the setup prompts.'), t('Enter the one-time code when the worker asks for it.')].map((step, index) => <View key={step} style={styles.step}>
        <Text style={styles.stepNumber}>{index + 1}</Text><Text style={[adminStyles.text, styles.copy]}>{step}</Text>
      </View>)}
      <Text style={[adminStyles.muted, styles.spaced]}>{t('The worker must be able to reach this GilTube server over the network.')}</Text>
    </AdminCard>
  </AdminSection>;
}

function ReleaseRow({ release, primary }: { release: WorkerRelease; primary?: boolean }) {
  const { t } = useI18n();
  const url = resolveMediaURL(release.download_url || `/api/v1/worker-releases/download/${encodeURIComponent(release.filename)}`);
  return <View style={styles.release}>
    <View style={styles.copy}>
      <Text style={styles.releaseTitle}>{osLabel(release.os)} · {archLabel(release.arch)}</Text>
      <Text selectable style={adminStyles.mono}>{release.filename}</Text>
      <Text style={adminStyles.muted}>{formatBytes(release.size)} · {release.version}{release.sha256 ? ` · SHA-256 ${release.sha256.slice(0, 12)}…` : ''}</Text>
    </View>
    <AdminButton compact variant={primary ? 'primary' : 'secondary'} icon="download-outline" label={t('Open')} onPress={() => void Linking.openURL(url).catch(alertError(t))} />
  </View>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, borderRadius: radii.md, backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 10 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800', marginTop: 2 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 16, fontWeight: '900' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  fact: { width: '50%', paddingVertical: 5, paddingRight: 8 },
  factLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  factValue: { color: colors.text, fontSize: 13, marginTop: 2 },
  code: { color: colors.text, fontSize: 22, fontWeight: '900', fontFamily: 'monospace', marginTop: 6, letterSpacing: 1 },
  command: { marginTop: 12, padding: 10, borderRadius: radii.md, backgroundColor: colors.black },
  commandText: { color: '#6ee7b7', fontSize: 11, lineHeight: 17, fontFamily: 'monospace', marginTop: 4 },
  spaced: { marginTop: 12 },
  release: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  releaseTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  step: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  stepNumber: { color: colors.accentBright, fontSize: 13, fontWeight: '900', width: 14 },
});
