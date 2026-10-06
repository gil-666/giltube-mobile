import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { moviesAPI, type MetadataResult } from './api';
import { AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

/** TMDB lookup; applying a result fills the form and pins the TMDB id. */
export function MetadataSearch({ initialQuery, onApply }: { initialQuery: string; onApply: (result: MetadataResult) => void }) {
  const styles = useStyles();
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MetadataResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    try {
      const data = await moviesAPI.searchMetadata(trimmed);
      setResults(data?.results || []);
    } catch (searchError) {
      setError(searchError);
    } finally {
      setSearching(false);
    }
  };

  return <AdminCard>
    <AdminField label={t('Search TMDB')} value={query} onChangeText={setQuery} placeholder={t('Movie title')} help={t('Fills in the details, artwork and TMDB id. Review before saving.')} />
    <AdminButtons>
      <AdminButton icon="search" label={searching ? t('Searching…') : t('Search')} onPress={() => void search()} busy={searching} disabled={!query.trim()} />
      {!!results?.length && <AdminButton label={t('Clear results')} onPress={() => setResults(null)} />}
    </AdminButtons>
    <AdminError error={error} />
    {results && results.length === 0 && <AdminEmpty text={t('No metadata matches found.')} />}
    {results?.map((result) => <View key={`${result.source}-${result.source_id}`} style={styles.result}>
      {result.poster_url ? <Image source={{ uri: result.poster_url }} style={styles.poster} contentFit="cover" /> : <View style={styles.poster} />}
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>{result.title}</Text>
        <Text numberOfLines={1} style={styles.meta}>{[result.release_year || t('Unknown year'), (result.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</Text>
        <Text numberOfLines={3} style={styles.synopsis}>{result.synopsis}</Text>
        <AdminButtons><AdminButton compact variant="primary" icon="checkmark" label={t('Apply')} onPress={() => { onApply(result); setResults(null); }} /></AdminButtons>
      </View>
    </View>)}
  </AdminCard>;
}

const useStyles = makeStyles(() => ({
  result: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 10 },
  poster: { width: 64, aspectRatio: 2 / 3, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  synopsis: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 4 },
}));
