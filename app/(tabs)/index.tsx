import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { Brand } from '@/components/Brand';
import { PressableScale } from '@/components/PressableScale';
import { SectionRail } from '@/components/SectionRail';
import { CatalogRail } from '@/components/StreamingCatalog';
import { LiveStreamRail } from '@/live/LiveStreamCard';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

export default function HomeScreen() {
	const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t, compactNumber } = useI18n();
  const { status } = useAuth(); const signedIn = status === 'signedIn';
  const home = useQuery({ queryKey: ['home'], queryFn: giltubeAPI.home });
	const featured = useQuery({ queryKey: ['featured-content'], queryFn: giltubeAPI.featuredContent, refetchInterval: 60_000 });
	const [featuredIndex, setFeaturedIndex] = useState(0);
	const featuredScrollRef = useRef<ScrollView>(null);
  const live = useQuery({ queryKey: ['live-streams'], queryFn: giltubeAPI.activeLiveStreams, refetchInterval: 30_000 });
  const movies = useQuery({ queryKey: ['movies'], queryFn: giltubeAPI.movies });
  const series = useQuery({ queryKey: ['series'], queryFn: giltubeAPI.series });
  const recent = useQuery({ queryKey: ['watch-progress-recent'], queryFn: () => giltubeAPI.recentWatchProgress(12), enabled: signedIn });
  const unread = useQuery({ queryKey: ['notification-count'], queryFn: giltubeAPI.unreadNotifications, enabled: signedIn, refetchInterval: 60_000 });
  const hero = home.data?.recommended?.[0] || home.data?.trending?.[0] || home.data?.browse?.[0];
	const featuredItems = featured.data?.items?.slice(0, 5) || [];
	const openFeatured = (item: import('@/types/api').FeaturedContent) => { if (item.content_type === 'video') router.push({ pathname: '/video/[id]', params: { id: item.content_id } }); else if (item.content_type === 'live') router.push({ pathname: '/live/[channelId]', params: { channelId: item.channel_id } }); else if (item.content_type === 'movie') router.push({ pathname: '/movies/[id]', params: { id: item.content_id } }); else router.push({ pathname: '/series/[id]', params: { id: item.content_id } }); };
	const onFeaturedScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setFeaturedIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)));
	const featuredMeta = (item: import('@/types/api').FeaturedContent) => item.is_live ? t('LIVE NOW') : item.scheduled_for ? `${t('Live')} ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.scheduled_for))}` : item.channel_name || 'GilTube';
	useEffect(() => {
		if (featuredItems.length < 2) return;
		const timer = setInterval(() => {
			const nextIndex = (featuredIndex + 1) % featuredItems.length;
			featuredScrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
			setFeaturedIndex(nextIndex);
		}, 7000);
		return () => clearInterval(timer);
	}, [featuredIndex, featuredItems.length, width]);
  const rails = useMemo(() => {
    const seen = new Set((recent.data?.items || []).map((item) => item.video.id));
    if (hero?.id) seen.add(hero.id);
    const unique = (videos: import('@/types/api').Video[] | null | undefined) => (videos || []).filter((video) => {
      if (!video?.id || seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    });
    return {
      recommended: unique(home.data?.recommended),
      trending: unique(home.data?.trending),
      trusted: unique(home.data?.trusted),
      fresh: unique(home.data?.fresh),
      browse: unique(home.data?.browse),
    };
  }, [hero, home.data, recent.data?.items]);
  const feedVideoIDs = useMemo(() => [...new Set(Object.values(rails).flat().map((video) => video.id))], [rails]);
  const progress = useQuery({ queryKey: ['watch-progress-map', feedVideoIDs.join(',')], queryFn: () => giltubeAPI.watchProgressMap(feedVideoIDs), enabled: signedIn && feedVideoIDs.length > 0 });
  const progressByVideoID = useMemo(() => { const values: Record<string, number> = {}; const add = (videoID: string, item?: import('@/types/api').WatchProgress) => { if (!item || item.completed || item.duration_seconds <= 0 || item.position_seconds <= 5) return; const percent = item.position_seconds / item.duration_seconds * 100; if (percent < 90) values[videoID] = percent; }; Object.entries(progress.data?.progress || {}).forEach(([videoID, item]) => add(videoID, item)); (recent.data?.items || []).forEach((item) => add(item.video.id, item.progress)); return values; }, [progress.data?.progress, recent.data?.items]);

  return (
    <View style={styles.screen}><BlurView intensity={48} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.header, { height: insets.top + 62, paddingTop: insets.top }]}><Brand compact /><PressableScale accessibilityLabel={t('Notifications')} onPress={() => router.push(signedIn ? '/notifications' : '/login')} style={[styles.headerButton, styles.notificationButton]}><Ionicons name="notifications-outline" color={colors.white} size={23} />{!!unread.data?.unread_count && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unread.data.unread_count > 99 ? '99+' : unread.data.unread_count}</Text></View>}</PressableScale><PressableScale accessibilityLabel={t('Search')} onPress={() => router.push('/(tabs)/search')} style={styles.headerButton}><Ionicons name="search" color={colors.white} size={22} /></PressableScale></BlurView><ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + 104 }}
      refreshControl={<RefreshControl refreshing={home.isRefetching || featured.isRefetching || live.isRefetching || movies.isRefetching || series.isRefetching} onRefresh={() => { void home.refetch(); void featured.refetch(); void live.refetch(); void movies.refetch(); void series.refetch(); }} tintColor={colors.accentBright} />}
    >
      {home.isLoading && <ActivityIndicator style={styles.loader} color={colors.accentBright} size="large" />}
      {home.isError && !featuredItems.length && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('Couldn’t load your feed')}</Text>
          <Text style={styles.errorBody}>{home.error.message}</Text>
        </View>
      )}

	  {!!featuredItems.length && <View style={styles.featuredShell}><ScrollView ref={featuredScrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onFeaturedScroll}>{featuredItems.map((item)=><Animated.View key={item.id} entering={FadeIn.duration(350)} style={[styles.hero,{width}]}><Image source={resolveMediaURL(item.image_url)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250}/><LinearGradient colors={['transparent','rgba(9,9,11,.48)',colors.canvas]} locations={[.08,.5,1]} style={StyleSheet.absoluteFill}/><View style={styles.heroContent}><Text style={styles.heroBadge}>{item.header||t(item.content_type==='live'?'UPCOMING LIVE':item.content_type==='video'?'FEATURED':'NOW AVAILABLE')}</Text><Text numberOfLines={2} style={styles.heroTitle}>{item.title}</Text>{!!item.description&&<Text numberOfLines={3} style={styles.heroDescription}>{item.description}</Text>}<Text numberOfLines={1} style={styles.heroMeta}>{featuredMeta(item)}</Text><PressableScale onPress={()=>openFeatured(item)} style={styles.playButton}><Text style={styles.playButtonText}>{item.action_text}</Text></PressableScale></View></Animated.View>)}</ScrollView>{featuredItems.length>1&&<View style={styles.heroDots}>{featuredItems.map((item,index)=><View key={item.id} style={[styles.heroDot,index===featuredIndex&&styles.heroDotActive]}/>)}</View>}</View>}

      {!featuredItems.length && !!hero && (
        <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
          <Image source={resolveMediaURL(hero.thumbnail_url)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <LinearGradient colors={['transparent', 'rgba(9,9,11,.42)', colors.canvas]} locations={[0.1, 0.54, 1]} style={StyleSheet.absoluteFill} />
          <Animated.View entering={FadeInDown.delay(140).duration(480)} style={styles.heroContent}>
            <Text style={styles.heroBadge}>{t(home.data?.personalized ? 'FOR YOU' : 'FEATURED')}</Text>
            <Text numberOfLines={2} style={styles.heroTitle}>{hero.title}</Text>
            <Text numberOfLines={1} style={styles.heroMeta}>{hero.channel?.name || 'GilTube'} · {compactNumber(hero.views || 0)} {t(hero.views === 1 ? 'view' : 'views')}</Text>
            <PressableScale onPress={() => router.push({ pathname: '/video/[id]', params: { id: hero.id } })} style={styles.playButton}>
              <Text style={styles.playButtonText}>{t('▶ Play now')}</Text>
            </PressableScale>
          </Animated.View>
        </Animated.View>
      )}

      {!!home.data && (
        <>
          <LiveStreamRail streams={live.data || []} />
          {!!recent.data?.items.length && <SectionRail title={t('Continue watching')} subtitle={t('Pick up where you left off')} videos={recent.data.items.map((item) => item.video)} progressByVideoID={progressByVideoID} />}
          <SectionRail title={t('Recommended')} subtitle={home.data.personalized ? t('Picked from what you watch') : undefined} videos={rails.recommended} progressByVideoID={progressByVideoID} />
          <SectionRail title={t('Trending now')} videos={rails.trending} progressByVideoID={progressByVideoID} />
          <SectionRail title={t('Trusted channels')} videos={rails.trusted} progressByVideoID={progressByVideoID} />
          <View style={styles.destinations}><PressableScale onPress={() => router.push('/movies')} style={styles.destination}><LinearGradient colors={['#7f1d1d', '#18181b']} style={StyleSheet.absoluteFill} /><Text style={styles.destinationKicker}>GILTUBE</Text><Text style={styles.destinationTitle}>{t('Movies')}</Text><Text style={styles.destinationMeta}>{t('Feature films')}</Text></PressableScale><PressableScale onPress={() => router.push('/series')} style={styles.destination}><LinearGradient colors={['#164e63', '#18181b']} style={StyleSheet.absoluteFill} /><Text style={[styles.destinationKicker, { color: colors.gilid }]}>GILTUBE</Text><Text style={styles.destinationTitle}>{t('Series')}</Text><Text style={styles.destinationMeta}>{t('Episodes & seasons')}</Text></PressableScale></View>
          {!!movies.data?.movies.length && <CatalogRail title={t('Movies for tonight')} items={movies.data.movies.slice(0, 12)} kind="movie" />}
          {!!series.data?.series.length && <CatalogRail title={t('Binge-worthy series')} items={series.data.series.slice(0, 12)} kind="series" />}
          <SectionRail title={t('Fresh uploads')} videos={rails.fresh} progressByVideoID={progressByVideoID} />
          <SectionRail title={t('Explore more')} videos={rails.browse} progressByVideoID={progressByVideoID} />
        </>
      )}
    </ScrollView></View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { position: 'absolute', zIndex: 10, top: 0, left: 0, right: 0, overflow: 'hidden', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,.38)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.16)' },
  headerButton: { width: 44, height: 44, marginLeft: 8, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.08)' }, notificationButton: { marginLeft: 'auto' }, notificationBadge: { position: 'absolute', right: 2, top: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright }, notificationBadgeText: { color: colors.white, fontSize: 8, fontWeight: '900' },
  loader: { marginTop: 180 },
  hero: { height: 530, backgroundColor: colors.surface },
  heroContent: { position: 'absolute', left: 20, right: 28, bottom: 32 },
  heroBadge: { color: colors.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  heroTitle: { color: colors.text, fontSize: 35, lineHeight: 38, fontWeight: '900', letterSpacing: -1.2, marginTop: 10 },
  heroMeta: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
	heroDescription: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 9 },
	featuredShell: { height: 530, position: 'relative' },
	heroDots: { position: 'absolute', right: 20, bottom: 24, flexDirection: 'row', gap: 6 }, heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.4)' }, heroDotActive: { width: 23, backgroundColor: colors.white },
  playButton: { alignSelf: 'flex-start', backgroundColor: colors.text, minWidth: 132, height: 46, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginTop: 20, paddingHorizontal: 20 },
  playButtonText: { color: colors.black, fontSize: 14, fontWeight: '900' },
  errorCard: { margin: 20, marginTop: 130, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'rgba(127,29,29,.18)', padding: 18 },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  errorBody: { color: colors.textMuted, fontSize: 13, marginTop: 5 },
  destinations: { flexDirection: 'row', gap: 11, paddingHorizontal: 18, marginTop: 27 }, destination: { flex: 1, height: 105, overflow: 'hidden', borderRadius: radii.xl, padding: 15, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.border }, destinationKicker: { color: colors.accentBright, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 }, destinationTitle: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 3 }, destinationMeta: { color: colors.textMuted, fontSize: 9, marginTop: 3 },
});
