import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AdminBadge, AdminButton, AdminRow, adminStyles, alertError, confirmAction } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

import { peopleAPI, type AdminVideo, type ModerationAction } from './api';

type Translate = ReturnType<typeof useI18n>['t'];

export const statusFilters = ['all', 'active', 'suspended', 'banned'] as const;
export type StatusFilter = (typeof statusFilters)[number];

export function statusFilterOptions(t: Translate) {
  return [
    { value: 'all' as const, label: t('All') },
    { value: 'active' as const, label: t('Active') },
    { value: 'suspended' as const, label: t('Suspended') },
    { value: 'banned' as const, label: t('Banned') },
  ];
}

export function normalizedStatus(status?: string) {
  return status || 'active';
}

export function StatusBadge({ status }: { status?: string }) {
  const { t } = useI18n();
  const value = normalizedStatus(status);
  const tone = value === 'active' ? 'good' : value === 'suspended' ? 'warn' : 'bad';
  const label = value === 'active' ? t('Active') : value === 'suspended' ? t('Suspended') : value === 'banned' ? t('Banned') : value;
  return <AdminBadge label={label} tone={tone} />;
}

export function videoStatusLabel(t: Translate, status?: string) {
  switch (status) {
    case 'ready': return t('Ready');
    case 'processing': return t('Processing');
    case 'queued': return t('Queued');
    case 'error':
    case 'failed': return t('Failed');
    default: return status || t('Unknown');
  }
}

export function VideoStatusBadge({ status }: { status?: string }) {
  const { t } = useI18n();
  const tone = status === 'ready' ? 'good' : status === 'error' || status === 'failed' ? 'bad' : 'warn';
  return <AdminBadge label={videoStatusLabel(t, status)} tone={tone} />;
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const styles = useStyles();
  return <View style={styles.search}>
    <Ionicons name="search" size={17} color={colors.textDim} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      selectionColor={colors.accentBright}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType="search"
      style={styles.searchInput}
    />
  </View>;
}

export function VideoListRow({ video, onPress, showChannel }: { video: AdminVideo; onPress: () => void; showChannel?: boolean }) {
  const styles = useStyles();
  const { t, compactNumber } = useI18n();
  const thumbnail = resolveMediaURL(video.thumbnail_url);
  const stats = t('{views} views · {likes} likes · {comments} comments', { views: compactNumber(video.views), likes: compactNumber(video.likes), comments: compactNumber(video.comments_count) });
  const owner = showChannel && video.channel_name ? `${video.channel_name}${video.owner_username ? ` · @${video.owner_username}` : ''}\n` : '';
  return <AdminRow
    title={video.title || t('Untitled video')}
    subtitle={`${owner}${stats}`}
    onPress={onPress}
    imageSlot={thumbnail ? <Image source={{ uri: thumbnail }} style={adminStyles.thumb} contentFit="cover" /> : <View style={[adminStyles.thumb, styles.thumbEmpty]}><Ionicons name="film-outline" size={18} color={colors.textDim} /></View>}
    badges={<>
      <VideoStatusBadge status={video.status} />
      {video.hidden && <AdminBadge label={t('Hidden')} tone="bad" />}
      {video.explicit && <AdminBadge label={t('18+')} tone="warn" />}
      {video.has_custom_thumbnail && <AdminBadge label={t('Custom thumbnail')} tone="info" />}
    </>}
  />;
}

type ModerationTarget = { kind: 'user' | 'channel'; id: string; name: string };

/** Suspend/ban (confirmed) and their reversals for users and channels; refreshes every people list afterwards. */
export function useModeration() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const execute = async (target: ModerationTarget, action: ModerationAction) => {
    setBusy(`${target.id}:${action}`);
    try {
      if (target.kind === 'user') await peopleAPI.moderateUser(target.id, action);
      else await peopleAPI.moderateChannel(target.id, action);
      // Bans hide or unhide videos too, so refresh everything in this area.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
    } finally {
      setBusy(null);
    }
  };

  const run = (target: ModerationTarget, action: ModerationAction) => {
    const name = target.name;
    if (action === 'suspend') {
      confirmAction(t, target.kind === 'user' ? t('Suspend user') : t('Suspend channel'), target.kind === 'user'
        ? t('Suspend user "{name}"? They can still sign in and use GilTube but cannot upload videos.', { name })
        : t('Suspend channel "{name}"? It stays accessible but cannot upload videos.', { name }), () => execute(target, action), 'Suspend');
      return;
    }
    if (action === 'ban') {
      confirmAction(t, target.kind === 'user' ? t('Ban user') : t('Ban channel'), target.kind === 'user'
        ? t('Ban user "{name}"? They will be unable to sign in and all their videos will be hidden. This is a serious action.', { name })
        : t('Ban channel "{name}"? All its videos will be hidden and its owner cannot switch to it.', { name }), () => execute(target, action), 'Ban');
      return;
    }
    void execute(target, action).catch(alertError(t));
  };

  const isBusy = (targetID: string, action: ModerationAction) => busy === `${targetID}:${action}`;
  return { run, isBusy };
}

/** The web panel's per-row moderation buttons; admin-owned accounts and channels are protected. */
export function ModerationButtons({ kind, id, name, status, isProtected, moderation }: ModerationTarget & { status?: string; isProtected: boolean; moderation: ReturnType<typeof useModeration> }) {
  const { t } = useI18n();
  const value = normalizedStatus(status);
  const target = { kind, id, name };
  return <>
    {value !== 'suspended' && !isProtected && <AdminButton compact icon="pause-circle-outline" label={t('Suspend')} busy={moderation.isBusy(id, 'suspend')} onPress={() => moderation.run(target, 'suspend')} />}
    {value === 'suspended' && <AdminButton compact icon="play-circle-outline" label={t('Unsuspend')} busy={moderation.isBusy(id, 'unsuspend')} onPress={() => moderation.run(target, 'unsuspend')} />}
    {value !== 'banned' && !isProtected && <AdminButton compact variant="danger" icon="ban-outline" label={t('Ban')} busy={moderation.isBusy(id, 'ban')} onPress={() => moderation.run(target, 'ban')} />}
    {value === 'banned' && <AdminButton compact icon="checkmark-circle-outline" label={t('Unban')} busy={moderation.isBusy(id, 'unban')} onPress={() => moderation.run(target, 'unban')} />}
  </>;
}

const useStyles = makeStyles(() => ({
  search: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 13, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
}));
