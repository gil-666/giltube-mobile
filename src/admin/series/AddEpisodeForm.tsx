import { useQueryClient } from '@tanstack/react-query';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useState } from 'react';
import { Text } from 'react-native';

import { invalidateSeries, seriesAPI, uploadSeriesVideo, type AdminEpisode, type AdminSeries, type MetadataEpisode } from './api';
import { SecondsField } from './SecondsField';
import { VideoPicker } from './VideoPicker';
import { AdminButton, AdminButtons, AdminCard, AdminError, AdminField, AdminNotice, AdminNumberField, AdminProgress, adminStyles, formatBytes, pickFile } from '@/admin/ui';
import { useI18n } from '@/i18n';

type Source = { kind: 'file'; asset: DocumentPickerAsset } | { kind: 'video'; id: string; title: string } | null;

function nextSlot(episodes: AdminEpisode[]) {
  const season = episodes.reduce((max, episode) => Math.max(max, episode.season_number || 1), 1);
  const inSeason = episodes.filter((episode) => episode.season_number === season);
  const episode = inSeason.reduce((max, item) => Math.max(max, item.episode_number || 0), 0) + 1;
  return { season, episode };
}

/**
 * Adds one episode: either upload a file (chunked, hidden video on the series
 * channel, like the web) or attach an already uploaded video, then link it.
 */
export function AddEpisodeForm({ series, episodes, metadataEpisodes, onDone }: { series: AdminSeries; episodes: AdminEpisode[]; metadataEpisodes: MetadataEpisode[]; onDone: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const metadataFor = (season: number, episode: number) => metadataEpisodes.find((item) => (item.season_number || 1) === season && (item.episode_number || 1) === episode);
  const [slot] = useState(() => nextSlot(episodes));
  const [season, setSeason] = useState(slot.season);
  const [number, setNumber] = useState(slot.episode);
  const [title, setTitle] = useState(() => metadataFor(slot.season, slot.episode)?.title || '');
  const [synopsis, setSynopsis] = useState(() => metadataFor(slot.season, slot.episode)?.synopsis || '');
  const [introStart, setIntroStart] = useState(0);
  const [introEnd, setIntroEnd] = useState(0);
  const [source, setSource] = useState<Source>(null);
  // Kept after a successful upload so a failed attach can retry without re-uploading.
  const [uploadedVideoID, setUploadedVideoID] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const changeSlot = (nextSeason: number, nextNumber: number) => {
    const previous = metadataFor(season, number);
    const next = metadataFor(nextSeason, nextNumber);
    setSeason(nextSeason);
    setNumber(nextNumber);
    // Follow TMDB titles while the admin hasn't typed their own.
    if (next && (!title || title === previous?.title)) setTitle(next.title);
    if (next && (!synopsis || synopsis === previous?.synopsis)) setSynopsis(next.synopsis);
  };

  const pickVideoFile = async () => {
    const asset = await pickFile('video/*');
    if (!asset) return;
    setSource({ kind: 'file', asset });
    setUploadedVideoID('');
    if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ''));
  };

  const attach = async () => {
    if (!source) return;
    setError(null); setMessage(''); setAttaching(true);
    const details = { seasonNumber: Math.max(1, season), episodeNumber: Math.max(1, number), title: title.trim(), synopsis, introStartSeconds: introStart, introEndSeconds: introEnd };
    try {
      let videoID = source.kind === 'video' ? source.id : uploadedVideoID;
      if (!videoID && source.kind === 'file') {
        setProgress(0);
        videoID = await uploadSeriesVideo(source.asset, { title: details.title || `${series.title} S${details.seasonNumber} E${details.episodeNumber}`, description: synopsis, hidden: true }, setProgress);
        setUploadedVideoID(videoID);
      }
      await seriesAPI.addEpisode(series.id, videoID, details);
      await invalidateSeries(queryClient);
      setMessage(t('Attached S{season} E{episode}.', { season: details.seasonNumber, episode: details.episodeNumber }));
      // Ready for the next episode in the same season.
      const following = metadataFor(details.seasonNumber, details.episodeNumber + 1);
      setNumber(details.episodeNumber + 1);
      setTitle(following?.title || '');
      setSynopsis(following?.synopsis || '');
      setIntroStart(0); setIntroEnd(0);
      setSource(null); setUploadedVideoID('');
    } catch (err) {
      setError(err);
    } finally {
      setProgress(null);
      setAttaching(false);
    }
  };

  const busy = attaching || progress !== null;
  return <AdminCard>
    <Text style={adminStyles.muted}>{t('Episode videos are hidden from the main feeds after upload.')}</Text>
    <AdminNumberField label={t('Season')} value={season} onChange={(value) => changeSlot(value, number)} />
    <AdminNumberField label={t('Episode')} value={number} onChange={(value) => changeSlot(season, value)} />
    <AdminField label={t('Episode title')} value={title} onChangeText={setTitle} />
    <AdminField label={t('Episode synopsis')} value={synopsis} onChangeText={setSynopsis} multiline />
    <SecondsField label={t('Intro start (seconds)')} value={introStart} onChange={setIntroStart} />
    <SecondsField label={t('Intro end (seconds)')} value={introEnd} onChange={setIntroEnd} help={t('You can also pick intro times on the episode screen after it is attached.')} />

    <Text style={[adminStyles.text, { marginTop: 14 }]}>
      {source?.kind === 'file' ? t('File: {name} ({size})', { name: source.asset.name, size: formatBytes(source.asset.size) })
        : source?.kind === 'video' ? t('Existing video: {title}', { title: source.title || source.id })
          : t('Choose a video file to upload or an existing video.')}
    </Text>
    <AdminButtons>
      <AdminButton compact icon="document-outline" label={t('Choose video file')} disabled={busy} onPress={() => void pickVideoFile()} />
      <AdminButton compact icon="albums-outline" label={t('Pick existing video')} disabled={busy} onPress={() => setPickerOpen(true)} />
    </AdminButtons>
    {progress !== null && <AdminProgress value={progress} label={t('Uploading {percent}%', { percent: progress })} />}
    <AdminError error={error} />
    {!!message && <AdminNotice tone="good" text={message} />}
    <AdminButtons>
      <AdminButton variant="primary" icon="add-circle-outline" label={progress !== null ? `${progress}%` : source?.kind === 'file' && !uploadedVideoID ? t('Upload & attach') : t('Attach')} busy={busy} disabled={!source} onPress={() => void attach()} />
      <AdminButton label={t('Close')} disabled={busy} onPress={onDone} />
    </AdminButtons>
    <VideoPicker visible={pickerOpen} title={t('Pick episode video')} subtitle={t('Choose an already uploaded video to attach as this episode.')} actionLabel={t('Attach')} onClose={() => setPickerOpen(false)} onPick={(video) => { setPickerOpen(false); setSource({ kind: 'video', id: video.id, title: video.title }); if (!title && video.title !== video.id) setTitle(video.title); }} />
  </AdminCard>;
}
