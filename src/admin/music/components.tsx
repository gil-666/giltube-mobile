import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminButton, AdminEmpty, AdminLoading } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

import { musicAPI, musicKeys } from './api';
import type { AdminMusicVideoOption, LocalMusicFile } from './types';

/** Square artwork (release cover / artist image) with an icon fallback. */
export function MusicArtwork({ url, size = 46, round, localURI }: { url?: string; size?: number; round?: boolean; localURI?: string }) {
  const styles = useStyles();
  const source = localURI || (url ? resolveMediaURL(url) : '');
  const shape = { width: size, height: size, borderRadius: round ? size / 2 : radii.sm };
  if (!source) return <View style={[styles.artworkEmpty, shape]}><Ionicons name={round ? 'person-outline' : 'disc-outline'} size={size * 0.42} color={colors.textDim} /></View>;
  return <Image source={{ uri: source }} style={[styles.artwork, shape]} contentFit="cover" transition={120} />;
}

export type SelectOption = { value: string; label: string; subtitle?: string };

/** Tap-to-open list picker for long option lists (artists, releases, channels, tracks). */
export function MusicSelect({ label, value, options, onChange, placeholder, help, disabled, searchable = true }: { label: string; value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder?: string; help?: string; disabled?: boolean; searchable?: boolean }) {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.subtitle || ''}`.toLowerCase().includes(needle));
  }, [options, query]);
  const close = () => { setOpen(false); setQuery(''); };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <PressableScale disabled={disabled} onPress={() => setOpen(true)} style={[styles.select, disabled && styles.disabled]}>
      <View style={styles.selectCopy}>
        <Text numberOfLines={1} style={[styles.selectText, !selected && styles.placeholder]}>{selected?.label || placeholder || t('Choose…')}</Text>
        {!!selected?.subtitle && <Text numberOfLines={1} style={styles.selectSubtitle}>{selected.subtitle}</Text>}
      </View>
      <Ionicons name="chevron-down" size={18} color={colors.textDim} />
    </PressableScale>
    {!!help && <Text style={styles.help}>{help}</Text>}
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <PressableScale accessibilityLabel={t('Close')} onPress={close} style={StyleSheet.absoluteFill}><View /></PressableScale>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <PressableScale accessibilityLabel={t('Close')} onPress={close} style={styles.close}><Ionicons name="close" size={20} color={colors.text} /></PressableScale>
          </View>
          {searchable && options.length > 6 && <TextInput value={query} onChangeText={setQuery} placeholder={t('Search')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} autoCapitalize="none" style={styles.search} />}
          <FlatList
            data={filtered}
            keyExtractor={(option) => option.value || '__none'}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<AdminEmpty text={t('No matches.')} />}
            renderItem={({ item }) => <PressableScale onPress={() => { onChange(item.value); close(); }} style={styles.option}>
              <View style={styles.selectCopy}>
                <Text numberOfLines={2} style={styles.optionText}>{item.label}</Text>
                {!!item.subtitle && <Text numberOfLines={1} style={styles.selectSubtitle}>{item.subtitle}</Text>}
              </View>
              {item.value === value && <Ionicons name="checkmark-circle" size={20} color={colors.accentBright} />}
            </PressableScale>}
          />
        </View>
      </View>
    </Modal>
  </View>;
}

/** Picks one or more audio masters; rejects formats the server refuses. */
export async function pickAudioFiles(multiple: boolean): Promise<LocalMusicFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'application/ogg', 'application/octet-stream'], copyToCacheDirectory: true, multiple });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, size: asset.size }));
}

/** Search GilTube videos (admin list) and pick the official music video. */
export function MusicVideoPicker({ onSelect, excludeID }: { onSelect: (video: AdminMusicVideoOption) => void; excludeID?: string }) {
  const styles = useStyles();
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  const videos = useQuery({ queryKey: musicKeys.videos(query), queryFn: () => musicAPI.videos(query) });
  const items = (videos.data || []).filter((video) => video.id !== excludeID);
  return <View>
    <View style={styles.field}>
      <TextInput value={input} onChangeText={setInput} placeholder={t('Search videos')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} autoCapitalize="none" style={styles.search} />
    </View>
    {videos.isLoading ? <AdminLoading /> : items.length ? items.map((video) => <PressableScale key={video.id} onPress={() => onSelect(video)} style={styles.videoRow}>
      {video.thumbnail_url ? <Image source={{ uri: resolveMediaURL(video.thumbnail_url) }} style={styles.videoThumb} contentFit="cover" /> : <View style={styles.videoThumb} />}
      <View style={styles.selectCopy}>
        <Text numberOfLines={2} style={styles.optionText}>{video.title || video.id}</Text>
        {!!video.channel_name && <Text numberOfLines={1} style={styles.selectSubtitle}>{video.channel_name}</Text>}
      </View>
      <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
    </PressableScale>) : <AdminEmpty text={t('No videos found.')} />}
  </View>;
}

/** The currently linked/selected official video, with a remove action. */
export function MusicVideoCard({ title, thumbnail, subtitle, onRemove, busy }: { title: string; thumbnail?: string; subtitle?: string; onRemove: () => void; busy?: boolean }) {
  const styles = useStyles();
  const { t } = useI18n();
  return <View style={styles.videoRow}>
    {thumbnail ? <Image source={{ uri: resolveMediaURL(thumbnail) }} style={styles.videoThumb} contentFit="cover" /> : <View style={styles.videoThumb} />}
    <View style={styles.selectCopy}>
      <Text numberOfLines={2} style={styles.optionText}>{title}</Text>
      {!!subtitle && <Text numberOfLines={1} style={styles.selectSubtitle}>{subtitle}</Text>}
    </View>
    <AdminButton compact label={t('Remove')} onPress={onRemove} busy={busy} />
  </View>;
}

/** Overview tiles (same five counters as the web header). */
export function MusicStats({ items }: { items: { label: string; value: number; tone?: 'good' | 'warn' }[] }) {
  const styles = useStyles();
  return <View style={styles.stats}>{items.map((item) => <View key={item.label} style={styles.stat}>
    <Text style={[styles.statValue, item.tone === 'good' && { color: colors.success }, item.tone === 'warn' && { color: colors.warning }]}>{item.value}</Text>
    <Text style={styles.statLabel}>{item.label}</Text>
  </View>)}</View>;
}

const useStyles = makeStyles(() => ({
  artwork: { backgroundColor: colors.surfaceStrong },
  artworkEmpty: { backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  field: { marginTop: 12 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  help: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 5 },
  select: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 8 },
  disabled: { opacity: .55 },
  selectCopy: { flex: 1, minWidth: 0 },
  selectText: { color: colors.text, fontSize: 14 },
  placeholder: { color: colors.textDim },
  selectSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.6)' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, backgroundColor: colors.canvasRaised, paddingHorizontal: 18, paddingTop: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  search: { minHeight: 44, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 14, paddingHorizontal: 13, marginBottom: 6 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  videoThumb: { width: 96, aspectRatio: 16 / 9, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { flexGrow: 1, minWidth: '30%', borderRadius: radii.md, backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 10 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
}));
