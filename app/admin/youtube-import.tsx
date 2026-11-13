import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { youtubeImportAPI, youtubeImportKeys, type YouTubeImportSettings, type YouTubeImportStatus } from '@/api/youtubeImport';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminNumberField, AdminRow, AdminScreen, AdminSection, alertError, useAdminStyles, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';

const HEIGHTS = ['480', '720', '1080', '1440', '2160'] as const;

export default function YouTubeImportAdminScreen() {
  const adminStyles = useAdminStyles();
  const { t, dateTime } = useI18n();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const data = useQuery({ queryKey: youtubeImportKeys.admin, queryFn: youtubeImportAPI.adminSettings, enabled: isAdmin });
  // Unsaved edits; falls back to what the server returned.
  const [draft, setSettings] = useState<YouTubeImportSettings | null>(null);
  const settings = draft ?? data.data?.settings ?? null;
  const [lookup, setLookup] = useState('');
  const [saved, setSaved] = useState(false);

  const refresh = () => client.invalidateQueries({ queryKey: youtubeImportKeys.admin });

  const save = useMutation({
    mutationFn: (next: YouTubeImportSettings) => youtubeImportAPI.saveAdminSettings(next),
    onMutate: () => setSaved(false),
    onSuccess: async () => { await refresh(); setSettings(null); setSaved(true); },
    onError: (error) => { alertError(t)(error); setSettings(null); },
  });
  const access = useMutation({
    mutationFn: ({ user, value }: { user: string; value: '' | 'allowed' | 'revoked' }) => youtubeImportAPI.setUserAccess(user, value),
    onSuccess: (_result, variables) => { if (variables.user === lookup.trim()) setLookup(''); void refresh(); },
    onError: alertError(t),
  });

  const setMode = (mode: YouTubeImportSettings['mode']) => {
    if (!settings) return;
    const next = { ...settings, mode };
    setSettings(next);
    save.mutate(next);
  };

  const users = data.data?.users ?? [];
  const recent = data.data?.recent ?? [];

  return <AdminScreen title={t('Public YouTube import')} subtitle={t('Let users import YouTube videos to their own channels.')} refreshing={data.isRefetching} onRefresh={() => void data.refetch()}>
    <AdminError error={data.error} />
    {data.isLoading || !settings ? <AdminLoading /> : <>
      <AdminSection title={t('Who can use it')}>
        <AdminCard>
          <AdminChips options={[
            { value: 'everyone', label: t('Everyone') },
            { value: 'allowlist', label: t('Only allowed users') },
            { value: 'off', label: t('Off') },
          ]} value={settings.mode} onChange={setMode} />
          <Text style={adminStyles.muted}>{settings.mode === 'everyone' ? t('All signed-in users, except anyone revoked below.') : settings.mode === 'allowlist' ? t('Only users you allow below.') : t('Nobody can start new imports.')}</Text>
          <Text style={[adminStyles.muted, styles.gap]}>{t('Revoking blocks new imports right away; videos already imported stay on the channel.')}</Text>
        </AdminCard>
      </AdminSection>

      <AdminSection title={t('Limits')}>
        <AdminCard>
          <AdminNumberField label={t('Imports per user per day')} value={settings.daily_limit} onChange={(daily_limit) => setSettings({ ...settings, daily_limit })} help={t('0 means unlimited.')} />
          <AdminNumberField label={t('Max video length (minutes)')} value={settings.max_duration_minutes} onChange={(max_duration_minutes) => setSettings({ ...settings, max_duration_minutes })} help={t('0 means unlimited.')} />
          <AdminChips label={t('Max quality')} options={HEIGHTS.map((height) => ({ value: height, label: height === '2160' ? '4K' : `${height}p` }))} value={String(settings.max_height) as typeof HEIGHTS[number]} onChange={(height) => setSettings({ ...settings, max_height: Number(height) })} />
          <AdminButtons>
            <AdminButton variant="primary" icon="save-outline" label={t('Save')} busy={save.isPending} onPress={() => save.mutate(settings)} />
          </AdminButtons>
          {saved && <AdminNotice tone="good" text={t('Saved.')} />}
        </AdminCard>
      </AdminSection>

      <AdminSection title={t('User access')}>
        <AdminCard>
          <AdminField label={t('Username, email or user ID')} value={lookup} onChangeText={setLookup} autoCapitalize="none" />
          <AdminButtons>
            <AdminButton compact icon="checkmark-circle-outline" label={t('Allow')} disabled={!lookup.trim()} busy={access.isPending} onPress={() => access.mutate({ user: lookup.trim(), value: 'allowed' })} />
            <AdminButton compact variant="danger" icon="ban-outline" label={t('Revoke')} disabled={!lookup.trim()} busy={access.isPending} onPress={() => access.mutate({ user: lookup.trim(), value: 'revoked' })} />
          </AdminButtons>
        </AdminCard>
        {!users.length ? <AdminEmpty text={t('No per-user overrides yet.')} /> : users.map((user) => <AdminRow
          key={user.user_id}
          icon={user.access === 'revoked' ? 'ban-outline' : 'checkmark-circle-outline'}
          title={`@${user.username}`}
          subtitle={`${user.email}\n${t('{count} imports', { count: user.import_count })}`}
          badges={<AdminBadge label={user.access === 'revoked' ? t('Revoked') : t('Allowed')} tone={user.access === 'revoked' ? 'bad' : 'info'} />}
          right={<View style={styles.actions}>
            {user.access === 'revoked'
              ? <AdminButton compact icon="refresh-outline" label={t('Restore')} onPress={() => access.mutate({ user: user.user_id, value: settings.mode === 'allowlist' ? 'allowed' : '' })} />
              : <AdminButton compact variant="danger" icon="ban-outline" label={t('Revoke')} onPress={() => access.mutate({ user: user.user_id, value: 'revoked' })} />}
            <AdminButton compact icon="close-outline" label={t('Clear')} onPress={() => access.mutate({ user: user.user_id, value: '' })} />
          </View>}
        />)}
      </AdminSection>

      <AdminSection title={t('Recent imports')}>
        {!recent.length ? <AdminEmpty text={t('No one has imported a video yet.')} /> : recent.map((item) => <AdminRow
          key={item.id}
          icon="logo-youtube"
          title={item.title}
          subtitle={`@${item.username} → ${item.channel_name}\n${dateTime(item.created_at, { dateStyle: 'medium', timeStyle: 'short' })}${item.status === 'failed' && item.error ? `\n${item.error}` : ''}`}
          badges={<AdminBadge label={statusLabel(item.status, t)} tone={item.status === 'ready' ? 'good' : item.status === 'failed' ? 'bad' : 'neutral'} />}
          onPress={() => router.push({ pathname: '/video/[id]', params: { id: item.video_id } })}
          right={item.access === 'revoked'
            ? <AdminBadge label={t('Revoked')} tone="bad" />
            : <AdminButton compact variant="danger" icon="ban-outline" label={t('Revoke')} onPress={() => access.mutate({ user: item.user_id, value: 'revoked' })} />}
        />)}
      </AdminSection>
    </>}
  </AdminScreen>;
}

function statusLabel(status: YouTubeImportStatus, t: (source: string) => string) {
  switch (status) {
    case 'downloading': return t('Downloading');
    case 'processing': return t('Processing');
    case 'ready': return t('Ready');
    default: return t('Failed');
  }
}

const styles = StyleSheet.create({
  gap: { marginTop: 8 },
  actions: { gap: 6 },
});
