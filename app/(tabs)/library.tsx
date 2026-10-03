import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useDownloads } from '@/downloads/DownloadProvider';
import { usePlayer } from '@/player/PlayerProvider';
import { useI18n } from '@/i18n';
import { PlaylistCreator } from '@/playlists/PlaylistCreator';
import { colors, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

function fileSize(bytes: number) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export default function LibraryScreen() {
  const insets = useSafeAreaInsets(); const { downloads, remove } = useDownloads(); const { play } = usePlayer(); const { account, status } = useAuth();
  const { t } = useI18n();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const playlists = useQuery({ queryKey: ['playlists', account?.id], queryFn: () => giltubeAPI.playlists(account!.id), enabled: status === 'signedIn' && !!account });
  const playlistItems = Array.isArray(playlists.data?.playlists) ? playlists.data.playlists : [];
  const openDownload = async (index: number) => { const entry = downloads[index]; await play(entry.video, entry.fileUri); router.push({ pathname: '/video/[id]', params: { id: entry.video.id } }); };
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 }}>
    <Text style={styles.heading}>{t('Library')}</Text>
    <Text style={styles.sectionTitle}>{t('Offline downloads')}</Text>
    {!downloads.length && <Animated.View entering={FadeInDown.duration(420)} style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="download-outline" size={27} color={colors.accentBright} /></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{t('Nothing downloaded')}</Text><Text style={styles.emptyBody}>{t('Use a video’s three-dot menu to save it offline.')}</Text></View></Animated.View>}
    {downloads.map((item, index) => <Animated.View key={item.video.id} entering={FadeInDown.delay(Math.min(index, 6) * 45).duration(340)} style={styles.row}><PressableScale onPress={() => void openDownload(index)} style={styles.openArea}><Image source={resolveMediaURL(item.video.thumbnail_url)} style={styles.thumbnail} contentFit="cover" /><View style={styles.copy}><Text numberOfLines={2} style={styles.title}>{item.video.title}</Text><Text numberOfLines={1} style={styles.offlineMeta}>{item.quality} · {fileSize(item.bytes)}</Text></View></PressableScale><PressableScale accessibilityLabel={t('Remove download')} onPress={() => void remove(item.video.id)} style={styles.remove}><Ionicons name="trash-outline" size={19} color={colors.textMuted} /></PressableScale></Animated.View>)}
    <View style={styles.playlistHeader}><Text style={styles.sectionTitle}>{t('Playlists')}</Text>{status === 'signedIn' ? <PressableScale accessibilityLabel={t('Create playlist')} onPress={() => setCreatorOpen(true)} style={styles.addPlaylist}><Ionicons name="add" color={colors.white} size={21} /></PressableScale> : <PressableScale onPress={() => router.push('/login')}><Text style={styles.signIn}>{t('Sign in')}</Text></PressableScale>}</View>
    {status === 'signedIn' && !playlists.isLoading && !playlistItems.length && <Text style={styles.playlistEmpty}>{t('Your playlists will appear here.')}</Text>}
    {playlistItems.map((playlist) => <PressableScale key={playlist.id} onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: playlist.id } })} style={styles.playlist}><Image source={resolveMediaURL(playlist.thumbnail_url || '')} style={styles.playlistArt} contentFit="cover" /><View style={styles.copy}><Text style={styles.title}>{playlist.title}</Text><Text style={styles.meta}>{playlist.video_count} {t(playlist.video_count === 1 ? 'video' : 'videos')} · {t(playlist.visibility === 'private' ? 'Private' : playlist.visibility === 'unlisted' ? 'Unlisted' : 'Public')}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.textDim} /></PressableScale>)}
    <PlaylistCreator visible={creatorOpen} onClose={() => setCreatorOpen(false)} onCreated={(playlist) => router.push({ pathname: '/playlist/[id]', params: { id: playlist.id } })} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 18 }, heading: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.2 }, sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 25, marginBottom: 13 }, empty: { minHeight: 90, flexDirection: 'row', alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16 }, emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(239,68,68,.12)', alignItems: 'center', justifyContent: 'center' }, emptyCopy: { flex: 1, marginLeft: 14 }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, emptyBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }, row: { minHeight: 84, flexDirection: 'row', alignItems: 'center', borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 10 }, openArea: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }, thumbnail: { width: 126, height: 82, backgroundColor: colors.black }, copy: { flex: 1, minWidth: 0, paddingHorizontal: 12 }, title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' }, offlineMeta: { color: colors.success, fontSize: 11, marginTop: 6 }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 5 }, remove: { width: 46, height: 54, alignItems: 'center', justifyContent: 'center' }, playlistHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, addPlaylist: { width: 38, height: 38, marginTop: 12, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, signIn: { color: colors.gilid, fontSize: 13, fontWeight: '800', marginTop: 14 }, playlistEmpty: { color: colors.textMuted, fontSize: 13, paddingVertical: 10 }, playlist: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, playlistArt: { width: 84, height: 50, borderRadius: radii.md, backgroundColor: colors.surfaceStrong },
});
