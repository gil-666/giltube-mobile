import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import type { Playlist } from '@/types/api';

type Visibility = Playlist['visibility'];

export function PlaylistCreator({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated?: (playlist: Playlist) => void | Promise<void> }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDescription('');
    setVisibility('private');
  }, [visible]);

  const create = useMutation({
    mutationFn: () => giltubeAPI.createPlaylist({ title: title.trim(), description: description.trim(), visibility }),
    onSuccess: async (playlist) => {
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      await onCreated?.(playlist);
      onClose();
    },
    onError: (error) => Alert.alert(t('Could not create playlist'), error instanceof Error ? error.message : t('Please try again.')),
  });

  return <SwipeSheet visible={visible} title={t('Create playlist')} onClose={onClose}>
    <Text style={styles.label}>{t('Title')}</Text>
    <TextInput autoFocus value={title} onChangeText={setTitle} maxLength={120} placeholder={t('Playlist title')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} style={styles.input} />
    <Text style={styles.label}>{t('Description')}</Text>
    <TextInput value={description} onChangeText={setDescription} maxLength={500} multiline placeholder={t('Optional description')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} style={[styles.input, styles.description]} />
    <Text style={styles.label}>{t('Visibility')}</Text>
    <View style={styles.visibilityRow}>{(['private', 'unlisted', 'public'] as const).map((value) => <PressableScale key={value} onPress={() => setVisibility(value)} style={[styles.visibility, visibility === value && styles.visibilityActive]}><Ionicons name={value === 'private' ? 'lock-closed-outline' : value === 'unlisted' ? 'link-outline' : 'globe-outline'} color={visibility === value ? colors.white : colors.textMuted} size={17} /><Text style={[styles.visibilityText, visibility === value && styles.visibilityTextActive]}>{t(value === 'private' ? 'Private' : value === 'unlisted' ? 'Unlisted' : 'Public')}</Text></PressableScale>)}</View>
    <PressableScale disabled={!title.trim() || create.isPending} onPress={() => create.mutate()} style={[styles.create, (!title.trim() || create.isPending) && styles.disabled]}><Text style={styles.createText}>{t(create.isPending ? 'Creating…' : 'Create playlist')}</Text></PressableScale>
  </SwipeSheet>;
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginTop: 13, marginBottom: 7 },
  input: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.canvas, color: colors.text, fontSize: 14, paddingHorizontal: 13 },
  description: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visibility: { flex: 1, minHeight: 48, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  visibilityActive: { borderColor: colors.accentBright, backgroundColor: 'rgba(127,29,29,.32)' },
  visibilityText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  visibilityTextActive: { color: colors.white },
  create: { height: 50, marginTop: 20, marginBottom: 4, borderRadius: radii.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .45 },
  createText: { color: colors.white, fontSize: 14, fontWeight: '900' },
});
