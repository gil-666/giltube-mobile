import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeRecord } from '@/api/themes';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { mediaOrigin } from '@/config/environment';
import { useI18n } from '@/i18n';
import { ThemePreviewCard } from '@/theme/ThemePreviewCard';
import { useSiteTheme } from '@/theme/ThemeProvider';
import { DEFAULT_APPEARANCE, themeAppearanceOf, type ThemeAppearance } from '@/theme/themeMath';
import { colors, makeStyles, radii } from '@/theme/tokens';

interface Card {
  key: string;
  name: string;
  subtitle: string;
  look: ThemeAppearance;
  record: ThemeRecord | null;
  active: boolean;
}

export default function ThemesScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { t } = useI18n();
  const { library, loadLibrary, apply, remove } = useSiteTheme();
  const [loading, setLoading] = useState(status === 'signedIn');
  const [error, setError] = useState('');
  const [busyID, setBusyID] = useState('');

  const refresh = useCallback(async () => {
    try {
      await loadLibrary();
      setError('');
    } catch {
      setError(t('Could not load your themes.'));
    } finally {
      setLoading(false);
    }
  }, [loadLibrary, t]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    loadLibrary()
      .then(() => setError(''))
      .catch(() => setError(t('Could not load your themes.')))
      .finally(() => setLoading(false));
  }, [loadLibrary, status, t]);

  const groups = useMemo(() => {
    const activeID = library?.active_theme_id ?? null;
    const toCard = (record: ThemeRecord): Card => ({
      key: record.id,
      name: record.name,
      subtitle: record.is_builtin
        ? t('Made by GilTube')
        : record.is_owner ? t('Your theme') : t('By {owner}', { owner: record.owner_username || t('a GilTube user') }),
      look: themeAppearanceOf(record),
      record,
      active: record.id === activeID,
    });
    const themes = library?.themes || [];
    const giltube: Card[] = [
      { key: 'default', name: t('GilTube Default'), subtitle: t('The standard GilTube look'), look: DEFAULT_APPEARANCE, record: null, active: !activeID },
      ...themes.filter((theme) => theme.is_builtin).map(toCard),
    ];
    const mine = themes.filter((theme) => !theme.is_builtin).map(toCard);
    return [{ key: 'giltube', title: t('GILTUBE THEMES'), cards: giltube }, ...(mine.length ? [{ key: 'mine', title: t('YOUR THEMES'), cards: mine }] : [])];
  }, [library, t]);

  const run = async (id: string, action: () => Promise<unknown>, failure: string) => {
    setBusyID(id);
    try {
      await action();
    } catch {
      Alert.alert(failure);
    } finally {
      setBusyID('');
    }
  };

  const share = (record: ThemeRecord) => {
    const url = `${mediaOrigin}/themes/${record.share_code}`;
    void Share.share({ message: t('Try my GilTube theme "{name}": {url}', { name: record.name, url }), url });
  };

  const confirmRemove = (record: ThemeRecord) => {
    const owned = record.is_owner;
    Alert.alert(
      owned ? t('Delete "{name}"?', { name: record.name }) : t('Remove "{name}"?', { name: record.name }),
      owned && record.install_count > 0 ? t('People who installed it keep its current look, but it stops getting updates.') : undefined,
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: owned ? t('Delete') : t('Remove'), style: 'destructive', onPress: () => void run(record.id, () => remove(record), t('Could not remove the theme.')) },
      ],
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 42 }}>
      <View style={styles.top}>
        <PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" color={colors.text} size={25} /></PressableScale>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>{t('Themes')}</Text>
          <Text style={styles.subtitle}>{t('Your look syncs with GilTube on the web')}</Text>
        </View>
      </View>

      {status !== 'signedIn' ? (
        <View style={styles.empty}>
          <Ionicons name="color-palette-outline" color={colors.textMuted} size={34} />
          <Text style={styles.emptyTitle}>{t('Sign in to use themes')}</Text>
          <Text style={styles.help}>{t('Themes are saved to your account, so they follow you between the app and the website.')}</Text>
          <PressableScale onPress={() => router.push('/login')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{t('Sign in')}</Text></PressableScale>
        </View>
      ) : loading && !library ? (
        <ActivityIndicator color={colors.accentBright} style={styles.loader} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.help}>{error}</Text>
          <PressableScale onPress={() => { setLoading(true); setError(''); void refresh(); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{t('Try again')}</Text></PressableScale>
        </View>
      ) : (
        <>
          {groups.map((group) => (
            <View key={group.key}>
              <Text style={styles.section}>{group.title}</Text>
              {group.cards.map((card) => (
                <View key={card.key} style={[styles.card, card.active && styles.cardActive]}>
                  <ThemePreviewCard look={card.look} />
                  <View style={styles.cardHeader}>
                    <View style={styles.headingCopy}>
                      <Text style={styles.title} numberOfLines={1}>{card.name}</Text>
                      <Text style={styles.help} numberOfLines={1}>{card.subtitle}</Text>
                    </View>
                    {card.active ? <View style={styles.badge}><Text style={styles.badgeText}>{t('Active')}</Text></View> : null}
                  </View>
                  {card.record?.is_retired ? <Text style={styles.notice}>{t("The creator stopped sharing this theme. You keep its last version, but it won't get updates.")}</Text> : null}
                  <View style={styles.actions}>
                    {!card.active ? (
                      <PressableScale disabled={!!busyID} onPress={() => void run(card.key, () => apply(card.record), t('Could not apply the theme.'))} style={styles.primaryButton}>
                        {busyID === card.key ? <ActivityIndicator color={colors.onText} size="small" /> : <Text style={styles.primaryButtonText}>{t('Apply')}</Text>}
                      </PressableScale>
                    ) : null}
                    {card.record && !card.record.is_retired ? (
                      <PressableScale onPress={() => share(card.record!)} style={styles.secondaryButton}><Ionicons name="share-social-outline" color={colors.text} size={16} /><Text style={styles.secondaryButtonText}>{t('Share')}</Text></PressableScale>
                    ) : null}
                    {card.record && !card.record.is_builtin ? (
                      <PressableScale disabled={!!busyID} onPress={() => confirmRemove(card.record!)} style={styles.dangerButton}><Text style={styles.dangerText}>{card.record.is_owner ? t('Delete') : t('Remove')}</Text></PressableScale>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))}

          <Text style={styles.section}>{t('CREATE')}</Text>
          <PressableScale onPress={() => void WebBrowser.openBrowserAsync(`${mediaOrigin}/account-settings#themes`)} style={styles.link}>
            <View style={styles.icon}><Ionicons name="brush-outline" color={colors.text} size={21} /></View>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>{t('Create and edit themes')}</Text>
              <Text style={styles.help}>{t('Open the theme editor on the GilTube website. New themes show up here automatically.')}</Text>
            </View>
            <Ionicons name="open-outline" color={colors.textDim} size={18} />
          </PressableScale>
          <Text style={styles.footnote}>{t('Animated backgrounds and custom fonts play on the website. In the app, those themes use their colors, gradient and image.')}</Text>
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1 },
  heading: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  section: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10, marginBottom: 12 },
  cardActive: { borderColor: colors.highlight },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  help: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  badge: { backgroundColor: colors.highlight, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { color: colors.onHighlight, fontSize: 10, fontWeight: '900' },
  notice: { color: colors.warning, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { minHeight: 38, minWidth: 84, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.onText, fontSize: 13, fontWeight: '800' },
  secondaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  dangerButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.accentBright, fontSize: 13, fontWeight: '700' },
  link: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  footnote: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 14 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 12 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  loader: { marginTop: 48 },
}));
