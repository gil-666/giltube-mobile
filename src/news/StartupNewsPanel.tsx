import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newsAPI, type NewsItem } from '@/api/news';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

import { addGuestDismissedNews, readGuestDismissedNews } from './guestDismissals';
import { NewsCTAButton } from './NewsCTAButton';
import { NewsMarkdown } from './NewsMarkdown';
import { openNewsCTA } from './navigation';

// Ids queued for display during this launch: each panel shows at most once
// per launch, even when dismissing it fails (offline).
const shownThisLaunch = new Set<string>();

// Give the first screen (and any startup alert) a moment before the panel.
const STARTUP_DELAY_MS = 1500;

const isBlockedPath = (pathname: string) => /^\/(?:login|auth(?:\/|$))/.test(pathname);

/**
 * Shows pending news panels as a modal once auth state is known. Mounted once
 * at the app root, inside the auth and theme providers.
 */
export function StartupNewsPanel() {
  const styles = useStyles();
  const { t } = useI18n();
  const { status, account } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [queue, setQueue] = useState<{ items: NewsItem[]; index: number }>({ items: [], index: 0 });
  const accountID = account?.id || '';

  useEffect(() => {
    if (status !== 'guest' && status !== 'signedIn') return;
    let active = true;
    const timer = setTimeout(() => {
      const load = async () => {
        const items = await newsAPI.panels();
        const dismissed = status === 'guest' ? new Set(await readGuestDismissedNews()) : new Set<string>();
        return items.filter((item) => !dismissed.has(item.id) && !shownThisLaunch.has(item.id));
      };
      void load().then((pending) => {
        if (!active || !pending.length) return;
        pending.forEach((item) => shownThisLaunch.add(item.id));
        setQueue((current) => ({ ...current, items: [...current.items, ...pending] }));
      }).catch(() => undefined);
    }, STARTUP_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [status, accountID]);

  const item = queue.items[queue.index];
  const total = queue.items.length;
  if (!item) return null;
  const visible = !isBlockedPath(pathname);

  const recordDismissal = (target: NewsItem) => {
    if (status === 'signedIn') void newsAPI.dismiss(target.id).catch(() => undefined);
    else void addGuestDismissedNews(target.id);
  };
  const dismiss = () => {
    recordDismissal(item);
    setQueue((current) => ({ ...current, index: current.index + 1 }));
  };
  const follow = () => {
    recordDismissal(item);
    // Leave the rest for the next launch rather than covering the new screen.
    setQueue((current) => ({ ...current, index: current.items.length }));
    openNewsCTA(item);
  };
  const more = queue.index < total - 1;

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.panel, { maxHeight: height - insets.top - insets.bottom - 48 }]}>
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="megaphone-outline" size={14} color={colors.accentBright} />
            <Text style={styles.eyebrow}>{t('News')}</Text>
            {total > 1 && <Text style={styles.counter}>{t('{current} of {total}', { current: queue.index + 1, total })}</Text>}
          </View>
          <PressableScale accessibilityLabel={t('Dismiss')} onPress={dismiss} style={styles.close} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </PressableScale>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text accessibilityRole="header" style={styles.title}>{item.title}</Text>
          <NewsMarkdown source={item.body} />
        </ScrollView>
        <View style={styles.actions}>
          <NewsCTAButton item={item} onPress={follow} />
          <PressableScale onPress={dismiss} style={styles.secondary}>
            <Text style={styles.secondaryText}>{more ? t('Next') : t('Dismiss')}</Text>
            {more && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
          </PressableScale>
        </View>
      </View>
    </View>
  </Modal>;
}

const useStyles = makeStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: withAlpha(colors.black, 0.6) },
  panel: { overflow: 'hidden', borderRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20, paddingRight: 10, paddingTop: 12 },
  eyebrowRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: colors.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  counter: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginLeft: 4 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.text, 0.06) },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '900', marginBottom: 12 },
  actions: { gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  secondary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
}));
