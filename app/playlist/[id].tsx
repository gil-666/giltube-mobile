import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

export default function PlaylistScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>(); const insets = useSafeAreaInsets(); const { t, compactNumber, number } = useI18n(); const playlist = useQuery({ queryKey: ['playlist', id], queryFn: () => giltubeAPI.playlist(id), enabled: !!id });
  return <View style={[styles.screen, { paddingTop: insets.top + 8 }]}><View style={styles.header}><PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={25} color={colors.text} /></PressableScale><View style={styles.headingCopy}><Text numberOfLines={1} style={styles.heading}>{playlist.data?.playlist.title || t('Playlist')}</Text><Text style={styles.subheading}>{number(playlist.data?.videos.length || 0)} {t((playlist.data?.videos.length || 0) === 1 ? 'video' : 'videos')}</Text></View></View>{playlist.isLoading && <ActivityIndicator style={styles.loader} color={colors.accentBright} />}<FlatList data={playlist.data?.videos || []} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} renderItem={({ item, index }) => <PressableScale onPress={() => router.push({ pathname: '/video/[id]', params: { id: item.id, playlist_id: id, index } })} style={styles.video}><Image source={resolveMediaURL(item.thumbnail_url)} style={styles.art} contentFit="cover" /><View style={styles.copy}><Text numberOfLines={2} style={styles.title}>{item.title}</Text><Text style={styles.meta}>{compactNumber(item.views)} {t(item.views === 1 ? 'view' : 'views')}</Text></View><Ionicons name="play-circle" size={25} color={colors.textMuted} /></PressableScale>} /></View>;
}
const useStyles = makeStyles(() => ({ screen: { flex: 1, backgroundColor: colors.screen }, header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, headingCopy: { flex: 1, marginLeft: 4 }, heading: { color: colors.text, fontSize: 22, fontWeight: '900' }, subheading: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, loader: { marginTop: 80 }, video: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, art: { width: 124, aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, copy: { flex: 1 }, title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 5 } }));
