import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';

import { adminRequest } from '@/admin/api';
import { AdminRow, AdminScreen, AdminSection, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

type AdminStats = { total_users: number; total_channels: number; total_videos: number; total_views: number; total_comments: number; admin_count: number; total_categories: number };
type Tool = { href: string; icon: ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string };

const groups: { title: string; tools: Tool[] }[] = [
  { title: 'People', tools: [
    { href: '/admin/users', icon: 'people-outline', title: 'Users', subtitle: 'Admins, suspensions and bans' },
    { href: '/admin/channels', icon: 'tv-outline', title: 'Channels', subtitle: 'Moderate channels and their videos' },
    { href: '/admin/videos', icon: 'film-outline', title: 'Videos', subtitle: 'Edit, verify, tracks and removal' },
  ] },
  { title: 'Library', tools: [
    { href: '/admin/movies', icon: 'videocam-outline', title: 'Movies', subtitle: 'Details, ratings, files and tracks' },
    { href: '/admin/series', icon: 'albums-outline', title: 'Series', subtitle: 'Details, episodes, intros and tracks' },
    { href: '/admin/intro-suggestions', icon: 'play-skip-forward-outline', title: 'Intro suggestions', subtitle: 'Review intro timings from viewers' },
    { href: '/admin/music', icon: 'musical-notes-outline', title: 'Music', subtitle: 'Artists, releases and tracks' },
  ] },
  { title: 'Pipeline', tools: [
    { href: '/admin/media-ingests', icon: 'cloud-download-outline', title: 'Media ingest', subtitle: 'Import movies and series from the server' },
    { href: '/admin/transcode-jobs', icon: 'construct-outline', title: 'Transcode jobs', subtitle: 'Queue, progress and retries' },
    { href: '/admin/workers', icon: 'hardware-chip-outline', title: 'Workers', subtitle: 'Remote encoders and enrollment' },
    { href: '/admin/youtube-mirrors', icon: 'logo-youtube', title: 'YouTube mirrors', subtitle: 'Mirrored channels and imports' },
  ] },
  { title: 'Home & playback', tools: [
    { href: '/admin/featured', icon: 'star-outline', title: 'Featured', subtitle: 'Home banner content' },
    { href: '/admin/news', icon: 'megaphone-outline', title: 'News', subtitle: 'Startup panels and announcements' },
    { href: '/admin/playback-intro', icon: 'sparkles-outline', title: 'Playback intro', subtitle: 'Clip before movies and episodes' },
  ] },
];

export default function AdminHomeScreen() {
  const styles = useStyles();
  const { t, compactNumber } = useI18n();
  const isAdmin = useIsAdmin();
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => adminRequest<AdminStats>('/stats'), enabled: isAdmin });
  const tiles = stats.data ? [
    [t('Users'), stats.data.total_users], [t('Channels'), stats.data.total_channels], [t('Videos'), stats.data.total_videos],
    [t('Views'), stats.data.total_views], [t('Comments'), stats.data.total_comments], [t('Admins'), stats.data.admin_count],
  ] as const : [];
  return <AdminScreen title={t('Admin console')} subtitle={t('Manage GilTube')} refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()}>
    {!!tiles.length && <View style={styles.stats}>{tiles.map(([label, value]) => <View key={label} style={styles.stat}><Text style={styles.statValue}>{compactNumber(value)}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>}
    {groups.map((group) => <AdminSection key={group.title} title={t(group.title)}>
      {group.tools.map((tool) => <AdminRow key={tool.href} icon={tool.icon} title={t(tool.title)} subtitle={t(tool.subtitle)} onPress={() => router.push(tool.href as Href)} />)}
    </AdminSection>)}
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { width: '31.5%', borderRadius: radii.md, backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 10 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
}));
