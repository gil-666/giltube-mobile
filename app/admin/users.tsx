import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { peopleAPI, peopleKeys, type AdminUser } from '@/admin/people/api';
import { ModerationButtons, SearchField, StatusBadge, normalizedStatus, statusFilterOptions, useModeration, type StatusFilter } from '@/admin/people/shared';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminScreen, adminStyles, alertError, confirmAction, useIsAdmin } from '@/admin/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

const PAGE = 40;

export default function AdminUsersScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: peopleKeys.users, queryFn: peopleAPI.users, enabled: isAdmin });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter | 'admin'>('all');
  const [visible, setVisible] = useState(PAGE);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users.data ?? []).filter((user) => {
      if (query && !user.username.toLowerCase().includes(query) && !user.email.toLowerCase().includes(query)) return false;
      if (filter === 'admin') return user.user_type === 'admin';
      return filter === 'all' || normalizedStatus(user.status) === filter;
    });
  }, [users.data, search, filter]);

  return <AdminScreen title={t('Users')} subtitle={t('Admins, suspensions and bans')} refreshing={users.isRefetching} onRefresh={() => void users.refetch()}>
    <AdminNotice tone="neutral" text={t('Suspended users can sign in but cannot upload. Banned users cannot sign in and their videos are hidden. Admin accounts are protected.')} />
    <SearchField value={search} onChangeText={(value) => { setSearch(value); setVisible(PAGE); }} placeholder={t('Search by username or email')} />
    <AdminChips options={[...statusFilterOptions(t), { value: 'admin' as const, label: t('Admins') }]} value={filter} onChange={(value) => { setFilter(value); setVisible(PAGE); }} />
    <AdminError error={users.error} />
    {users.isLoading ? <AdminLoading /> : <>
      {!!users.data && <Text style={styles.count}>{t('{count} of {total} users', { count: filtered.length, total: users.data.length })}</Text>}
      {filtered.slice(0, visible).map((user) => <UserCard key={user.id} user={user} onChanged={() => queryClient.invalidateQueries({ queryKey: ['admin', 'people'] })} />)}
      {!filtered.length && !users.error && <AdminEmpty text={search || filter !== 'all' ? t('No users match these filters.') : t('No users yet.')} />}
      {filtered.length > visible && <AdminButtons><AdminButton label={t('Load more')} icon="chevron-down" onPress={() => setVisible((value) => value + PAGE)} /></AdminButtons>}
    </>}
  </AdminScreen>;
}

function UserCard({ user, onChanged }: { user: AdminUser; onChanged: () => Promise<unknown> }) {
  const { t, compactNumber, dateTime } = useI18n();
  const { account } = useAuth();
  const moderation = useModeration();
  const isAdminUser = user.user_type === 'admin';
  const isSelf = account?.id === user.id;

  const toggleAdmin = useMutation({ mutationFn: () => peopleAPI.toggleAdmin(user.id), onSuccess: onChanged, onError: alertError(t) });
  const remove = useMutation({ mutationFn: () => peopleAPI.deleteUser(user.id), onSuccess: onChanged });

  const confirmToggle = () => confirmAction(t,
    isAdminUser ? t('Remove admin') : t('Make admin'),
    isAdminUser
      ? isSelf ? t('Remove your own admin access? You will lose access to these tools.') : t('Remove admin access from "{name}"?', { name: user.username })
      : t('Give "{name}" full admin access?', { name: user.username }),
    () => toggleAdmin.mutateAsync(),
    isAdminUser ? 'Remove admin' : 'Make admin');

  const confirmDelete = () => confirmAction(t, t('Delete user'),
    t('Delete "{name}" and all their channels, videos and data? This cannot be undone.', { name: user.username }),
    () => remove.mutateAsync());

  return <AdminCard>
    <View style={styles.head}>
      <View style={styles.headCopy}>
        <Text numberOfLines={1} style={styles.name}>{user.username}{isSelf ? ` · ${t('You')}` : ''}</Text>
        <Text numberOfLines={1} selectable style={adminStyles.muted}>{user.email}</Text>
      </View>
      <View style={styles.badges}>
        <AdminBadge label={isAdminUser ? t('Admin') : t('User')} tone={isAdminUser ? 'info' : 'neutral'} />
        <StatusBadge status={user.status} />
      </View>
    </View>
    <Text style={styles.stats}>{t('{channels} channels · {videos} videos · {views} views', { channels: user.channel_count, videos: user.video_count, views: compactNumber(user.total_views) })}</Text>
    {!!user.created_at && <Text style={adminStyles.muted}>{t('Joined {date}', { date: dateTime(user.created_at, { dateStyle: 'medium' }) })}</Text>}
    <AdminButtons>
      <AdminButton compact icon={isAdminUser ? 'shield-outline' : 'shield-checkmark-outline'} label={isAdminUser ? t('Remove admin') : t('Make admin')} busy={toggleAdmin.isPending} onPress={confirmToggle} />
      <ModerationButtons kind="user" id={user.id} name={user.username} status={user.status} isProtected={isAdminUser} moderation={moderation} />
      {!isAdminUser && <AdminButton compact variant="danger" icon="trash-outline" label={t('Delete')} busy={remove.isPending} onPress={confirmDelete} />}
      {user.channel_count > 0 && <AdminButton compact icon="tv-outline" label={t('Channels')} onPress={() => router.push({ pathname: '/admin/channels', params: { q: user.username } })} />}
    </AdminButtons>
  </AdminCard>;
}

const styles = StyleSheet.create({
  count: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headCopy: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' },
  badges: { flexDirection: 'row', gap: 5 },
  stats: { color: colors.text, fontSize: 12, marginTop: 8, marginBottom: 2 },
});
