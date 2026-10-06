import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { CatalogRail } from '@/components/StreamingCatalog';
import { PressableScale } from '@/components/PressableScale';
import { MediaBadges } from '@/components/MediaBadges';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import { formatPlaybackTime, isResumable } from '@/utils/watchProgress';

export default function MovieDetailsScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const detail = useQuery({ queryKey: ['movie', id], queryFn: () => giltubeAPI.movie(id), enabled: !!id });
  const catalog = useQuery({ queryKey: ['movies'], queryFn: giltubeAPI.movies });
  const movie = detail.data?.movie;
  const { status } = useAuth();
  const progress = useQuery({ queryKey: ['watch-progress-detail', movie?.video_id], queryFn: () => giltubeAPI.watchProgress(movie!.video_id!), enabled: status === 'signedIn' && !!movie?.video_id, retry: false });
  const resume = isResumable(progress.data?.progress) ? progress.data.progress : null;
  const openMovie = (startOver = false) => movie?.video_id && router.push({ pathname: '/video/[id]', params: startOver ? { id: movie.video_id, startOver: '1' } : { id: movie.video_id } });
  const related = movie ? (catalog.data?.movies || []).filter((item) => item.id !== movie.id && item.genres?.some((genre) => movie.genres?.includes(genre))).slice(0, 12) : [];
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
    <View style={[styles.top, { paddingTop: insets.top + 8 }]}><PressableScale onPress={() => router.back()} style={styles.round}><Ionicons name="chevron-back" color={colors.white} size={25} /></PressableScale></View>
    {detail.isLoading && <ActivityIndicator style={styles.loading} color={colors.accentBright} size="large" />}
    {!!movie && <>
      <View style={styles.hero}><Image source={resolveMediaURL(movie.backdrop_url || movie.poster_url)} style={StyleSheet.absoluteFill} contentFit="cover" /><LinearGradient colors={['rgba(0,0,0,.08)', 'rgba(9,9,11,.45)', colors.canvas]} locations={[0, .58, 1]} style={StyleSheet.absoluteFill} /></View>
      <View style={styles.copy}><View style={styles.identity}><Image source={resolveMediaURL(movie.poster_url)} style={styles.poster} contentFit="cover" /><View style={styles.identityCopy}><Text style={styles.kicker}>{t('GILTUBE MOVIE')}</Text><Text style={styles.title}>{movie.title}</Text><Text style={styles.meta}>{[movie.release_year, ...(movie.genres || [])].filter(Boolean).join('  ·  ')}</Text></View></View>
        <View style={styles.buttons}>{!!movie.video_id && <PressableScale onPress={() => openMovie()} style={styles.play}><Ionicons name="play" color={colors.black} size={19} /><Text numberOfLines={1} style={styles.playText}>{resume ? `${t('Resume')} · ${formatPlaybackTime(resume.position_seconds)}` : t('Play movie')}</Text></PressableScale>}{!!resume && <PressableScale accessibilityLabel={t('Start over')} onPress={() => openMovie(true)} style={styles.trailer}><Ionicons name="refresh" color={colors.text} size={18} /><Text style={styles.trailerText}>{t('Start over')}</Text></PressableScale>}{!!movie.trailer_video_id && <PressableScale onPress={() => router.push({ pathname: '/video/[id]', params: { id: movie.trailer_video_id } })} style={styles.trailer}><Ionicons name="film-outline" color={colors.text} size={18} /><Text style={styles.trailerText}>{t('Trailer')}</Text></PressableScale>}</View>
        <Text style={styles.synopsis}>{movie.synopsis}</Text>
        {!!movie.directors?.length && <Credit label={t('Directed by')} value={movie.directors.join(', ')} />}
        {!!movie.cast?.length && <Credit label={t('Cast')} value={movie.cast.join(', ')} />}
        <MediaBadges capabilities={movie.media_capabilities} rating={movie.content_rating} explicit={movie.explicit} />
      </View>
      <CatalogRail title={t('More like this')} items={related} kind="movie" />
    </>}
  </ScrollView>;
}

function Credit({ label, value }: { label: string; value: string }) { return <Text style={styles.credit}><Text style={styles.creditLabel}>{label}: </Text>{value}</Text>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, top: { position: 'absolute', zIndex: 4, left: 12, top: 0, height: 64 }, round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.65)', alignItems: 'center', justifyContent: 'center' }, loading: { marginTop: 180 }, hero: { height: 370, backgroundColor: colors.surfaceStrong }, copy: { marginTop: -106, paddingHorizontal: 20 }, identity: { flexDirection: 'row', alignItems: 'flex-end' }, poster: { width: 112, height: 168, borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.borderStrong }, identityCopy: { flex: 1, paddingLeft: 16, paddingBottom: 8 }, kicker: { color: colors.accentBright, fontSize: 9, letterSpacing: 1.5, fontWeight: '900' }, title: { color: colors.text, fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -.8, marginTop: 7 }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 8 }, buttons: { flexDirection: 'row', gap: 10, marginTop: 20 }, play: { flex: 1, height: 48, borderRadius: radii.pill, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, playText: { color: colors.black, fontSize: 14, fontWeight: '900' }, trailer: { height: 48, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong, flexDirection: 'row', alignItems: 'center', gap: 7 }, trailerText: { color: colors.text, fontSize: 13, fontWeight: '800' }, synopsis: { color: colors.text, fontSize: 15, lineHeight: 23, marginTop: 24 }, credit: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 }, creditLabel: { color: colors.text, fontWeight: '800' },
});
