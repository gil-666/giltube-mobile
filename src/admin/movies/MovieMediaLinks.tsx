import { useQuery } from '@tanstack/react-query';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { MOVIES_CHANNEL_ID, moviesAPI, type AdminVideo } from './api';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField, AdminLoading, AdminProgress, AdminRow, AdminSection, adminStyles, alertError, formatBytes, pickFile } from '@/admin/ui';
import { giltubeAPI } from '@/api/giltube';
import { uploadVideo } from '@/api/upload';
import { useI18n } from '@/i18n';
import type { Movie } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

type Kind = 'movie' | 'trailer';

/** Upload a new video file (chunked, like the web) and link it as the movie or its trailer. */
function UploadCard({ kind, movie, defaultTitle, categoryID, onUploaded }: { kind: Kind; movie: Movie; defaultTitle: string; categoryID?: string; onUploaded: (videoID: string) => Promise<void> }) {
  const { t } = useI18n();
  const [asset, setAsset] = useState<DocumentPickerAsset | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [progress, setProgress] = useState<number | null>(null);
  const [linking, setLinking] = useState(false);
  const busy = progress !== null || linking;
  const linked = kind === 'movie' ? movie.video_id : movie.trailer_video_id;

  const choose = async () => {
    try {
      const picked = await pickFile('video/*');
      if (picked) setAsset(picked);
    } catch (error) {
      alertError(t)(error);
    }
  };

  const upload = async () => {
    if (!asset) return;
    setProgress(0);
    try {
      const result = await uploadVideo({
        video: asset,
        title: title.trim() || defaultTitle,
        description: kind === 'movie' ? movie.synopsis || '' : t('Official trailer for {title}.', { title: movie.title }),
        channelID: movie.channel_id || MOVIES_CHANNEL_ID,
        categoryID: kind === 'trailer' ? categoryID : undefined,
        explicit: false,
        // The full movie stays out of feeds; trailers are public like on the web.
        hidden: kind === 'movie',
        onProgress: setProgress,
      }) as { video_id?: string } | null;
      if (!result?.video_id) throw new Error(t('The upload finished but no video id came back.'));
      setProgress(null);
      setLinking(true);
      await onUploaded(result.video_id);
      setAsset(null);
    } catch (error) {
      alertError(t, 'Upload failed')(error);
    } finally {
      setProgress(null);
      setLinking(false);
    }
  };

  return <AdminCard>
    <Text style={adminStyles.text}>{kind === 'movie' ? t('Movie file') : t('Trailer')}</Text>
    <Text style={adminStyles.muted}>{linked ? t('Linked video: {id}', { id: linked }) : t('Nothing linked yet.')}</Text>
    <AdminField label={kind === 'movie' ? t('Video title') : t('Trailer title')} value={title} onChangeText={setTitle} editable={!busy} />
    <AdminButtons>
      <AdminButton icon="film-outline" label={asset ? t('Change file') : t('Choose video file')} onPress={() => void choose()} disabled={busy} />
    </AdminButtons>
    {!!asset && <Text style={adminStyles.muted}>{asset.name}{asset.size ? ` · ${formatBytes(asset.size)}` : ''}</Text>}
    {progress !== null && <AdminProgress value={progress} label={t('Uploading {percent}%', { percent: Math.round(progress) })} />}
    <AdminButtons>
      <AdminButton
        variant="primary"
        icon="cloud-upload-outline"
        label={kind === 'movie' ? (linked ? t('Upload and replace movie') : t('Upload movie')) : (linked ? t('Upload and replace trailer') : t('Upload trailer'))}
        onPress={() => void upload()}
        disabled={!asset}
        busy={busy}
      />
    </AdminButtons>
    {kind === 'movie' && <Text style={adminStyles.muted}>{t('Large files upload in 8 MB parts. Keep the app open until it finishes; the video then transcodes on the server.')}</Text>}
  </AdminCard>;
}

/** Link the movie video and trailer from new uploads or from videos already on GilTube. */
export function MovieMediaLinks({ movie, attachMovie, attachTrailer }: { movie: Movie; attachMovie: (videoID: string) => Promise<void>; attachTrailer: (videoID: string) => Promise<void> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const categories = useQuery({ queryKey: ['categories'], queryFn: giltubeAPI.categories });
  const moviesCategoryID = categories.data?.find((category) => category.slug === 'movies')?.id;
  const videos = useQuery({ queryKey: ['admin', 'movies', 'videos', query], queryFn: () => moviesAPI.videos(query), enabled: browsing });

  const link = async (kind: Kind, video: AdminVideo) => {
    setPending(`${kind}-${video.id}`);
    try {
      await (kind === 'movie' ? attachMovie(video.id) : attachTrailer(video.id));
    } catch (error) {
      alertError(t)(error);
    } finally {
      setPending(null);
    }
  };

  return <>
    <AdminSection title={t('Movie video')}>
      <UploadCard kind="movie" movie={movie} defaultTitle={movie.video?.title || movie.title} onUploaded={attachMovie} />
    </AdminSection>
    <AdminSection title={t('Trailer')}>
      <UploadCard kind="trailer" movie={movie} defaultTitle={`${movie.title} ${t('Trailer')}`} categoryID={moviesCategoryID} onUploaded={attachTrailer} />
    </AdminSection>
    <AdminSection title={t('Existing videos')} right={browsing ? <AdminButton compact icon="refresh" label={t('Refresh')} onPress={() => void videos.refetch()} /> : undefined}>
      {!browsing ? <AdminCard>
        <Text style={adminStyles.muted}>{t('Link a video that is already on GilTube as the movie or its trailer.')}</Text>
        <AdminButtons><AdminButton icon="library-outline" label={t('Browse videos')} onPress={() => setBrowsing(true)} /></AdminButtons>
      </AdminCard> : <>
        <AdminField label={t('Search videos')} value={draft} onChangeText={setDraft} placeholder={t('Title, channel, owner or id')} autoCapitalize="none" />
        <AdminButtons><AdminButton icon="search" label={t('Search')} onPress={() => setQuery(draft)} /></AdminButtons>
        {videos.isLoading ? <AdminLoading /> : videos.error ? <AdminError error={videos.error} /> : !(videos.data || []).length ? <AdminEmpty text={t('No videos found.')} /> : (videos.data || []).map((video) => {
          const isMovie = movie.video_id === video.id;
          const isTrailer = movie.trailer_video_id === video.id;
          return <View key={video.id}>
            <AdminRow
              title={video.title || video.id}
              subtitle={[video.channel_name || t('Unknown channel'), video.owner_username ? `@${video.owner_username}` : '', video.created_at ? new Date(video.created_at).toLocaleDateString() : ''].filter(Boolean).join(' · ')}
              imageSlot={video.thumbnail_url ? <Image source={{ uri: resolveMediaURL(video.thumbnail_url) }} style={adminStyles.thumb} contentFit="cover" /> : <View style={adminStyles.thumb} />}
              badges={<>
                <AdminBadge label={video.hidden ? t('Hidden') : t('Public')} tone={video.hidden ? 'neutral' : 'good'} />
                {!!video.status && video.status !== 'ready' && <AdminBadge label={video.status} tone="warn" />}
                {isMovie && <AdminBadge label={t('Movie')} tone="info" />}
                {isTrailer && <AdminBadge label={t('Trailer')} tone="info" />}
              </>}
              right={<View />}
            />
            <AdminButtons>
              <AdminButton compact icon="videocam-outline" label={isMovie ? t('Movie linked') : t('Use as movie')} disabled={isMovie || pending !== null} busy={pending === `movie-${video.id}`} onPress={() => void link('movie', video)} />
              <AdminButton compact icon="play-circle-outline" label={isTrailer ? t('Trailer linked') : t('Use as trailer')} disabled={isTrailer || pending !== null} busy={pending === `trailer-${video.id}`} onPress={() => void link('trailer', video)} />
            </AdminButtons>
          </View>;
        })}
      </>}
    </AdminSection>
  </>;
}
