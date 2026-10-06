import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

export type PickerOption<T extends string | number> = { value: T; label: string; subtitle?: string; disabled?: boolean };

/**
 * Phone-friendly replacement for the web panel's <select>: a field that opens
 * a sheet with the options (searchable once the list gets long).
 */
export function OptionPicker<T extends string | number>({ label, value, options, onChange, placeholder, disabled, compact }: { label?: string; value: T; options: PickerOption<T>[]; onChange: (value: T) => void; placeholder: string; disabled?: boolean; compact?: boolean }) {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const searchable = options.length > 8;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.subtitle ?? ''}`.toLowerCase().includes(needle));
  }, [options, query]);

  const close = () => { setOpen(false); setQuery(''); };

  return <View style={compact ? styles.compactWrap : styles.wrap}>
    {!!label && <Text style={styles.label}>{label}</Text>}
    <PressableScale disabled={disabled} onPress={() => setOpen(true)} style={[styles.field, compact && styles.fieldCompact, disabled && styles.disabled]}>
      <Text numberOfLines={1} style={[styles.value, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.textDim} />
    </PressableScale>
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.sheetHead}>
          <Text numberOfLines={1} style={styles.sheetTitle}>{label || placeholder}</Text>
          <PressableScale accessibilityLabel={t('Close')} onPress={close} style={styles.close}><Ionicons name="close" size={20} color={colors.text} /></PressableScale>
        </View>
        {searchable && <TextInput value={query} onChangeText={setQuery} placeholder={t('Search')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} autoCapitalize="none" style={styles.search} />}
        <FlatList
          data={visible}
          keyExtractor={(option) => String(option.value)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{t('Nothing here yet.')}</Text>}
          renderItem={({ item }) => <Pressable disabled={item.disabled} onPress={() => { onChange(item.value); close(); }} style={[styles.option, item.disabled && styles.disabled]}>
            <View style={styles.optionCopy}>
              <Text numberOfLines={2} style={[styles.optionText, item.value === value && styles.optionActive]}>{item.label}</Text>
              {!!item.subtitle && <Text numberOfLines={2} style={styles.optionSub}>{item.subtitle}</Text>}
            </View>
            {item.value === value && <Ionicons name="checkmark" size={18} color={colors.accentBright} />}
          </Pressable>}
        />
      </View>
    </Modal>
  </View>;
}

const useStyles = makeStyles(() => ({
  wrap: { marginTop: 12 },
  compactWrap: { marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  field: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13 },
  fieldCompact: { minHeight: 38 },
  value: { flex: 1, color: colors.text, fontSize: 14 },
  placeholder: { color: colors.textDim },
  disabled: { opacity: .45 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)' },
  sheet: { maxHeight: '75%', backgroundColor: colors.canvasRaised, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: 16, paddingTop: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sheetTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '900' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  search: { minHeight: 42, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, marginBottom: 8 },
  option: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionCopy: { flex: 1, minWidth: 0 },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  optionActive: { color: colors.accentBright },
  optionSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
}));
