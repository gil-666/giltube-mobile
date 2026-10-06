import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useDeferredValue, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { PressableScale } from '@/components/PressableScale';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { SearchResult } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

const historyKey = 'giltube.search-history.v1';
const historyLimit = 10;

export default function SearchScreen() {
  const styles = useStyles();
  const { t, compactNumber } = useI18n();
  const { q: initialQuery = '' } = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query.trim());
  useEffect(() => { void SecureStore.getItemAsync(historyKey).then((raw) => { const saved: unknown = raw ? JSON.parse(raw) : []; if (Array.isArray(saved)) setHistory(saved.filter((item): item is string => typeof item === 'string').slice(0, historyLimit)); }).catch(() => undefined); }, []);
  const suggestions = useQuery({
    queryKey: ['search-suggestions', deferredQuery],
    queryFn: () => giltubeAPI.searchSuggestions(deferredQuery),
    enabled: deferredQuery.length >= 1 && deferredQuery !== submittedQuery,
    staleTime: 60_000,
  });
  const search = useQuery({
    queryKey: ['search', submittedQuery],
    queryFn: () => giltubeAPI.search(submittedQuery),
    enabled: submittedQuery.length >= 2,
  });

  const remember = (term: string) => {
    const clean = term.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) return;
    setHistory((current) => {
      const next = [clean, ...current.filter((item) => item.toLocaleLowerCase() !== clean.toLocaleLowerCase())].slice(0, historyLimit);
      void SecureStore.setItemAsync(historyKey, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };
  const submit = (term = query) => {
    const clean = term.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) return;
    setQuery(clean);
    setSubmittedQuery(clean);
    remember(clean);
    Keyboard.dismiss();
  };
  const removeHistory = (term?: string) => setHistory((current) => {
    const next = term ? current.filter((item) => item !== term) : [];
    void (next.length ? SecureStore.setItemAsync(historyKey, JSON.stringify(next)) : SecureStore.deleteItemAsync(historyKey)).catch(() => undefined);
    return next;
  });

  const open = (item: SearchResult) => {
    if (item.type === 'term') { submit(item.title); return; }
    remember(query || item.name || item.title);
    Keyboard.dismiss();
    if (item.type === 'channel') router.push({ pathname: '/channel/[id]', params: { id: item.id } });
    else if (item.type === 'movie') router.push({ pathname: '/movies/[id]', params: { id: item.id } });
    else if (item.type === 'series') router.push({ pathname: '/series/[id]', params: { id: item.id } });
    else if (item.type === 'video' || item.video_id) router.push({ pathname: '/video/[id]', params: { id: item.video_id || item.id } });
  };
  const showSuggestions = deferredQuery.length > 0 && deferredQuery !== submittedQuery;
  const suggestionItems = (Array.isArray(suggestions.data?.suggestions) ? suggestions.data.suggestions : [])
    .map((item) => (item.type === 'term' ? item.title : item.name || item.title).trim())
    .filter((term, index, items) => !!term && items.findIndex((candidate) => candidate.toLocaleLowerCase() === term.toLocaleLowerCase()) === index);
  const resultItems = Array.isArray(search.data?.results) ? search.data.results : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>{t('Search')}</Text>
      <Animated.View entering={FadeInDown.duration(420).springify()} style={styles.searchBox}>
        <Ionicons name="search" color={colors.textDim} size={20} />
        <TextInput value={query} onChangeText={(value) => { setQuery(value); if (!value.trim()) setSubmittedQuery(''); }} onSubmitEditing={() => submit()} placeholder={t('Videos, channels, movies, series')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" style={styles.input} />
        {(search.isFetching || suggestions.isFetching) ? <ActivityIndicator color={colors.accentBright} size="small" /> : <PressableScale accessibilityLabel={t('Search')} onPress={() => submit()} style={styles.submit}><Ionicons name="arrow-forward" color={colors.text} size={19} /></PressableScale>}
      </Animated.View>
      {!query.trim() && !submittedQuery && !!history.length && <View style={styles.historyHeader}><Text style={styles.historyTitle}>{t('Recent searches')}</Text><PressableScale onPress={() => removeHistory()}><Text style={styles.clear}>{t('Clear all')}</Text></PressableScale></View>}
      {!query.trim() && !submittedQuery && <FlatList data={history} keyExtractor={(item) => item} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 110 }]} ListEmptyComponent={<Text style={styles.hint}>{t('Search everything on GilTube.')}</Text>} renderItem={({ item }) => <PressableScale onPress={() => submit(item)} style={styles.term}><Ionicons name="time-outline" color={colors.textMuted} size={20} /><Text numberOfLines={1} style={styles.termText}>{item}</Text><PressableScale accessibilityLabel={`${t('Remove')} ${item} ${t('from history')}`} onPress={(event) => { event.stopPropagation(); removeHistory(item); }} style={styles.removeHistory}><Ionicons name="close" color={colors.textDim} size={18} /></PressableScale></PressableScale>} />}
      {showSuggestions && <FlatList data={suggestionItems} keyExtractor={(item) => item.toLocaleLowerCase()} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 110 }]} ListEmptyComponent={<Text style={styles.hint}>{suggestions.isFetching ? '' : t('No suggestions yet.')}</Text>} renderItem={({ item }) => <PressableScale onPress={() => submit(item)} style={styles.term}><Ionicons name="search-outline" color={colors.textMuted} size={20} /><Text numberOfLines={1} style={styles.termText}>{item}</Text><Ionicons name="arrow-up-outline" color={colors.textDim} size={17} /></PressableScale>} />}
      {!!submittedQuery && !showSuggestions && <FlatList
        data={resultItems}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 110 }]}
        ListEmptyComponent={<Text style={styles.hint}>{search.isFetching ? '' : t('No results found.')}</Text>}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(300)}>
            <PressableScale onPress={() => open(item)} style={styles.result}>
              <Image source={resolveMediaURL(item.avatar || item.poster_url || item.thumbnail || item.backdrop_url || '')} style={[styles.art, item.type === 'channel' && styles.avatar]} contentFit="cover" />
              <View style={styles.copy}>
                {item.type !== 'video' && <View style={styles.typeRow}><Text style={styles.type}>{t(item.type.toUpperCase())}</Text></View>}
                <View style={styles.titleRow}><Text numberOfLines={2} style={styles.resultTitle}>{item.name || item.title}</Text>{item.type === 'channel' && <VerifiedBadge verified={item.verified} />}</View>
                {item.type === 'video' ? <View style={styles.videoMeta}><Text numberOfLines={1} style={styles.channelName}>{item.channel || 'GilTube'}</Text><VerifiedBadge verified={item.verified} size={13} /><Text style={styles.meta}>· {compactNumber(item.views)} {t(item.views === 1 ? 'view' : 'views')}</Text></View> : <Text numberOfLines={2} style={styles.meta}>{item.year || item.description || ''}</Text>}
              </View>
              {(item.type === 'video' || item.video_id) && <Ionicons name="play-circle" size={26} color={colors.textMuted} />}
            </PressableScale>
          </Animated.View>
        )}
      />}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 }, title: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.2 },
  searchBox: { height: 52, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 15, paddingRight: 7, marginTop: 20 }, input: { flex: 1, color: colors.text, fontSize: 16 }, submit: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }, results: { paddingTop: 12 }, hint: { color: colors.textMuted, fontSize: 14, marginTop: 12 }, historyHeader: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, historyTitle: { color: colors.text, fontSize: 17, fontWeight: '900' }, clear: { color: colors.gilid, fontSize: 12, fontWeight: '800' }, term: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, termText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }, removeHistory: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  result: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, art: { width: 126, aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, avatar: { width: 70, height: 70, borderRadius: 35 }, copy: { flex: 1, minWidth: 0 }, typeRow: { flexDirection: 'row', gap: 5, alignItems: 'center' }, type: { color: colors.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, resultTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '800', marginTop: 4, flexShrink: 1 }, videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, channelName: { color: colors.textMuted, fontSize: 11, maxWidth: 130 }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 }, videoMetaText: { color: colors.textMuted, fontSize: 11 },
}));
