import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { peopleAPI, peopleKeys, type EditableVideo } from '@/admin/people/api';
import { VideoStatusBadge } from '@/admin/people/shared';
import { TrackManager } from '@/admin/TrackManager';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminError, AdminField, AdminLoading, AdminNotice, AdminProgress, AdminScreen, AdminSection, AdminToggle, adminStyles, alertError, confirmAction, formatBytes, pickFile, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import { openVideo } from '@/player/navigation';

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

type Form = { title: string; description: string; explicit: boolean; categoryID: string };
type Thumbnail = { mode: 'current' } | { mode: 'auto' } | { mode: 'new'; uri: string; name: string; size: number };

const formFromVideo = (video: EditableVideo): Form => ({
  title: video.title || '',
  description: video.description || '',
  explicit: video.explicit === true,
  categoryID: video.categories?.[0]?.id || '',
});

export default function AdminVideoEditorScreen() {
  const styles = useStyles();
  const { t, compactNumber, dateTime } = useI18n();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const videoID = String(params.id ?? '');

  // staleTime keeps background refetches from overwriting unsaved edits.
  const video = useQuery({ queryKey: peopleKeys.video(videoID), queryFn: () => peopleAPI.video(videoID), enabled: isAdmin && !!videoID, staleTime: Infinity });
  const categories = useQuery({ queryKey: peopleKeys.categories, queryFn: peopleAPI.categories, enabled: isAdmin, staleTime: 5 * 60_000 });

  const [form, setForm] = useState<Form | null>(null);
  const [thumbnail, setThumbnail] = useState<Thumbnail>({ mode: 'current' });
  const [loadedFrom, setLoadedFrom] = useState<EditableVideo | undefined>();
  const [saved, setSaved] = useState(false);
  // Reset the form whenever a fresh copy of the video arrives (first load, after save, pull to refresh).
  if (video.data && video.data !== loadedFrom) {
    setLoadedFrom(video.data);
    setForm(formFromVideo(video.data));
    setThumbnail({ mode: 'current' });
  }

  const update = (patch: Partial<Form>) => { setSaved(false); setForm((current) => current ? { ...current, ...patch } : current); };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (!form.title.trim()) throw new Error(t('A title is required.'));
      await peopleAPI.updateVideo(videoID, {
        title: form.title.trim(),
        description: form.description,
        explicit: form.explicit,
        categoryID: form.categoryID,
        revertThumbnail: thumbnail.mode === 'auto',
        thumbnailURI: thumbnail.mode === 'new' ? thumbnail.uri : undefined,
      });
    },
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
    },
  });

  const verify = useMutation({
    mutationFn: () => peopleAPI.verifyVideo(videoID),
    onSuccess: () => Alert.alert(t('Video verified'), t('The video is now marked as verified.')),
    onError: alertError(t),
  });

  const remove = useMutation({
    mutationFn: () => peopleAPI.deleteVideo(videoID),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: peopleKeys.video(videoID) });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
      if (router.canGoBack()) router.back();
      else router.replace('/admin/videos');
    },
  });

  const chooseThumbnail = async () => {
    const asset = await pickFile('image/*');
    if (!asset) return;
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert(t('Choose an image'), t('The thumbnail must be an image file.'));
      return;
    }
    if ((asset.size ?? 0) > MAX_THUMBNAIL_BYTES) {
      Alert.alert(t('Image too large'), t('Thumbnails can be up to {size}.', { size: formatBytes(MAX_THUMBNAIL_BYTES) }));
      return;
    }
    setSaved(false);
    setThumbnail({ mode: 'new', uri: asset.uri, name: asset.name, size: asset.size ?? 0 });
  };

  const confirmDelete = () => confirmAction(t, t('Delete video'),
    t('Delete "{title}"? Its files, comments and tracks are removed permanently.', { title: video.data?.title || videoID }),
    () => remove.mutateAsync());

  const data = video.data;
  const currentThumbnail = data && thumbnail.mode === 'current' ? resolveMediaURL(data.thumbnail_url) : '';
  const previewURI = thumbnail.mode === 'new' ? thumbnail.uri : currentThumbnail;
  const categoryOptions = [{ value: '', label: t('No category') }, ...(categories.data ?? []).map((category) => ({ value: category.id, label: category.name }))];

  return <AdminScreen title={t('Edit video')} subtitle={data?.channel?.name} refreshing={video.isRefetching} onRefresh={() => { void video.refetch(); void categories.refetch(); }}>
    <AdminError error={video.error} />
    {video.isLoading || !form || !data ? (!video.error && <AdminLoading />) : <>
      <AdminCard style={styles.summary}>
        <View style={adminStyles.inlineRow}>
          <VideoStatusBadge status={data.status} />
          {data.explicit && <AdminBadge label={t('18+')} tone="warn" />}
          {data.has_custom_thumbnail && <AdminBadge label={t('Custom thumbnail')} tone="info" />}
        </View>
        {data.status === 'processing' && <AdminProgress value={data.progress} label={t('Processing {percent}%', { percent: data.progress })} />}
        <Text style={[adminStyles.text, styles.spaced]}>{t('{views} views · {likes} likes', { views: compactNumber(data.views), likes: compactNumber(data.likes) })}</Text>
        {!!data.created_at && <Text style={adminStyles.muted}>{t('Uploaded {date}', { date: dateTime(data.created_at) })}</Text>}
        <Text selectable style={[adminStyles.mono, styles.spaced]}>{data.id}</Text>
        <AdminButtons>
          <AdminButton compact icon="play-outline" label={t('Watch')} onPress={() => openVideo(data.id)} />
          {!!data.channel_id && <AdminButton compact icon="tv-outline" label={t('Channel')} onPress={() => router.push({ pathname: '/admin/channels/[id]', params: { id: data.channel_id, name: data.channel?.name ?? '' } })} />}
          <AdminButton compact icon="checkmark-done-outline" label={t('Verify')} busy={verify.isPending} onPress={() => verify.mutate()} />
        </AdminButtons>
      </AdminCard>

      <AdminSection title={t('Details')}>
        <AdminField label={t('Title')} value={form.title} onChangeText={(title) => update({ title })} placeholder={t('Video title')} />
        <AdminField label={t('Description')} value={form.description} onChangeText={(description) => update({ description })} placeholder={t('Tell viewers about this video')} multiline help={t('An empty description keeps the current one.')} />
        <AdminToggle label={t('Explicit content (18+)')} help={t('Viewers see a content warning before playback.')} value={form.explicit} onChange={(explicit) => update({ explicit })} />
        <AdminChips label={t('Category')} options={categoryOptions} value={form.categoryID} onChange={(categoryID) => update({ categoryID })} />
        <AdminError error={categories.error} />
      </AdminSection>

      <AdminSection title={t('Thumbnail')}>
        <View style={[styles.preview, thumbnail.mode === 'new' && styles.previewNew]}>
          {previewURI ? <Image source={{ uri: previewURI }} style={styles.previewImage} contentFit="cover" /> : <Text style={adminStyles.muted}>{thumbnail.mode === 'auto' ? t('An automatic thumbnail is generated when you save.') : t('No thumbnail')}</Text>}
        </View>
        <Text style={[adminStyles.muted, styles.spaced]}>{thumbnail.mode === 'new'
          ? t('New thumbnail: {name} ({size})', { name: thumbnail.name, size: formatBytes(thumbnail.size) })
          : thumbnail.mode === 'auto' ? t('Reverting to the automatic thumbnail.')
            : data.has_custom_thumbnail ? t('Custom thumbnail') : t('Automatic thumbnail')}</Text>
        <AdminButtons>
          <AdminButton compact icon="image-outline" label={thumbnail.mode === 'new' ? t('Choose another') : t('Upload thumbnail')} onPress={() => void chooseThumbnail().catch(alertError(t))} />
          {thumbnail.mode === 'new' && <AdminButton compact icon="close" label={t('Remove new thumbnail')} onPress={() => setThumbnail({ mode: 'current' })} />}
          {thumbnail.mode === 'current' && data.has_custom_thumbnail && <AdminButton compact icon="refresh" label={t('Revert to automatic')} onPress={() => { setSaved(false); setThumbnail({ mode: 'auto' }); }} />}
          {thumbnail.mode === 'auto' && <AdminButton compact icon="arrow-undo" label={t('Keep custom thumbnail')} onPress={() => setThumbnail({ mode: 'current' })} />}
        </AdminButtons>
        <Text style={[adminStyles.muted, styles.spaced]}>{t('JPG, PNG or WebP, up to {size}. 16:9 works best.', { size: formatBytes(MAX_THUMBNAIL_BYTES) })}</Text>
      </AdminSection>

      <AdminError error={save.error} />
      {saved && !save.isPending && <AdminNotice tone="good" text={t('Changes saved.')} />}
      <AdminButtons>
        <AdminButton variant="primary" icon="save-outline" label={t('Save changes')} busy={save.isPending} disabled={!form.title.trim()} onPress={() => save.mutate()} />
      </AdminButtons>

      <View style={styles.tracks}>
        <TrackManager basePath={`/videos/${videoID}`} title={form.title} />
      </View>

      <AdminSection title={t('Danger zone')}>
        <AdminButtons>
          <AdminButton variant="danger" icon="trash-outline" label={t('Delete video')} busy={remove.isPending} onPress={confirmDelete} />
        </AdminButtons>
      </AdminSection>
    </>}
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  summary: { marginTop: 14 },
  spaced: { marginTop: 8 },
  preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center', padding: 12 },
  previewNew: { borderWidth: 2, borderColor: colors.accentBright },
  previewImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  tracks: { marginTop: 8 },
}));
