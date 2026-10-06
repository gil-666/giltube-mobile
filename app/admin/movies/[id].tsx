import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { ContentRatingEditor, contentRatingInputFrom, emptyContentRatingInput, type ContentRatingInput } from '@/admin/ContentRatingEditor';
import { TrackManager } from '@/admin/TrackManager';
import { applyMetadata, emptyMovieForm, invalidateMovies, movieFormFrom, moviesAPI, saveMovie, type MetadataResult, type MovieFormState } from '@/admin/movies/api';
import { ImageField } from '@/admin/movies/ImageField';
import { MetadataSearch } from '@/admin/movies/MetadataSearch';
import { MovieMediaLinks } from '@/admin/movies/MovieMediaLinks';
import { AdminButton, AdminButtons, AdminCard, AdminError, AdminField, AdminLoading, AdminNotice, AdminNumberField, AdminScreen, AdminSection, AdminToggle, adminStyles, alertError, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import type { Movie } from '@/types/api';

export default function AdminMovieEditScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || 'new');
  const isNew = id === 'new';
  const detailKey = ['admin', 'movies', 'detail', id];
  const detail = useQuery({ queryKey: detailKey, queryFn: () => moviesAPI.get(id), enabled: isAdmin && !isNew });
  const movie = detail.data?.movie ?? null;

  const [form, setForm] = useState<MovieFormState>(emptyMovieForm);
  const [rating, setRating] = useState<ContentRatingInput>(emptyContentRatingInput);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);

  // Seed the form from the server copy whenever a fresh one arrives (initial load, after saves).
  const [seeded, setSeeded] = useState<Movie | null>(null);
  if (movie && movie !== seeded) {
    setSeeded(movie);
    setForm(movieFormFrom(movie));
    setRating(contentRatingInputFrom(movie));
  }

  const update = (patch: Partial<MovieFormState>) => setForm((current) => ({ ...current, ...patch }));
  const trackBase = movie ? `/admin/movies/${movie.id}` : '';

  const refreshAll = async () => {
    invalidateMovies(queryClient);
    if (trackBase) void queryClient.invalidateQueries({ queryKey: ['admin', 'tracks', trackBase] });
    if (!isNew) await detail.refetch();
  };

  const applyResult = (result: MetadataResult) => {
    setForm((current) => applyMetadata(current, result));
    if (result.source === 'tmdb' && Number(result.source_id) > 0) setRating((current) => ({ ...current, tmdbId: Number(result.source_id) }));
    setMessage(t('Applied metadata from "{title}". Save to keep it.', { title: result.title }));
  };

  const save = async () => {
    setError(null);
    setMessage('');
    if (!form.title.trim()) {
      setError(new Error(t('A title is required.')));
      return;
    }
    setSaving(true);
    try {
      const result = await saveMovie(isNew ? null : movie?.id || id, form, rating, { channelID: movie?.channel_id, videoID: movie?.video_id });
      setRating((current) => ({ ...current, dirty: false }));
      invalidateMovies(queryClient);
      if (isNew) {
        router.replace({ pathname: '/admin/movies/[id]', params: { id: result.id } });
        return;
      }
      setForm((current) => ({ ...current, poster: null, backdrop: null }));
      await detail.refetch();
      setMessage(t('Movie saved.'));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  // Linking re-saves the server copy with video_id so the backend also hides
  // the video from feeds (same as the web panel); unsaved form edits stay local.
  const attachMovie = async (videoID: string) => {
    if (!movie) return;
    await moviesAPI.setVideo(movie.id, videoID);
    await saveMovie(movie.id, movieFormFrom(movie), { ...contentRatingInputFrom(movie), dirty: false }, { channelID: movie.channel_id, videoID, includeImages: false });
    await refreshAll();
    setMessage(t('Movie video linked.'));
  };

  const attachTrailer = async (videoID: string) => {
    if (!movie) return;
    await moviesAPI.setTrailer(movie.id, videoID);
    await refreshAll();
    setMessage(t('Trailer linked.'));
  };

  const runDelete = async (deleteVideos: boolean) => {
    if (!movie) return;
    setDeleting(true);
    try {
      await moviesAPI.remove(movie.id, deleteVideos);
      invalidateMovies(queryClient);
      queryClient.removeQueries({ queryKey: detailKey });
      if (router.canGoBack()) router.back();
      else router.replace('/admin/movies');
    } catch (deleteError) {
      alertError(t)(deleteError);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!movie) return;
    const title = movie.title || movie.id;
    const hasVideos = !!(movie.video_id || movie.trailer_video_id);
    Alert.alert(t('Delete movie?'), t('Delete "{title}"? This cannot be undone.', { title }), hasVideos ? [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Keep linked videos'), onPress: () => void runDelete(false) },
      { text: t('Delete videos too'), style: 'destructive', onPress: () => void runDelete(true) },
    ] : [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => void runDelete(false) },
    ]);
  };

  const title = isNew ? t('New movie') : movie?.title || t('Movie');
  if (!isNew && detail.isLoading) return <AdminScreen title={title}><AdminLoading /></AdminScreen>;
  if (!isNew && detail.error && !movie) return <AdminScreen title={title} onRefresh={() => void detail.refetch()} refreshing={detail.isRefetching}><AdminError error={detail.error} /></AdminScreen>;

  return <AdminScreen
    title={title}
    subtitle={isNew ? t('Create a movie, then link its video and trailer.') : movie?.slug}
    refreshing={detail.isRefetching}
    onRefresh={isNew ? undefined : () => void refreshAll()}
  >
    {!!message && <AdminNotice tone="good" text={message} />}
    <AdminError error={error} />

    <AdminSection title={t('Metadata')}>
      <MetadataSearch initialQuery={form.title} onApply={applyResult} />
    </AdminSection>

    <AdminSection title={t('Details')}>
      <AdminCard>
        <AdminField label={t('Title')} value={form.title} onChangeText={(value) => update({ title: value })} />
        <AdminField label={t('Slug')} value={form.slug} onChangeText={(value) => update({ slug: value })} placeholder={t('Generated from the title if empty')} autoCapitalize="none" />
        <AdminField label={t('Primary genre')} value={form.genre} onChangeText={(value) => update({ genre: value })} />
        <AdminNumberField label={t('Release year')} value={form.releaseYear} onChange={(value) => update({ releaseYear: Math.max(0, value) })} />
        <AdminField label={t('Synopsis')} value={form.synopsis} onChangeText={(value) => update({ synopsis: value })} multiline />
        <AdminField label={t('Genres')} value={form.genres} onChangeText={(value) => update({ genres: value })} placeholder={t('Action, Drama, Thriller')} help={t('Comma separated.')} />
        <AdminField label={t('Directors')} value={form.directors} onChangeText={(value) => update({ directors: value })} help={t('Comma separated.')} autoCapitalize="words" />
        <AdminField label={t('Cast')} value={form.cast} onChangeText={(value) => update({ cast: value })} help={t('Comma separated.')} autoCapitalize="words" />
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Artwork')}>
      <AdminCard>
        <ImageField label={t('Poster')} url={form.posterURL} asset={form.poster} onURL={(value) => update({ posterURL: value })} onAsset={(value) => update({ poster: value })} aspect={2 / 3} />
        <ImageField label={t('Backdrop')} url={form.backdropURL} asset={form.backdrop} onURL={(value) => update({ backdropURL: value })} onAsset={(value) => update({ backdrop: value })} aspect={16 / 9} />
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Rating & visibility')}>
      <AdminCard>
        <ContentRatingEditor value={rating} onChange={setRating} />
        {rating.tmdbId > 0 && <Text style={adminStyles.muted}>{t('TMDB id: {id}', { id: rating.tmdbId })}</Text>}
        <AdminToggle label={t('Featured on the home banner')} value={form.isFeatured} onChange={(value) => update({ isFeatured: value })} />
        <AdminToggle label={t('18+ explicit')} help={t('Hides this movie from viewers who have not turned on explicit content.')} value={form.explicit} onChange={(value) => update({ explicit: value })} />
        <AdminToggle label={t('Disturbing content warning')} help={t('Shows a warning before playback starts.')} value={form.contentWarning} onChange={(value) => update({ contentWarning: value })} />
      </AdminCard>
    </AdminSection>

    {!!movie && (movie.video_id || movie.trailer_video_id) && <AdminCard style={{ marginTop: 12 }}>
      {!!movie.video_id && <Text style={adminStyles.mono}>{t('Movie video')}: {movie.video_id}</Text>}
      {!!movie.trailer_video_id && <Text style={adminStyles.mono}>{t('Trailer video')}: {movie.trailer_video_id}</Text>}
    </AdminCard>}

    <AdminButtons>
      <AdminButton variant="primary" icon="save-outline" label={isNew ? t('Create movie') : t('Save details')} onPress={() => void save()} busy={saving} disabled={deleting} />
    </AdminButtons>

    {!!movie && <>
      <MovieMediaLinks movie={movie} attachMovie={attachMovie} attachTrailer={attachTrailer} />

      {movie.video_id
        ? <TrackManager basePath={trackBase} title={movie.title} />
        : <AdminSection title={t('Audio & subtitles')}><AdminNotice tone="warn" text={t('Link the movie video first to manage audio tracks and subtitles.')} /></AdminSection>}

      <AdminSection title={t('Danger zone')}>
        <AdminButtons>
          <AdminButton variant="danger" icon="trash-outline" label={t('Delete movie')} onPress={confirmDelete} busy={deleting} disabled={saving} />
        </AdminButtons>
      </AdminSection>
    </>}
  </AdminScreen>;
}
