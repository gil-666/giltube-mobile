import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Text, View, type ViewToken } from 'react-native';

import { geelsAPI, type Geel } from '@/api/geels';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { usePlayer } from '@/player/PlayerProvider';
import { colors, makeStyles } from '@/theme/tokens';
import { GeelComments } from './GeelComments';
import { GeelItem } from './GeelItem';

export interface GeelFeedHandle {
  /** Back to the top with a freshly ranked feed (Geels tab tapped again). */
  refresh: () => void;
}

export function GeelFeed({ ref, startId, channel, sound, openComments = false, bottomInset = 0 }: { ref?: Ref<GeelFeedHandle>; startId?: string; channel?: string; sound?: string; openComments?: boolean; bottomInset?: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { account, status } = useAuth();
  const signedIn = status === 'signedIn' && !!account;
  const { activeChannelID: actorID } = useActiveChannel();
  const videoPlayer = usePlayer();
  const music = useMusicPlayer();
  const [items, setItems] = useState<Geel[]>([]);
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [failed, setFailed] = useState(false);
  const [commentsGeel, setCommentsGeel] = useState<Geel | null>(null);
  const loadingRef = useRef(false);
  const listRef = useRef<FlatList<Geel>>(null);
  const itemsRef = useRef<Geel[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const known = reset ? [] : itemsRef.current;
      const page = await geelsAPI.feed({
        limit: 6, exclude: known.map((geel) => geel.id), start: known.length ? undefined : startId,
        channel, sound, actor: actorID || undefined,
      });
      const seen = new Set(known.map((geel) => geel.id));
      const next = [...known, ...page.items.filter((geel) => !seen.has(geel.id))];
      itemsRef.current = next;
      setItems(next);
      setHasMore(page.has_more && page.items.length > 0);
      setFailed(false);
      // Opened from a comment notification: show the start Geel's comments.
      if (reset && openComments && next[0]?.id === startId) setCommentsGeel(next[0]);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [actorID, channel, openComments, sound, startId]);

  useEffect(() => { void loadMore(true); }, [loadMore]);

  // Geels have the floor: pause the main player and music while watching.
  // Through refs: both contexts change often (positions, queues), and the
  // focus effect must only run when the screen gains or loses focus.
  const musicRef = useRef(music);
  const videoPlayerRef = useRef(videoPlayer.player);
  useEffect(() => { musicRef.current = music; videoPlayerRef.current = videoPlayer.player; });
  useFocusEffect(useCallback(() => {
    setFocused(true);
    if (videoPlayerRef.current.playing) videoPlayerRef.current.pause();
    if (musicRef.current.playing) musicRef.current.pause();
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  // FlatList requires this callback to never change.
  const [onViewableItemsChanged] = useState(() => ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((item) => item.isViewable);
    if (first?.index != null) setActiveIndex(first.index);
  });

  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (loadingRef.current) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setCommentsGeel(null);
      setActiveIndex(0);
      itemsRef.current = [];
      setItems([]);
      setHasMore(true);
      void loadMore(true);
    },
  }), [loadMore]);

  useEffect(() => {
    if (hasMore && activeIndex >= items.length - 3) void loadMore();
  }, [activeIndex, hasMore, items.length, loadMore]);

  const updateGeel = useCallback((updated: Geel) => {
    setItems((current) => current.map((geel) => geel.id === updated.id ? updated : geel));
    setCommentsGeel((current) => current && current.id === updated.id ? updated : current);
  }, []);
  const toggleMute = useCallback(() => setMuted((value) => !value), []);
  const playing = focused && appActive && !commentsGeel;

  return <View style={styles.screen} onLayout={(event) => setHeight(Math.round(event.nativeEvent.layout.height))}>
    <StatusBar style="light" />
    {height > 0 && <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(geel) => geel.id}
      renderItem={({ item, index }) => <GeelItem
        geel={item}
        height={height}
        current={index === activeIndex}
        suspended={!playing}
        nearby={Math.abs(index - activeIndex) <= 1}
        muted={muted}
        bottomInset={bottomInset}
        actorID={actorID}
        signedIn={signedIn}
        onToggleMute={toggleMute}
        onOpenComments={setCommentsGeel}
        onChange={updateGeel}
      />}
      pagingEnabled
      snapToInterval={height}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      showsVerticalScrollIndicator={false}
      getItemLayout={(_data, index) => ({ length: height, offset: height * index, index })}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      windowSize={5}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      ListEmptyComponent={<View style={[styles.empty, { height }]}>
        {loading ? <ActivityIndicator color={colors.accentBright} size="large" /> : <>
          <Ionicons name={failed ? 'cloud-offline-outline' : 'phone-portrait-outline'} size={46} color={colors.textDim} />
          <Text style={styles.emptyTitle}>{t(failed ? 'Couldn’t load Geels' : 'No Geels yet')}</Text>
          <Text style={styles.emptyBody}>{t(failed ? 'Check your connection and try again.' : 'Short vertical videos show up here. Be the first to post one.')}</Text>
        </>}
      </View>}
      ListFooterComponent={!hasMore && items.length ? <Text style={styles.end}>{t('You’re all caught up')}</Text> : null}
    />}
    <GeelComments geel={commentsGeel} actorID={actorID} signedIn={signedIn} onClose={() => setCommentsGeel(null)} onCommented={updateGeel} />
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: '#000' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  end: { color: colors.textDim, textAlign: 'center', paddingVertical: 24, fontSize: 13 },
}));
