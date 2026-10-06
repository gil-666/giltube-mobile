import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { episodeDetailsFrom, invalidateSeries, seriesAPI, seriesKeys, type AdminEpisode, type EpisodeDetails } from '@/admin/series/api';
import { IntroPlayer } from '@/admin/series/IntroPlayer';
import { SecondsField } from '@/admin/series/SecondsField';
import { TrackManager } from '@/admin/TrackManager';
import { AdminButton, AdminButtons, AdminCard, AdminError, AdminField, AdminLoading, AdminNotice, AdminNumberField, AdminScreen, AdminSection, AdminToggle, adminStyles, alertError, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import { openVideo } from '@/player/navigation';

export default function AdminSeriesEpisodeScreen() {
  const { episodeId = '', seriesId = '' } = useLocalSearchParams<{ episodeId: string; seriesId: string }>();
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const detail = useQuery({ queryKey: seriesKeys.detail(seriesId), queryFn: () => seriesAPI.detail(seriesId), enabled: isAdmin && !!seriesId });
  const episode = detail.data?.episodes?.find((item) => item.id === episodeId);

  return <AdminScreen
    title={episode ? `S${episode.season_number} E${episode.episode_number}` : t('Episode')}
    subtitle={detail.data?.series.title}
    refreshing={detail.isRefetching}
    onRefresh={() => void detail.refetch()}
  >
    {detail.isLoading ? <AdminLoading />
      : !episode ? <AdminError error={detail.error || t('Episode not found.')} />
        : <EpisodeEditor key={episode.id} episode={episode} />}
  </AdminScreen>;
}

function EpisodeEditor({ episode }: { episode: AdminEpisode }) {
  const styles = useStyles();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EpisodeDetails>(() => episodeDetailsFrom(episode));
  const [flags, setFlags] = useState({ explicit: !!episode.video?.explicit, contentWarning: !!episode.content_warning });
  const [saving, setSaving] = useState(false);
  const [savingFlags, setSavingFlags] = useState(false);
  const [pickingIntro, setPickingIntro] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const set = <K extends keyof EpisodeDetails>(key: K, value: EpisodeDetails[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const video = episode.video;
  const processing = !!video?.status && video.status !== 'ready';

  const save = async () => {
    if (draft.introEndSeconds > 0 && draft.introEndSeconds <= draft.introStartSeconds) { setError(new Error(t('Intro end must be after intro start.'))); return; }
    setSaving(true); setError(null); setMessage('');
    try {
      await seriesAPI.updateEpisode(episode.id, { ...draft, seasonNumber: Math.max(1, draft.seasonNumber), episodeNumber: Math.max(1, draft.episodeNumber) });
      await invalidateSeries(queryClient);
      setMessage(t('Saved S{season} E{episode}.', { season: draft.seasonNumber, episode: draft.episodeNumber }));
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  // Saved right away, like the web: flags are not part of the draft.
  const setFlag = async (patch: { explicit?: boolean; contentWarning?: boolean }) => {
    const previous = flags;
    setFlags({ ...flags, ...patch });
    setSavingFlags(true);
    try {
      await seriesAPI.updateEpisode(episode.id, draft, patch);
      await invalidateSeries(queryClient);
    } catch (err) {
      setFlags(previous);
      alertError(t)(err);
    } finally {
      setSavingFlags(false);
    }
  };

  return <>
    {!!video?.thumbnail_url && <Image source={resolveMediaURL(video.thumbnail_url)} style={styles.thumb} contentFit="cover" />}
    {processing && <AdminNotice tone="warn" text={t('Still processing — details you save now will show when it goes live')} />}

    <AdminSection title={t('Details')}>
      <View style={styles.pair}>
        <View style={styles.half}><AdminNumberField label={t('Season')} value={draft.seasonNumber} onChange={(value) => set('seasonNumber', value)} /></View>
        <View style={styles.half}><AdminNumberField label={t('Episode')} value={draft.episodeNumber} onChange={(value) => set('episodeNumber', value)} /></View>
      </View>
      <AdminField label={t('Episode title')} value={draft.title} onChangeText={(text) => set('title', text)} />
      <AdminField label={t('Episode synopsis')} value={draft.synopsis} onChangeText={(text) => set('synopsis', text)} multiline />
    </AdminSection>

    <AdminSection title={t('Intro')}>
      <View style={styles.pair}>
        <View style={styles.half}><SecondsField label={t('Intro start (seconds)')} value={draft.introStartSeconds} onChange={(value) => set('introStartSeconds', value)} /></View>
        <View style={styles.half}><SecondsField label={t('Intro end (seconds)')} value={draft.introEndSeconds} onChange={(value) => set('introEndSeconds', value)} /></View>
      </View>
      {pickingIntro && !!video?.hls_path
        ? <AdminCard style={styles.topGap}><IntroPlayer hlsPath={video.hls_path} start={draft.introStartSeconds} end={draft.introEndSeconds} onChange={(start, end) => setDraft((current) => ({ ...current, introStartSeconds: start, introEndSeconds: end }))} /></AdminCard>
        : null}
      <AdminButtons>
        <AdminButton icon={pickingIntro ? 'close' : 'film-outline'} label={pickingIntro ? t('Close player') : t('Pick intro')} disabled={!video?.hls_path || processing} onPress={() => setPickingIntro(!pickingIntro)} />
      </AdminButtons>
    </AdminSection>

    <AdminError error={error} />
    {!!message && <AdminNotice tone="good" text={message} />}
    <AdminButtons>
      <AdminButton variant="primary" icon="save-outline" label={t('Save')} busy={saving} onPress={() => void save()} />
      {!!episode.video_id && <AdminButton icon="play-outline" label={t('Open episode')} disabled={processing} onPress={() => openVideo(episode.video_id)} />}
    </AdminButtons>

    <AdminSection title={t('Content rating')}>
      <AdminToggle label={t('18+ explicit')} value={flags.explicit} disabled={savingFlags} onChange={(explicit) => void setFlag({ explicit })} />
      <AdminToggle label={t('Disturbing content warning')} help={t('Shown for 5 seconds before the rating card when this episode starts.')} value={flags.contentWarning} disabled={savingFlags} onChange={(contentWarning) => void setFlag({ contentWarning })} />
    </AdminSection>

    <AdminSection title={t('IDs')}>
      <Text style={adminStyles.muted}>{t('Episode ID')}</Text>
      <Text selectable style={adminStyles.mono}>{episode.id}</Text>
      <Text style={[adminStyles.muted, styles.topGap]}>{t('Video ID')}</Text>
      <Text selectable style={adminStyles.mono}>{episode.video_id}</Text>
      {!!video?.original_filename && <Text style={[adminStyles.muted, styles.topGap]}>{t('Original file: {filename}', { filename: video.original_filename })}</Text>}
    </AdminSection>

    <TrackManager basePath={`/admin/series/episodes/${episode.id}`} title={t('Subtitles & audio')} />
  </>;
}

const useStyles = makeStyles(() => ({
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, marginTop: 12 },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  topGap: { marginTop: 12 },
}));
