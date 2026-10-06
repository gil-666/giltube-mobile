import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text } from 'react-native';

import { invalidateSeries, seriesAPI, uploadSeriesVideo, type AdminSeries } from './api';
import { VideoPicker } from './VideoPicker';
import { AdminButton, AdminButtons, AdminCard, AdminError, AdminField, AdminNotice, AdminProgress, AdminSection, adminStyles, pickFile } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { openVideo } from '@/player/navigation';

export function TrailerSection({ series }: { series: AdminSeries }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(`${series.title} Trailer`);
  const [progress, setProgress] = useState<number | null>(null);
  const [linking, setLinking] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const upload = async () => {
    const asset = await pickFile('video/*');
    if (!asset) return;
    setError(null); setMessage(''); setProgress(0);
    try {
      const videoID = await uploadSeriesVideo(asset, { title: title.trim() || `${series.title} Trailer`, description: `Trailer for ${series.title}`, hidden: false }, setProgress);
      await seriesAPI.setTrailer(series.id, videoID);
      await invalidateSeries(queryClient);
      setMessage(t('Trailer uploaded and linked.'));
    } catch (err) {
      setError(err);
    } finally {
      setProgress(null);
    }
  };

  const link = async (videoID: string, videoTitle: string) => {
    setPickerOpen(false);
    setLinking(true); setError(null); setMessage('');
    try {
      await seriesAPI.setTrailer(series.id, videoID);
      await invalidateSeries(queryClient);
      setMessage(t('Linked existing trailer "{title}".', { title: videoTitle || videoID }));
    } catch (err) {
      setError(err);
    } finally {
      setLinking(false);
    }
  };

  const uploading = progress !== null;
  return <AdminSection title={t('Trailer')}>
    <AdminCard>
      <Text style={adminStyles.muted}>{t('This video stays visible in normal GilTube surfaces and links viewers into the series.')}</Text>
      {series.trailer_video_id
        ? <Text style={[adminStyles.mono, { marginTop: 8 }]} selectable>{t('Current trailer: {id}', { id: series.trailer_video_id })}</Text>
        : <AdminNotice tone="warn" text={t('No trailer linked yet.')} />}
      <AdminField label={t('Trailer title')} value={title} onChangeText={setTitle} />
      {uploading && <AdminProgress value={progress} label={t('Uploading {percent}%', { percent: progress })} />}
      <AdminButtons>
        <AdminButton variant="primary" icon="cloud-upload-outline" label={uploading ? `${progress}%` : t('Upload trailer')} busy={uploading} disabled={linking} onPress={() => void upload()} />
        <AdminButton icon="albums-outline" label={t('Pick existing video')} busy={linking} disabled={uploading} onPress={() => setPickerOpen(true)} />
        {!!series.trailer_video_id && <AdminButton icon="play-outline" label={t('Open')} onPress={() => openVideo(series.trailer_video_id!)} />}
      </AdminButtons>
      <AdminError error={error} />
      {!!message && <AdminNotice tone="good" text={message} />}
    </AdminCard>
    <VideoPicker visible={pickerOpen} title={t('Pick trailer video')} subtitle={t('Choose an already uploaded video and link it as this series trailer.')} actionLabel={t('Use as trailer')} onClose={() => setPickerOpen(false)} onPick={(video) => void link(video.id, video.title)} />
  </AdminSection>;
}
