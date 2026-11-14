import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { geelsAPI, type GeelSound } from '@/api/geels';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** Search GilTube Music for a sound (always the 128 kbps file) with previews. */
export function SoundPicker({ visible, selected, onClose, onSelect }: {
  visible: boolean; selected: GeelSound | null; onClose: () => void; onSelect: (sound: GeelSound | null) => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [previewID, setPreviewID] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const sounds = useQuery({ queryKey: ['geel-sounds', debounced], queryFn: () => geelsAPI.sounds(debounced, 40), enabled: visible });
  const previewSound = visible ? sounds.data?.sounds.find((sound) => sound.track_id === previewID) : undefined;
  const preview = useVideoPlayer(previewSound ? { uri: resolveMediaURL(previewSound.audio_url) } : null, (player) => { player.loop = true; });
  useEffect(() => { if (previewSound) preview.play(); }, [preview, previewSound]);
  const close = () => { setPreviewID(''); onClose(); };

  return <SwipeSheet visible={visible} title={t('Add a sound')} onClose={close}>
    <View style={styles.search}>
      <Ionicons name="search" size={17} color={colors.textDim} />
      <TextInput value={query} onChangeText={setQuery} placeholder={t('Search GilTube Music')} placeholderTextColor={colors.textDim} style={styles.input} returnKeyType="search" />
    </View>
    {selected && <Pressable onPress={() => { onSelect(null); close(); }} style={styles.remove}><Ionicons name="close-circle" size={18} color={colors.textMuted} /><Text style={styles.removeText}>{t('Remove sound')}</Text></Pressable>}
    <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
      {sounds.isLoading && <ActivityIndicator color={colors.accentBright} style={styles.loading} />}
      {!sounds.isLoading && !sounds.data?.sounds.length && <Text style={styles.empty}>{t('No sounds found.')}</Text>}
      {sounds.data?.sounds.map((sound) => {
        const previewing = previewID === sound.track_id;
        const chosen = selected?.track_id === sound.track_id;
        return <View key={sound.track_id} style={styles.row}>
          <Pressable accessibilityLabel={t(previewing ? 'Stop preview' : 'Preview')} onPress={() => setPreviewID(previewing ? '' : sound.track_id)} style={styles.cover}>
            {!!sound.cover_url && <Image source={resolveMediaURL(sound.cover_url)} style={styles.coverArt} contentFit="cover" />}
            <View style={styles.coverIcon}><Ionicons name={previewing ? 'pause' : 'play'} size={18} color="#fff" /></View>
          </Pressable>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>{sound.title}</Text>
            <Text numberOfLines={1} style={styles.meta}>{sound.artist_name} · {clock(sound.duration_seconds)}</Text>
          </View>
          <Pressable onPress={() => { onSelect(sound); close(); }} style={[styles.use, chosen && styles.useChosen]}>
            <Text style={[styles.useText, chosen && styles.useChosenText]}>{t(chosen ? 'Selected' : 'Use')}</Text>
          </Pressable>
        </View>;
      })}
    </ScrollView>
  </SwipeSheet>;
}

const useStyles = makeStyles(() => ({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, paddingHorizontal: 14, backgroundColor: colors.surfaceStrong },
  input: { flex: 1, color: colors.text, fontSize: 14 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  removeText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  list: { maxHeight: 420, marginTop: 8 },
  loading: { marginVertical: 30 },
  empty: { color: colors.textMuted, textAlign: 'center', marginVertical: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  cover: { width: 52, height: 52, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  coverArt: { width: '100%', height: '100%' },
  coverIcon: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  use: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent },
  useChosen: { backgroundColor: colors.surfaceStrong },
  useText: { color: colors.onAccent, fontSize: 12, fontWeight: '900' },
  useChosenText: { color: colors.text },
}));
