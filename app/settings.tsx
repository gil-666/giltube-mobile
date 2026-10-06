import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppLinkApprovalState, openAppLinkSettings, type AppLinkApprovalState } from '@/app-links/androidAppLinks';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { useAppSettings, type AppSettings } from '@/settings/AppSettingsProvider';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { deviceSupportsHDR } from '../modules/giltube-hdr';

export default function SettingsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets(); const { status } = useAuth(); const { settings, update, reset } = useAppSettings();
  const { t } = useI18n();
  const [linkApproval, setLinkApproval] = useState<AppLinkApprovalState>('unknown');
  const toggle = (key: keyof Pick<AppSettings, 'pipEnabled' | 'backgroundPlayback' | 'resumePlayback' | 'hdrEnabled'>) => void update({ [key]: !settings[key] });
  const hdrSupported = useMemo(() => deviceSupportsHDR(), []);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const refresh = () => void getAppLinkApprovalState().then(setLinkApproval).catch(() => setLinkApproval('unknown'));
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, []);
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 42 }}>
    <View style={styles.top}><PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" color={colors.text} size={25} /></PressableScale><View><Text style={styles.heading}>{t('App settings')}</Text><Text style={styles.subtitle}>{t('Playback and mobile behavior')}</Text></View></View>
    <Text style={styles.section}>{t('APPEARANCE')}</Text>
    <PressableScale onPress={() => router.push('/themes')} style={styles.link}><View style={styles.icon}><Ionicons name="color-palette-outline" color={colors.text} size={21} /></View><View style={styles.copy}><Text style={styles.title}>{t('Themes')}</Text><Text style={styles.help}>{t('Colors, backgrounds and effects that sync with the website')}</Text></View><Ionicons name="chevron-forward" color={colors.textDim} size={18} /></PressableScale>
    <Text style={styles.section}>{t('PLAYBACK')}</Text>
    <Toggle icon="enter-outline" title={t('Resume where I left off')} subtitle={t('Use synced watch progress when opening a video')} value={settings.resumePlayback} onChange={() => toggle('resumePlayback')} />
    <Toggle icon="albums-outline" title={t('Background playback')} subtitle={t('Keep audio playing when GilTube is in the background')} value={settings.backgroundPlayback} onChange={() => toggle('backgroundPlayback')} />
    <Toggle icon="browsers-outline" title={t('Picture in Picture')} subtitle={t('Float the player when leaving the app')} value={settings.pipEnabled} onChange={() => toggle('pipEnabled')} />
    {hdrSupported && <Toggle icon="sunny-outline" title={t('HDR video')} subtitle={t('Play HDR titles in high dynamic range on this screen')} value={settings.hdrEnabled} onChange={() => toggle('hdrEnabled')} />}
    <View style={styles.setting}><View style={styles.icon}><Ionicons name="play-forward-outline" color={colors.text} size={21} /></View><View style={styles.copy}><Text style={styles.title}>{t('Double-tap seek')}</Text><Text style={styles.help}>{t('Choose how far double-tap moves')}</Text><View style={styles.chips}>{([5, 10, 15] as const).map((seconds) => <PressableScale key={seconds} onPress={() => void update({ doubleTapSeconds: seconds })} style={[styles.chip, settings.doubleTapSeconds === seconds && styles.chipActive]}><Text style={[styles.chipText, settings.doubleTapSeconds === seconds && styles.chipTextActive]}>{seconds}s</Text></PressableScale>)}</View></View></View>
    <Text style={styles.section}>{t('LANGUAGES & CAPTIONS')}</Text>
    <View style={styles.setting}><View style={styles.icon}><Ionicons name="globe-outline" color={colors.text} size={21} /></View><View style={styles.copy}><Text style={styles.title}>{t('App language')}</Text><View style={styles.chips}>{([['system', 'System default'], ['en-US', 'English'], ['es-MX', 'Spanish (Mexico)']] as const).map(([value, label]) => <PressableScale key={value} onPress={() => void update({ language: value })} style={[styles.languageChip, settings.language === value && styles.chipActive]}><Text style={[styles.chipText, settings.language === value && styles.chipTextActive]}>{t(label)}</Text></PressableScale>)}</View></View></View>
    <PressableScale onPress={() => status === 'signedIn' ? router.push('/playback-settings') : router.push('/login')} style={styles.link}><View style={styles.icon}><Ionicons name="language-outline" color={colors.text} size={21} /></View><View style={styles.copy}><Text style={styles.title}>{t('Playback languages')}</Text><Text style={styles.help}>{status === 'signedIn' ? t('Audio and caption preferences sync with desktop') : t('Sign in to sync language preferences')}</Text></View><Ionicons name="chevron-forward" color={colors.textDim} size={18} /></PressableScale>
    {Platform.OS === 'android' && <><Text style={styles.section}>{t('LINKS')}</Text><PressableScale onPress={() => void openAppLinkSettings().catch(() => Alert.alert(t('Could not open settings'), t('Open GilTube in Android Settings, then choose Open by default.')))} style={styles.link}><View style={styles.icon}><Ionicons name="link-outline" color={colors.text} size={21} /></View><View style={styles.copy}><Text style={styles.title}>{t('Open supported links')}</Text><Text style={styles.help}>{linkApproval === 'approved' ? t('Enabled for giltube.gilservers.com') : linkApproval === 'unapproved' ? t('Needs setup — links currently open in the browser') : t('Manage giltube.gilservers.com in Android settings')}</Text></View><Ionicons name={linkApproval === 'approved' ? 'checkmark-circle' : 'chevron-forward'} color={linkApproval === 'approved' ? colors.gilid : colors.textDim} size={19} /></PressableScale></>}
    <Text style={styles.section}>{t('RESET')}</Text>
    <PressableScale onPress={() => Alert.alert(t('Reset app settings?'), t('Playback behavior will return to the defaults.'), [{ text: t('Cancel'), style: 'cancel' }, { text: t('Reset'), style: 'destructive', onPress: () => void reset() }])} style={styles.reset}><Ionicons name="refresh-outline" color={colors.accentBright} size={19} /><Text style={styles.resetText}>{t('Restore defaults')}</Text></PressableScale>
  </ScrollView>;
}

function Toggle({ icon, title, subtitle, value, onChange }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; value: boolean; onChange: () => void }) { const styles = useStyles(); return <View style={styles.setting}><View style={styles.icon}><Ionicons name={icon} color={colors.text} size={21} /></View><View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.help}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.white} /></View>; }

const useStyles = makeStyles(() => ({ screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 }, top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, heading: { color: colors.text, fontSize: 28, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, section: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 28, marginBottom: 8 }, setting: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, link: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, copy: { flex: 1 }, title: { color: colors.text, fontSize: 14, fontWeight: '800' }, help: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, chip: { minWidth: 48, height: 32, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }, languageChip: { minHeight: 32, paddingHorizontal: 11, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }, chipActive: { backgroundColor: colors.text }, chipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' }, chipTextActive: { color: colors.onText }, reset: { height: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, resetText: { color: colors.accentBright, fontSize: 13, fontWeight: '800' } }));
