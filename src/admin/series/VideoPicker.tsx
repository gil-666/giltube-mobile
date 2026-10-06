import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminButton, AdminEmpty, AdminError, AdminLoading, AdminRow, adminStyles } from '@/admin/ui';
import { apiRequest } from '@/api/client';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { SearchResponse, Video } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export type PickedVideo = { id: string; title: string };
type Item = PickedVideo & { thumbnail: string; channel: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadVideos(query: string): Promise<Item[]> {
  if (!query) {
    const data = await apiRequest<Video[] | { videos?: Video[] }>('/videos?limit=24&offset=0');
    const videos = Array.isArray(data) ? data : data?.videos || [];
    return videos.map((video) => ({ id: video.id, title: video.title, thumbnail: video.thumbnail_url, channel: video.channel?.name || '' }));
  }
  const data = await apiRequest<SearchResponse>(`/search?q=${encodeURIComponent(query)}&page=1`);
  return (data?.results || []).filter((item) => item.type === 'video').map((item) => ({ id: item.video_id || item.id, title: item.title, thumbnail: item.thumbnail || '', channel: item.channel || '' }));
}

/** Full-screen chooser for an already uploaded video (trailer or episode source). */
export function VideoPicker({ visible, title, subtitle, actionLabel, onClose, onPick }: { visible: boolean; title: string; subtitle?: string; actionLabel: string; onClose: () => void; onPick: (video: PickedVideo) => void }) {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const videos = useQuery({ queryKey: ['admin', 'series', 'video-picker', query], queryFn: () => loadVideos(query), enabled: visible });
  const pastedID = UUID.test(text.trim()) ? text.trim() : '';

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: insets.bottom }]}>
      <View style={styles.top}>
        <View style={styles.topCopy}>
          <Text style={styles.heading}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <PressableScale accessibilityLabel={t('Close')} onPress={onClose} style={styles.close}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
      </View>
      <TextInput value={text} onChangeText={setText} placeholder={t('Search videos or paste a video ID')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} autoCapitalize="none" style={styles.search} />
      {!!pastedID && <AdminButton label={t('Use video ID {id}', { id: `${pastedID.slice(0, 8)}…` })} icon="link-outline" onPress={() => onPick({ id: pastedID, title: pastedID })} />}
      <AdminError error={videos.error} />
      <FlatList
        data={videos.data || []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={videos.isLoading ? <AdminLoading /> : <AdminEmpty text={t('No videos found.')} />}
        renderItem={({ item }) => <AdminRow
          title={item.title || item.id}
          subtitle={item.channel || item.id}
          imageSlot={<Image source={resolveMediaURL(item.thumbnail)} style={adminStyles.thumb} contentFit="cover" />}
          right={<AdminButton compact label={actionLabel} onPress={() => onPick({ id: item.id, title: item.title })} />}
        />}
      />
    </View>
  </Modal>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 18 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  topCopy: { flex: 1, minWidth: 0 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 46, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 14, paddingHorizontal: 16, marginBottom: 4 },
}));
