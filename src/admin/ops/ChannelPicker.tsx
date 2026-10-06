import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdminError, AdminField, AdminLoading } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';

import { opsAPI } from './api';

const VISIBLE = 8;

/**
 * Searchable GilTube channel picker. `emptyLabel` adds an option for "no
 * channel" (value ''), e.g. "use the mapped channel".
 */
export function ChannelPicker({ label, value, onChange, emptyLabel, disabled }: { label: string; value: string; onChange: (channelID: string) => void; emptyLabel?: string; disabled?: boolean }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const channels = useQuery({ queryKey: ['admin', 'ops', 'channels'], queryFn: opsAPI.channels, staleTime: 60_000 });
  const selected = channels.data?.find((channel) => channel.id === value);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = channels.data ?? [];
    const filtered = query ? list.filter((channel) => channel.name.toLowerCase().includes(query) || channel.username?.toLowerCase().includes(query) || channel.id === query) : list;
    return filtered.slice(0, VISIBLE);
  }, [channels.data, search]);

  if (disabled) {
    return <View style={styles.wrap}><Text style={styles.label}>{label}</Text><Text style={styles.disabled}>{t('A new channel will be created')}</Text></View>;
  }
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.current} numberOfLines={1}>{selected ? selected.name : value ? value : emptyLabel ?? t('No channel selected')}</Text>
    <AdminField label={t('Search channels')} value={search} onChangeText={setSearch} placeholder={t('Channel name or owner')} autoCapitalize="none" />
    {channels.isLoading ? <AdminLoading /> : <AdminError error={channels.error} />}
    <View style={styles.list}>
      {!!emptyLabel && <Option label={emptyLabel} active={!value} onPress={() => onChange('')} />}
      {matches.map((channel) => <Option key={channel.id} label={channel.name} detail={channel.username ? `@${channel.username}` : undefined} active={channel.id === value} onPress={() => onChange(channel.id)} />)}
      {!channels.isLoading && !matches.length && <Text style={styles.disabled}>{t('No channels match.')}</Text>}
    </View>
  </View>;
}

function Option({ label, detail, active, onPress }: { label: string; detail?: string; active: boolean; onPress: () => void }) {
  return <PressableScale onPress={onPress} style={[styles.option, active && styles.optionActive]}>
    <View style={styles.optionCopy}>
      <Text numberOfLines={1} style={styles.optionText}>{label}</Text>
      {!!detail && <Text numberOfLines={1} style={styles.optionDetail}>{detail}</Text>}
    </View>
    {active && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
  </PressableScale>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  current: { color: colors.text, fontSize: 14, fontWeight: '800' },
  disabled: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  list: { marginTop: 8, gap: 6 },
  option: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, backgroundColor: colors.surfaceStrong },
  optionActive: { borderWidth: 1, borderColor: colors.success },
  optionCopy: { flex: 1, minWidth: 0 },
  optionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  optionDetail: { color: colors.textDim, fontSize: 11, marginTop: 1 },
});
