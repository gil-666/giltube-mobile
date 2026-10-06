import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminBadge } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';

import type { LocalMusicFile } from './types';

export type ImportStatus = 'pending' | 'uploading' | 'done' | 'error';
export type ImportItem = {
  key: string;
  file: LocalMusicFile;
  title: string;
  discNumber: number;
  trackNumber: number;
  trackID: string;
  status: ImportStatus;
  error: string;
};

/** One file in the bulk import / quick upload lists: position, editable title, status and reorder controls. */
export function ImportTrackRow({ item, first, last, locked, editNumbers, onChange, onMove, onRemove }: {
  item: ImportItem;
  first: boolean;
  last: boolean;
  locked: boolean;
  editNumbers?: boolean;
  onChange: (patch: Partial<ImportItem>) => void;
  onMove?: (direction: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const titleLocked = locked || item.status === 'done';
  const statusBadge = item.status === 'uploading' ? <AdminBadge label={t('Uploading…')} tone="info" />
    : item.status === 'done' ? <AdminBadge label={t('Imported')} tone="good" />
      : item.status === 'error' ? <AdminBadge label={t('Will retry')} tone="bad" /> : null;
  const numberInput = (value: number, label: string, onValue: (next: number) => void) => <TextInput
    accessibilityLabel={label}
    value={value ? String(value) : ''}
    onChangeText={(text) => onValue(Math.max(0, parseInt(text, 10) || 0))}
    keyboardType="number-pad"
    editable={!titleLocked}
    style={styles.number}
    selectionColor={colors.accentBright}
  />;
  return <View style={styles.row}>
    {editNumbers
      ? <View style={styles.numbers}>{numberInput(item.discNumber, t('Disc'), (discNumber) => onChange({ discNumber }))}<Text style={styles.dot}>.</Text>{numberInput(item.trackNumber, t('Track number'), (trackNumber) => onChange({ trackNumber }))}</View>
      : <Text style={styles.position}>{item.trackNumber}</Text>}
    <View style={styles.copy}>
      <TextInput
        accessibilityLabel={t('Title')}
        value={item.title}
        onChangeText={(title) => onChange({ title })}
        editable={!titleLocked}
        placeholder={t('Title')}
        placeholderTextColor={colors.textDim}
        selectionColor={colors.accentBright}
        style={[styles.title, titleLocked && styles.locked]}
      />
      <Text numberOfLines={1} style={styles.file}>{item.file.name}</Text>
      {!!item.error && <Text style={styles.error}>{item.error}</Text>}
      {!!statusBadge && <View style={styles.badge}>{statusBadge}</View>}
    </View>
    <View style={styles.actions}>
      {!!onMove && <PressableScale accessibilityLabel={t('Move up')} disabled={locked || first} onPress={() => onMove(-1)} style={[styles.icon, (locked || first) && styles.disabled]}><Ionicons name="arrow-up" size={16} color={colors.text} /></PressableScale>}
      {!!onMove && <PressableScale accessibilityLabel={t('Move down')} disabled={locked || last} onPress={() => onMove(1)} style={[styles.icon, (locked || last) && styles.disabled]}><Ionicons name="arrow-down" size={16} color={colors.text} /></PressableScale>}
      {!!onRemove && <PressableScale accessibilityLabel={t('Remove')} disabled={locked} onPress={onRemove} style={[styles.icon, locked && styles.disabled]}><Ionicons name="close" size={16} color={colors.text} /></PressableScale>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  position: { width: 28, paddingTop: 10, color: colors.textMuted, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  numbers: { flexDirection: 'row', alignItems: 'center', paddingTop: 2 },
  number: { width: 34, minHeight: 36, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong, color: colors.text, textAlign: 'center', fontSize: 13, paddingHorizontal: 2 },
  dot: { color: colors.textDim, marginHorizontal: 2 },
  copy: { flex: 1, minWidth: 0 },
  title: { minHeight: 38, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong, color: colors.text, fontSize: 14, fontWeight: '700', paddingHorizontal: 10 },
  locked: { opacity: .6 },
  file: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  error: { color: '#fca5a5', fontSize: 11, marginTop: 4 },
  badge: { flexDirection: 'row', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 4, paddingTop: 2 },
  icon: { width: 32, height: 34, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .35 },
});
