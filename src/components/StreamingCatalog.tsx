import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from './PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { Movie, Series } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';
import { openVideo } from '@/player/navigation';

type CatalogItem = Movie | Series;

function openDetails(item: CatalogItem, kind: 'movie' | 'series', replace = false) {
  const destination = kind === 'movie' ? { pathname: '/movies/[id]' as const, params: { id: item.id } } : { pathname: '/series/[id]' as const, params: { id: item.id } };
  if (replace) router.replace(destination);
  else router.push(destination);
}

export function StreamingHero({ item, kind }: { item: CatalogItem; kind: 'movie' | 'series' }) {
  const styles = useStyles();
  const { t } = useI18n();
  const playID = kind === 'movie' ? (item as Movie).video_id : (item as Series).first_episode?.video_id;
  return <View style={styles.hero}>
    <Image source={resolveMediaURL(item.backdrop_url || item.poster_url)} style={StyleSheet.absoluteFill} contentFit="cover" />
    <LinearGradient colors={['rgba(0,0,0,.06)', withAlpha(colors.canvas, .45), colors.canvas]} locations={[0, .55, 1]} style={StyleSheet.absoluteFill} />
    <View style={styles.heroCopy}><Text style={styles.kicker}>{t('FEATURED')} {t(kind === 'movie' ? 'MOVIE' : 'SERIES')}</Text><Text numberOfLines={2} style={styles.heroTitle}>{item.title}</Text><Text numberOfLines={3} style={styles.synopsis}>{item.synopsis}</Text><View style={styles.buttons}>{!!playID && <PressableScale onPress={() => openVideo(playID)} style={styles.play}><Text style={styles.playText}>{t('▶ Play')}</Text></PressableScale>}<PressableScale onPress={() => openDetails(item, kind)} style={styles.info}><Text style={styles.infoText}>{t('Details')}</Text></PressableScale></View></View>
  </View>;
}

export function CatalogRail({ title, items, kind }: { title: string; items: CatalogItem[]; kind: 'movie' | 'series' }) {
  const styles = useStyles();
  const { t } = useI18n();
  const pathname = usePathname();
  const isAlreadyInDetails = /^\/(movies|series)\/[^/]+$/.test(pathname);
  if (!items.length) return null;
  return <View style={styles.railSection}><Text style={styles.railTitle}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{items.map((item) => <PressableScale key={item.id} onPress={() => openDetails(item, kind, isAlreadyInDetails)} style={styles.card}><Image source={resolveMediaURL(item.poster_url || item.backdrop_url)} style={styles.poster} contentFit="cover" /><Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.cardMeta}>{kind === 'movie' ? `${(item as Movie).release_year || ''} · ${item.genre}` : `${(item as Series).seasons} ${t((item as Series).seasons === 1 ? 'season' : 'seasons')} · ${(item as Series).episode_count} ${t((item as Series).episode_count === 1 ? 'episode' : 'episodes')}`}</Text></PressableScale>)}</ScrollView></View>;
}

const useStyles = makeStyles(() => ({ hero: { height: 510, backgroundColor: colors.black }, heroCopy: { position: 'absolute', left: 20, right: 26, bottom: 32 }, kicker: { color: colors.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 }, heroTitle: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1, marginTop: 9 }, synopsis: { color: withAlpha(colors.text, .9), fontSize: 13, lineHeight: 19, marginTop: 10 }, buttons: { flexDirection: 'row', gap: 10, marginTop: 18 }, play: { height: 45, paddingHorizontal: 21, borderRadius: radii.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }, playText: { color: colors.onText, fontSize: 14, fontWeight: '900' }, info: { height: 45, paddingHorizontal: 21, borderRadius: radii.pill, backgroundColor: withAlpha(colors.surfaceStrong, .86), alignItems: 'center', justifyContent: 'center' }, infoText: { color: colors.text, fontSize: 14, fontWeight: '900' }, railSection: { marginTop: 26 }, railTitle: { color: colors.text, fontSize: 21, fontWeight: '900', paddingHorizontal: 18, marginBottom: 12 }, rail: { paddingHorizontal: 18, gap: 13 }, card: { width: 146 }, poster: { width: 146, height: 218, borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, cardTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '800', marginTop: 8 }, cardMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4 } }));
