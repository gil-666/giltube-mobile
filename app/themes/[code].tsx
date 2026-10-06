import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { themesAPI, type ThemeRecord } from '@/api/themes';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { ThemePreviewCard } from '@/theme/ThemePreviewCard';
import { useSiteTheme } from '@/theme/ThemeProvider';
import { themeAppearanceOf } from '@/theme/themeMath';
import { colors, makeStyles, radii } from '@/theme/tokens';

// Opened from a shared theme link (giltube.gilservers.com/themes/<code>).
export default function SharedThemeScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status } = useAuth();
  const { t } = useI18n();
  const { active, apply, install, setPreview } = useSiteTheme();
  const [theme, setTheme] = useState<ThemeRecord | null>(null);
  const [installed, setInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    themesAPI.shared(String(code || ''))
      .then((result) => { if (!cancelled) { setTheme(result.theme); setInstalled(result.installed); } })
      .catch(() => { if (!cancelled) setTheme(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code, status]);

  const look = useMemo(() => (theme ? themeAppearanceOf(theme) : null), [theme]);
  const isActive = !!theme && active.id === theme.id;

  useEffect(() => {
    setPreview(previewing && look && !isActive ? look : null);
  }, [isActive, look, previewing, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setPreviewing(false);
    } catch (error) {
      Alert.alert(t('Could not install the theme.'), error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 42 }}>
      <View style={styles.top}>
        <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back}><Ionicons name="chevron-back" color={colors.text} size={25} /></PressableScale>
        <Text style={styles.eyebrow}>{t('GilTube theme')}</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.accentBright} style={styles.loader} /> : !theme || !look ? (
        <View style={styles.empty}>
          <Ionicons name="color-palette-outline" color={colors.textMuted} size={34} />
          <Text style={styles.title}>{t('Theme not found')}</Text>
          <Text style={styles.help}>{t('This theme link is invalid, or the creator stopped sharing it.')}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.heading}>{theme.name}</Text>
          <Text style={styles.help}>{t('By {owner}', { owner: theme.owner_username || t('a GilTube user') })}</Text>
          <ThemePreviewCard look={look} height={170} />

          <View style={styles.panel}>
            <View style={styles.previewRow}>
              <View style={styles.copy}>
                <Text style={styles.title}>{t('Preview in the app')}</Text>
                <Text style={styles.help}>{t('Try the theme here before adding it.')}</Text>
              </View>
              <Switch value={previewing} onValueChange={setPreviewing} disabled={isActive} trackColor={{ false: colors.surfaceStrong, true: colors.highlight }} thumbColor={colors.white} />
            </View>

            {status !== 'signedIn' ? (
              <PressableScale onPress={() => router.push('/login')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{t('Sign in to install')}</Text></PressableScale>
            ) : isActive ? (
              <View style={styles.appliedRow}><Ionicons name="checkmark-circle" color={colors.highlight} size={18} /><Text style={styles.title}>{t('Applied')}</Text></View>
            ) : installed ? (
              <PressableScale disabled={busy} onPress={() => void run(() => apply(theme))} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{t('Apply')}</Text></PressableScale>
            ) : (
              <View style={styles.actions}>
                <PressableScale disabled={busy} onPress={() => void run(async () => { await install(theme.share_code, true); setInstalled(true); })} style={styles.primaryButton}>
                  {busy ? <ActivityIndicator color={colors.onText} size="small" /> : <Text style={styles.primaryButtonText}>{t('Install and apply')}</Text>}
                </PressableScale>
                <PressableScale disabled={busy} onPress={() => void run(async () => { await install(theme.share_code, false); setInstalled(true); })} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{t('Install only')}</Text>
                </PressableScale>
              </View>
            )}
            {status === 'signedIn' ? (
              <PressableScale onPress={() => router.push('/themes')} style={styles.textButton}><Text style={styles.textButtonText}>{t('Manage themes')}</Text></PressableScale>
            ) : null}
            <Text style={styles.footnote}>
              {theme.is_builtin ? t('Included with GilTube: apply it any time from your theme settings.') : t('Installed themes stay linked to the creator, so you get their changes automatically.')}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  body: { marginTop: 18, gap: 8 },
  heading: { color: colors.text, fontSize: 28, fontWeight: '900' },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  panel: { marginTop: 14, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appliedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  primaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.onText, fontSize: 14, fontWeight: '800' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  textButton: { alignSelf: 'flex-start', paddingVertical: 4 },
  textButtonText: { color: colors.highlight, fontSize: 13, fontWeight: '700' },
  footnote: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60, paddingHorizontal: 12 },
  loader: { marginTop: 48 },
}));
