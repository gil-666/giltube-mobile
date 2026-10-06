import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

// Shared building blocks for the admin screens, so every tool looks and
// behaves the same. Screens pass already-translated strings.

type IconName = ComponentProps<typeof Ionicons>['name'];

export function useIsAdmin() {
  const { account, status } = useAuth();
  return status === 'signedIn' && account?.user_type === 'admin';
}

export function AdminScreen({ title, subtitle, children, refreshing, onRefresh, right, scroll = true }: { title: string; subtitle?: string; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; right?: ReactNode; scroll?: boolean }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const header = <View style={styles.top}>
    <PressableScale accessibilityLabel={t('Back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/admin')} style={styles.back}><Ionicons name="chevron-back" color={colors.text} size={25} /></PressableScale>
    <View style={styles.topCopy}><Text numberOfLines={1} style={styles.heading}>{title}</Text>{!!subtitle && <Text numberOfLines={2} style={styles.subtitle}>{subtitle}</Text>}</View>
    {right}
  </View>;
  if (!isAdmin) {
    return <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>{header}<AdminEmpty text={t('Admins only.')} /></View>;
  }
  if (!scroll) return <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>{header}{children}</View>;
  return <ScrollView
    style={styles.screen}
    contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 48 }}
    keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets
    refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accentBright} /> : undefined}
  >
    {header}
    {children}
  </ScrollView>;
}

export function AdminSection({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.sectionWrap}>
    <View style={styles.sectionHead}><Text style={styles.section}>{title.toUpperCase()}</Text>{right}</View>
    {children}
  </View>;
}

export function AdminCard({ children, style }: { children: ReactNode; style?: object }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AdminRow({ title, subtitle, icon, badges, onPress, right, imageSlot }: { title: string; subtitle?: string; icon?: IconName; badges?: ReactNode; onPress?: () => void; right?: ReactNode; imageSlot?: ReactNode }) {
  const styles = useStyles();
  const body = <>
    {imageSlot ?? (icon ? <View style={styles.rowIcon}><Ionicons name={icon} color={colors.text} size={20} /></View> : null)}
    <View style={styles.rowCopy}>
      <Text numberOfLines={2} style={styles.rowTitle}>{title}</Text>
      {!!subtitle && <Text numberOfLines={3} style={styles.rowSubtitle}>{subtitle}</Text>}
      {!!badges && <View style={styles.badges}>{badges}</View>}
    </View>
    {right ?? (onPress ? <Ionicons name="chevron-forward" color={colors.textDim} size={18} /> : null)}
  </>;
  return onPress ? <PressableScale onPress={onPress} style={styles.row}>{body}</PressableScale> : <View style={styles.row}>{body}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';
export function AdminButton({ label, onPress, variant = 'secondary', disabled, busy, icon, compact }: { label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; busy?: boolean; icon?: IconName; compact?: boolean }) {
  const styles = useStyles();
  const textColor = variant === 'primary' ? colors.onText : variant === 'danger' ? colors.danger : colors.text;
  return <PressableScale disabled={disabled || busy} onPress={onPress} style={[styles.button, compact && styles.buttonCompact, variant === 'primary' && styles.buttonPrimary, variant === 'danger' && styles.buttonDanger, (disabled || busy) && styles.buttonDisabled]}>
    {busy ? <ActivityIndicator size="small" color={textColor} /> : icon ? <Ionicons name={icon} size={compact ? 15 : 17} color={textColor} /> : null}
    <Text numberOfLines={1} style={[styles.buttonText, compact && styles.buttonTextCompact, { color: textColor }]}>{label}</Text>
  </PressableScale>;
}

export function AdminButtons({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.buttons}>{children}</View>;
}

export function AdminField({ label, value, onChangeText, placeholder, multiline, keyboardType, help, secure, autoCapitalize = 'sentences', editable = true }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: KeyboardTypeOptions; help?: string; secure?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; editable?: boolean }) {
  const styles = useStyles();
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      selectionColor={colors.accentBright}
      multiline={multiline}
      keyboardType={keyboardType}
      secureTextEntry={secure}
      autoCapitalize={autoCapitalize}
      editable={editable}
      style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDisabled]}
    />
    {!!help && <Text style={styles.help}>{help}</Text>}
  </View>;
}

export function AdminNumberField({ label, value, onChange, help, decimal }: { label: string; value: number; onChange: (value: number) => void; help?: string; decimal?: boolean }) {
  return <AdminField label={label} value={Number.isFinite(value) && value !== 0 ? String(value) : value === 0 ? '0' : ''} onChangeText={(text) => { const parsed = decimal ? parseFloat(text.replace(',', '.')) : parseInt(text, 10); onChange(Number.isFinite(parsed) ? parsed : 0); }} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} help={help} autoCapitalize="none" />;
}

export function AdminToggle({ label, help, value, onChange, disabled }: { label: string; help?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const styles = useStyles();
  return <View style={styles.toggle}>
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{label}</Text>{!!help && <Text style={styles.rowSubtitle}>{help}</Text>}</View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.white} />
  </View>;
}

export function AdminChips<T extends string>({ label, options, value, onChange }: { label?: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const styles = useStyles();
  return <View style={styles.field}>
    {!!label && <Text style={styles.label}>{label}</Text>}
    <View style={styles.chips}>
      {options.map((option) => <PressableScale key={option.value} onPress={() => onChange(option.value)} style={[styles.chip, option.value === value && styles.chipActive]}><Text style={[styles.chipText, option.value === value && styles.chipTextActive]}>{option.label}</Text></PressableScale>)}
    </View>
  </View>;
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
const toneColors = (): Record<Tone, { bg: string; fg: string }> => ({
  neutral: { bg: withAlpha(colors.text, .08), fg: colors.textMuted },
  good: { bg: withAlpha(colors.success, .14), fg: colors.success },
  warn: { bg: withAlpha(colors.warning, .14), fg: colors.warning },
  bad: { bg: withAlpha(colors.danger, .16), fg: colors.danger },
  info: { bg: withAlpha(colors.gilid, .12), fg: colors.gilid },
});
export function AdminBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const styles = useStyles();
  const tones = toneColors();
  return <View style={[styles.badge, { backgroundColor: tones[tone].bg }]}><Text style={[styles.badgeText, { color: tones[tone].fg }]}>{label}</Text></View>;
}

export function AdminProgress({ value, label }: { value: number; label?: string }) {
  const styles = useStyles();
  const percent = Math.max(0, Math.min(100, value));
  return <View style={styles.progressWrap}>
    {!!label && <Text style={styles.help}>{label}</Text>}
    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
  </View>;
}

export function AdminEmpty({ text }: { text: string }) {
  const styles = useStyles();
  return <Text style={styles.empty}>{text}</Text>;
}

export function AdminLoading() {
  const styles = useStyles();
  return <ActivityIndicator style={styles.loading} color={colors.accentBright} />;
}

export function AdminError({ error }: { error: unknown }) {
  const styles = useStyles();
  if (!error) return null;
  return <View style={styles.error}><Ionicons name="alert-circle" color="#fca5a5" size={16} /><Text style={styles.errorText}>{error instanceof Error ? error.message : String(error)}</Text></View>;
}

export function AdminNotice({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  const styles = useStyles();
  const tones = toneColors();
  return <View style={[styles.notice, { backgroundColor: tones[tone].bg }]}><Text style={[styles.noticeText, { color: tones[tone].fg }]}>{text}</Text></View>;
}

/** Ask before anything destructive; resolves after the action finishes or is cancelled. */
export function confirmAction(t: (source: string) => string, title: string, message: string, onConfirm: () => unknown, confirmLabel = 'Delete') {
  Alert.alert(title, message, [
    { text: t('Cancel'), style: 'cancel' },
    { text: t(confirmLabel), style: 'destructive', onPress: () => { void Promise.resolve(onConfirm()).catch((error) => Alert.alert(t('Something went wrong'), error instanceof Error ? error.message : String(error))); } },
  ]);
}

/** Shows an alert for a failed admin action; use as `.catch(alertError(t))`. */
export function alertError(t: (source: string) => string, title = 'Something went wrong') {
  return (error: unknown) => Alert.alert(t(title), error instanceof Error ? error.message : String(error));
}

export async function pickFile(type: string | string[] = '*/*') {
  const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

export function formatBytes(value?: number) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

const adminStylesFactory = () => StyleSheet.create({
  gap: { height: 12 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 72, aspectRatio: 16 / 9, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  poster: { width: 46, aspectRatio: 2 / 3, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceStrong },
  mono: { color: colors.textMuted, fontSize: 11, fontFamily: 'monospace' },
  text: { color: colors.text, fontSize: 13, lineHeight: 19 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});

/** Shared admin helper styles that follow the live theme. Prefer this hook in components. */
export const useAdminStyles = makeStyles(adminStylesFactory);

/**
 * Backwards-compatible view of the same styles: each property is rebuilt from
 * the live tokens when read, so reading it during render stays current.
 */
let adminStylesCache: { key: string; styles: ReturnType<typeof adminStylesFactory> } | null = null;
const currentAdminStyles = () => {
  const key = `${colors.surfaceStrong}|${colors.textMuted}|${colors.text}|${radii.sm}`;
  if (!adminStylesCache || adminStylesCache.key !== key) adminStylesCache = { key, styles: adminStylesFactory() };
  return adminStylesCache.styles;
};
export const adminStyles = {} as ReturnType<typeof adminStylesFactory>;
(Object.keys(adminStylesFactory()) as (keyof typeof adminStyles)[]).forEach((key) => {
  Object.defineProperty(adminStyles, key, { enumerable: true, get: () => currentAdminStyles()[key] });
});

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  topCopy: { flex: 1, minWidth: 0 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { color: colors.text, fontSize: 26, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  sectionWrap: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  section: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, marginBottom: 10 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  rowSubtitle: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  button: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong },
  buttonCompact: { minHeight: 32, paddingHorizontal: 12 },
  buttonPrimary: { backgroundColor: colors.text },
  buttonDanger: { backgroundColor: withAlpha(colors.danger, .14) },
  buttonDisabled: { opacity: .45 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  buttonTextCompact: { fontSize: 12 },
  field: { marginTop: 12 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  input: { minHeight: 46, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 14, paddingHorizontal: 13, paddingVertical: 10 },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  inputDisabled: { opacity: .6 },
  help: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 5 },
  toggle: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 32, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.text },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.onText },
  progressWrap: { marginTop: 10 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceStrong, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: colors.accentBright },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  loading: { marginVertical: 28 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: radii.md, backgroundColor: withAlpha(colors.danger, .12) },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17 },
  notice: { marginTop: 12, padding: 12, borderRadius: radii.md },
  noticeText: { fontSize: 12, lineHeight: 17 },
}));
