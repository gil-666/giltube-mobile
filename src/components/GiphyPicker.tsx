import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { giphyAPI, type GiphyGIF } from '@/api/giphy';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import { PressableScale } from './PressableScale';
import { SwipeSheet } from './SwipeSheet';

export function GiphyPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (url: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(''); const [gifs, setGIFs] = useState<GiphyGIF[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const load = async (search = '') => { setLoading(true); setError(''); setGIFs([]); try { setGIFs(search.trim() ? await giphyAPI.search(search) : await giphyAPI.trending()); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load GIFs.'); } finally { setLoading(false); } };
  useEffect(() => { if (!visible) return; const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [visible]);
  return <SwipeSheet visible={visible} title={t('Choose a GIF')} onClose={onClose}><View style={styles.search}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void load(query)} returnKeyType="search" placeholder={t('Search Giphy')} placeholderTextColor={colors.textDim} style={styles.input} /><PressableScale onPress={() => void load(query)} style={styles.searchButton}><Text style={styles.searchText}>{t('Search')}</Text></PressableScale></View>{loading && <ActivityIndicator style={styles.loading} color={colors.accentBright} />}{!!error && <PressableScale onPress={() => void load(query)}><Text style={styles.error}>{error} {t('Tap to retry.')}</Text></PressableScale>}{!loading && !error && !gifs.length && <Text style={styles.empty}>{t('No GIFs found.')}</Text>}<View style={styles.grid}>{gifs.map((gif) => <PressableScale key={gif.id} accessibilityLabel={gif.title || 'GIF'} onPress={() => { onSelect(gif.originalURL); onClose(); }} style={styles.gif}><Image source={{ uri: gif.previewURL }} recyclingKey={gif.id} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} /></PressableScale>)}</View><Text style={styles.attribution}>{t('Powered by GIPHY')}</Text></SwipeSheet>;
}
const styles = StyleSheet.create({ search: { flexDirection: 'row', gap: 8, marginBottom: 14 }, input: { flex: 1, height: 46, paddingHorizontal: 13, borderRadius: radii.md, backgroundColor: colors.surfaceStrong, color: colors.text }, searchButton: { height: 46, paddingHorizontal: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, searchText: { color: colors.white, fontSize: 12, fontWeight: '900' }, loading: { marginVertical: 28 }, error: { color: colors.accentBright, textAlign: 'center', marginVertical: 18 }, empty: { color: colors.textMuted, textAlign: 'center', marginVertical: 22 }, grid: { minHeight: 40, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, gif: { width: '48.5%', aspectRatio: 1.25, overflow: 'hidden', borderRadius: radii.md, backgroundColor: colors.surfaceStrong }, attribution: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textAlign: 'right', paddingVertical: 14 } });
