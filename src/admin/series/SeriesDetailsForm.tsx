import { useQueryClient } from '@tanstack/react-query';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage, invalidateSeries, seriesAPI, seriesFormFrom, type AdminSeries, type MetadataEpisode, type MetadataResult, type SeriesFormValues } from './api';
import { contentRatingInputFrom, ContentRatingEditor, emptyContentRatingInput, type ContentRatingInput } from '@/admin/ContentRatingEditor';
import { AdminButton, AdminButtons, AdminCard, AdminError, AdminField, AdminNotice, AdminNumberField, AdminSection, AdminToggle, confirmAction, pickFile } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

// TMDB episode titles picked before the series exists survive the hop from
// /admin/series/new to the created series' screen.
const pendingMetadataEpisodes = new Map<string, MetadataEpisode[]>();
// Read without clearing so a StrictMode double-initialised state still sees it.
export function takePendingMetadataEpisodes(seriesID: string) {
  return pendingMetadataEpisodes.get(seriesID) || [];
}

export function SeriesDetailsForm({ seriesID, initial, metadataEpisodes, onMetadataEpisodes }: { seriesID: string; initial?: AdminSeries | null; metadataEpisodes: MetadataEpisode[]; onMetadataEpisodes: (episodes: MetadataEpisode[]) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SeriesFormValues>(() => seriesFormFrom(initial));
  const [rating, setRating] = useState<ContentRatingInput>(() => initial ? contentRatingInputFrom(initial) : emptyContentRatingInput());
  const [metadataQuery, setMetadataQuery] = useState(initial?.title || '');
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const set = <K extends keyof SeriesFormValues>(key: K, value: SeriesFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const searchMetadata = async () => {
    const query = metadataQuery.trim();
    if (!query) return;
    setSearching(true); setError(null); setMessage('');
    try {
      const data = await seriesAPI.searchMetadata(query);
      setResults(data?.results || []);
      if (!data?.results?.length) setMessage(t('No metadata matches found.'));
    } catch (err) {
      setError(err);
    } finally {
      setSearching(false);
    }
  };

  const applyMetadata = async (result: MetadataResult) => {
    setSearching(true); setError(null);
    let detail = result;
    try {
      const data = await seriesAPI.metadataDetails(result.source_id);
      detail = data?.result || result;
    } catch (err) {
      setError(err);
    } finally {
      setSearching(false);
    }
    setValues((current) => ({
      ...current,
      title: detail.title || current.title,
      synopsis: detail.synopsis || current.synopsis,
      genre: detail.genre || current.genre,
      genres: (detail.genres || []).join(', '),
      directors: (detail.directors || []).join(', '),
      cast: (detail.cast || []).join(', '),
      seasons: detail.seasons || current.seasons,
      posterUrl: detail.poster_url || current.posterUrl,
      backdropUrl: detail.backdrop_url || current.backdropUrl,
      poster: null,
      backdrop: null,
    }));
    if (detail.source === 'tmdb' && Number(detail.source_id) > 0) setRating((current) => ({ ...current, tmdbId: Number(detail.source_id) }));
    const episodes = (detail.episodes || []).filter((episode) => episode.title || episode.synopsis);
    onMetadataEpisodes(episodes);
    setResults([]);
    setMessage(episodes.length
      ? `${t('Applied metadata from "{title}".', { title: detail.title })} ${t('Episode details found for {count} episodes.', { count: episodes.length })}`
      : t('Applied metadata from "{title}".', { title: detail.title }));
  };

  const pickImage = async (kind: 'poster' | 'backdrop') => {
    const asset = await pickFile('image/*');
    if (asset) set(kind, asset);
  };

  const save = async () => {
    if (!values.title.trim()) { setError(new Error(t('Series title is required'))); return; }
    setSaving(true); setError(null); setMessage('');
    try {
      if (!seriesID) {
        const created = await seriesAPI.create(values, rating);
        await invalidateSeries(queryClient);
        if (metadataEpisodes.length) pendingMetadataEpisodes.set(created.id, metadataEpisodes);
        router.replace({ pathname: '/admin/series/[id]', params: { id: created.id } });
        return;
      }
      const updated = await seriesAPI.update(seriesID, values, rating);
      setValues((current) => ({ ...current, posterUrl: updated?.poster_url || current.posterUrl, backdropUrl: updated?.backdrop_url || current.backdropUrl, slug: updated?.slug || current.slug, poster: null, backdrop: null }));
      setRating((current) => ({ ...current, dirty: false }));
      await invalidateSeries(queryClient);
      setMessage(t('Series details saved.'));
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => confirmAction(t, t('Delete series'), t('Delete "{title}" and all linked episode/trailer videos? This cannot be undone.', { title: values.title || seriesID }), async () => {
    setDeleting(true);
    try {
      await seriesAPI.remove(seriesID);
      await invalidateSeries(queryClient);
      router.back();
    } catch (err) {
      setError(new Error(errorMessage(err)));
    } finally {
      setDeleting(false);
    }
  });

  const busy = saving || deleting;

  return <>
    <AdminSection title={t('Metadata')}>
      <AdminCard>
        <AdminField label={t('Series title')} value={metadataQuery} onChangeText={setMetadataQuery} placeholder={t('Search TMDB')} />
        <AdminButtons><AdminButton icon="search" label={searching ? t('Searching...') : t('Search')} busy={searching} disabled={!metadataQuery.trim()} onPress={() => void searchMetadata()} /></AdminButtons>
        {results.map((result) => <View key={`${result.source}-${result.source_id}`} style={styles.result}>
          <Image source={result.poster_url} style={styles.resultPoster} contentFit="cover" />
          <View style={styles.resultCopy}>
            <Text numberOfLines={1} style={styles.resultTitle}>{result.title}</Text>
            <Text style={styles.resultMeta}>{[result.release_year || t('Unknown date'), (result.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</Text>
            <Text numberOfLines={3} style={styles.resultSynopsis}>{result.synopsis}</Text>
            <AdminButtons><AdminButton compact label={t('Apply')} disabled={searching} onPress={() => void applyMetadata(result)} /></AdminButtons>
          </View>
        </View>)}
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Details')}>
      <AdminField label={t('Title')} value={values.title} onChangeText={(text) => set('title', text)} />
      <AdminField label={t('Slug')} value={values.slug} onChangeText={(text) => set('slug', text)} placeholder={t('Generated from the title')} autoCapitalize="none" />
      <AdminField label={t('Primary genre')} value={values.genre} onChangeText={(text) => set('genre', text)} />
      <AdminNumberField label={t('Seasons')} value={values.seasons} onChange={(value) => set('seasons', Math.max(1, value))} />
      <AdminField label={t('Synopsis')} value={values.synopsis} onChangeText={(text) => set('synopsis', text)} multiline />
      <AdminField label={t('Genres')} value={values.genres} onChangeText={(text) => set('genres', text)} placeholder={t('Comma separated')} />
      <AdminField label={t('Directors')} value={values.directors} onChangeText={(text) => set('directors', text)} placeholder={t('Comma separated')} autoCapitalize="words" />
      <AdminField label={t('Cast')} value={values.cast} onChangeText={(text) => set('cast', text)} placeholder={t('Comma separated')} autoCapitalize="words" />
    </AdminSection>

    <AdminSection title={t('Artwork')}>
      <ImageField label={t('Poster image')} url={values.posterUrl} asset={values.poster} portrait onURL={(url) => set('posterUrl', url)} onPick={() => void pickImage('poster')} onClear={() => set('poster', null)} />
      <ImageField label={t('Backdrop image')} url={values.backdropUrl} asset={values.backdrop} onURL={(url) => set('backdropUrl', url)} onPick={() => void pickImage('backdrop')} onClear={() => set('backdrop', null)} />
    </AdminSection>

    <AdminSection title={t('Content rating')}>
      <ContentRatingEditor value={rating} onChange={setRating} />
      <AdminToggle label={t('Feature this series in the Series category hero')} value={values.isFeatured} onChange={(value) => set('isFeatured', value)} />
      <AdminToggle label={t('18+ explicit')} help={t('Changing this applies to every episode; new episodes inherit it. Single episodes can still be set on their own screen.')} value={values.explicit} onChange={(value) => set('explicit', value)} />
    </AdminSection>

    <AdminError error={error} />
    {!!message && <AdminNotice tone="good" text={message} />}
    <AdminButtons>
      <AdminButton variant="primary" icon="save-outline" label={seriesID ? t('Save series details') : t('Create series')} busy={saving} disabled={busy} onPress={() => void save()} />
      {!!seriesID && <AdminButton variant="danger" icon="trash-outline" label={t('Delete series')} busy={deleting} disabled={busy} onPress={remove} />}
    </AdminButtons>
  </>;
}

function ImageField({ label, url, asset, portrait, onURL, onPick, onClear }: { label: string; url: string; asset: DocumentPickerAsset | null; portrait?: boolean; onURL: (url: string) => void; onPick: () => void; onClear: () => void }) {
  const { t } = useI18n();
  const preview = asset?.uri || resolveMediaURL(url);
  return <AdminCard>
    <Text style={styles.label}>{label}</Text>
    {!!preview && <Image source={preview} style={portrait ? styles.posterPreview : styles.backdropPreview} contentFit={portrait ? 'contain' : 'cover'} />}
    {asset
      ? <Text style={styles.picked}>{t('New image: {name}', { name: asset.name })}</Text>
      : <AdminField label={t('Image URL')} value={url} onChangeText={onURL} autoCapitalize="none" keyboardType="url" />}
    <AdminButtons>
      <AdminButton compact icon="image-outline" label={t('Pick image')} onPress={onPick} />
      {!!asset && <AdminButton compact label={t('Keep current image')} onPress={onClear} />}
    </AdminButtons>
  </AdminCard>;
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  resultPoster: { width: 64, aspectRatio: 2 / 3, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  resultMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  resultSynopsis: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  posterPreview: { width: '50%', aspectRatio: 2 / 3, alignSelf: 'center', borderRadius: radii.md, backgroundColor: colors.black },
  backdropPreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: colors.black },
  picked: { color: colors.text, fontSize: 12, marginTop: 10 },
});
