import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APIError } from '@/api/client';
import { newsAPI } from '@/api/news';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { NewsCTAButton } from '@/news/NewsCTAButton';
import { NewsMarkdown } from '@/news/NewsMarkdown';
import { openNewsCTA } from '@/news/navigation';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

// A full news item: opened from a news notification, a shared
// giltube.gilservers.com/news/<id> link, or a link inside other news.
export default function NewsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t, dateTime } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const newsID = String(id || '');
  const news = useQuery({
    queryKey: ['news', newsID],
    queryFn: () => newsAPI.item(newsID),
    enabled: !!newsID,
    retry: (count, error) => !(error instanceof APIError && error.status === 404) && count < 1,
  });
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const notFound = !newsID || (news.error instanceof APIError && news.error.status === 404);
  const item = news.data;

  return <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
    <View style={styles.header}>
      <PressableScale accessibilityLabel={t('Back')} onPress={goBack} style={styles.back}><Ionicons name="chevron-back" size={25} color={colors.text} /></PressableScale>
    </View>
    {news.isLoading ? <ActivityIndicator style={styles.loader} color={colors.accentBright} />
      : notFound || !item ? <View style={styles.missing}>
        <View style={styles.missingIcon}><Ionicons name={notFound ? 'newspaper-outline' : 'cloud-offline-outline'} size={30} color={colors.accentBright} /></View>
        <Text style={styles.missingTitle}>{notFound ? t('News not found') : t('Couldn’t load this news')}</Text>
        <Text style={styles.missingBody}>{notFound ? t('This news item was removed or isn’t available yet.') : news.error instanceof Error ? news.error.message : t('Please try again.')}</Text>
        {notFound ? <PressableScale onPress={goBack} style={styles.secondary}><Text style={styles.secondaryText}>{t('Go back')}</Text></PressableScale>
          : <PressableScale onPress={() => void news.refetch()} style={styles.secondary}><Text style={styles.secondaryText}>{t('Try again')}</Text></PressableScale>}
      </View>
      : <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={news.isRefetching} onRefresh={() => void news.refetch()} tintColor={colors.accentBright} />}
      >
        <View style={styles.eyebrowRow}><Ionicons name="megaphone-outline" size={14} color={colors.accentBright} /><Text style={styles.eyebrow}>{t('News')}</Text></View>
        <Text accessibilityRole="header" style={styles.title}>{item.title}</Text>
        <Text style={styles.date}>{dateTime(item.starts_at || item.created_at, { dateStyle: 'long' })}</Text>
        <View style={styles.body}><NewsMarkdown source={item.body} /></View>
        <View style={styles.cta}><NewsCTAButton item={item} onPress={() => openNewsCTA(item)} /></View>
      </ScrollView>}
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  loader: { marginTop: 100 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: colors.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900', marginTop: 8 },
  date: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 6 },
  body: { marginTop: 18, padding: 18, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  cta: { marginTop: 18 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 80 },
  missingIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.accentBright, 0.12) },
  missingTitle: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 18 },
  missingBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 22, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong, marginTop: 22 },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: '800' },
}));
