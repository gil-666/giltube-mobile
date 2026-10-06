import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { CatalogRail, StreamingHero } from '@/components/StreamingCatalog';
import { colors, makeStyles } from '@/theme/tokens';
import { useI18n } from '@/i18n';

export default function SeriesScreen() { const styles = useStyles(); const { t } = useI18n(); const insets = useSafeAreaInsets(); const catalog = useQuery({ queryKey: ['series'], queryFn: giltubeAPI.series }); return <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={catalog.isRefetching} onRefresh={catalog.refetch} tintColor={colors.accentBright} />}><View style={[styles.top, { paddingTop: insets.top + 8 }]}><PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={colors.white} /></PressableScale><Text style={[styles.heading, !catalog.data?.featured && { color: colors.text }]}>{t('Series')}</Text></View>{catalog.isLoading && <ActivityIndicator style={styles.loader} color={colors.accentBright} />}{catalog.data?.featured && <StreamingHero item={catalog.data.featured} kind="series" />}{catalog.data?.genres.map((group) => <CatalogRail key={group.genre} title={group.genre} items={group.series} kind="series" />)}</ScrollView>; }
const useStyles = makeStyles(() => ({ screen: { flex: 1, backgroundColor: colors.screen }, top: { position: 'absolute', top: 0, left: 12, right: 18, zIndex: 4, height: 68, flexDirection: 'row', alignItems: 'center' }, back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' }, heading: { color: colors.white, fontSize: 22, fontWeight: '900', marginLeft: 10 }, loader: { marginTop: 150 } }));
