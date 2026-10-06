import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AddEpisodeForm } from './AddEpisodeForm';
import { episodeDetailsFrom, invalidateSeries, seriesAPI, seriesKeys, sortEpisodes, type AdminEpisode, type AdminSeries, type MetadataEpisode } from './api';
import { APIError } from '@/api/client';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField, AdminNotice, AdminRow, AdminSection, confirmAction, useAdminStyles } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

type Slot = { id: string; seasonNumber: number; episodeNumber: number };

export function EpisodesSection({ series, episodes: rawEpisodes, metadataEpisodes }: { series: AdminSeries; episodes: AdminEpisode[]; metadataEpisodes: MetadataEpisode[] }) {
  const styles = useStyles();
  const adminStyles = useAdminStyles();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const episodes = useMemo(() => sortEpisodes(rawEpisodes), [rawEpisodes]);
  const [adding, setAdding] = useState(episodes.length === 0);
  const [order, setOrder] = useState<Slot[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [applyingMetadata, setApplyingMetadata] = useState(false);
  const [delayText, setDelayText] = useState('0');
  const subtitleDelay = parseInt(delayText, 10) || 0;
  const [savingDelay, setSavingDelay] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  // Intro detection: poll while a run is active (also catches automatic runs).
  const [followDetection, setFollowDetection] = useState(false);
  const detection = useQuery({
    queryKey: seriesKeys.detection(series.id),
    queryFn: () => seriesAPI.detection(series.id),
    refetchInterval: (query) => query.state.data?.state === 'running' ? 3000 : false,
  });
  const detectionState = detection.data?.state;
  const previousState = useRef(detectionState);
  useEffect(() => {
    if (previousState.current === 'running' && detectionState && detectionState !== 'running') void invalidateSeries(queryClient);
    previousState.current = detectionState;
  }, [detectionState, queryClient]);

  const startDetection = async () => {
    setError(null); setMessage('');
    try {
      const status = await seriesAPI.startDetection(series.id);
      queryClient.setQueryData(seriesKeys.detection(series.id), status);
    } catch (err) {
      // 409: already running (e.g. started automatically) — just follow it.
      if (!(err instanceof APIError && err.status === 409)) { setError(err); return; }
    }
    setFollowDetection(true);
    await detection.refetch();
  };

  const detectionNotice = (() => {
    const data = detection.data;
    if (!data) return null;
    if (data.state === 'running') return <AdminNotice tone="info" text={t('Detecting intros… this takes a few seconds per episode the first time.')} />;
    if (!followDetection) return null;
    if (data.state === 'error') return <AdminNotice tone="bad" text={t('Intro detection failed: {error}', { error: data.error || '' })} />;
    if (data.state === 'done') {
      const summary = data.summary || { applied: 0, suggested: 0, unmatched: 0 };
      return <AdminNotice tone="good" text={t('Intro detection finished: {applied} applied, {suggested} sent to Intro suggestions for review, {unmatched} not found.', { applied: summary.applied, suggested: summary.suggested, unmatched: summary.unmatched })} />;
    }
    return null;
  })();

  // TMDB titles for episodes that already exist.
  const metadataMatches = useMemo(() => episodes.flatMap((episode) => {
    const match = metadataEpisodes.find((item) => (item.season_number || 1) === episode.season_number && (item.episode_number || 1) === episode.episode_number);
    if (!match) return [];
    const title = match.title || episode.title;
    const synopsis = match.synopsis || episode.synopsis;
    return title !== episode.title || synopsis !== episode.synopsis ? [{ episode, title, synopsis }] : [];
  }), [episodes, metadataEpisodes]);

  const applyMetadataTitles = async () => {
    setApplyingMetadata(true); setError(null); setMessage('');
    let saved = 0;
    try {
      for (const { episode, title, synopsis } of metadataMatches) {
        await seriesAPI.updateEpisode(episode.id, { ...episodeDetailsFrom(episode), title, synopsis });
        saved += 1;
      }
      setMessage(t('Saved details for {count} episodes.', { count: saved }));
    } catch (err) {
      setError(err);
    } finally {
      await invalidateSeries(queryClient);
      setApplyingMetadata(false);
    }
  };

  const applySubtitleDelay = () => confirmAction(t, t('Apply to all subtitles'), t('Set a {delay} ms delay on every subtitle track of every episode?', { delay: subtitleDelay }), async () => {
    setSavingDelay(true); setError(null); setMessage('');
    let updated = 0;
    try {
      for (const episode of episodes) {
        const data = await seriesAPI.episodeSubtitles(episode.id);
        for (const track of data?.subtitles || []) {
          await seriesAPI.updateSubtitle(episode.id, track, subtitleDelay);
          updated += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tracks'] });
      setMessage(t('Delay saved on {count} subtitle tracks.', { count: updated }));
    } catch (err) {
      setError(err);
    } finally {
      setSavingDelay(false);
    }
  }, 'Apply');

  // Reorder: swap slots with the neighbour, like the web's up/down buttons.
  const startReorder = () => setOrder(episodes.map((episode) => ({ id: episode.id, seasonNumber: episode.season_number, episodeNumber: episode.episode_number })));
  const orderedSlots = useMemo(() => order ? [...order].sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber) : [], [order]);
  const move = (id: string, direction: -1 | 1) => {
    const index = orderedSlots.findIndex((slot) => slot.id === id);
    const target = orderedSlots[index + direction];
    if (index < 0 || !target) return;
    const current = orderedSlots[index];
    setOrder((slots) => (slots || []).map((slot) => slot.id === current.id ? { ...slot, seasonNumber: target.seasonNumber, episodeNumber: target.episodeNumber }
      : slot.id === target.id ? { ...slot, seasonNumber: current.seasonNumber, episodeNumber: current.episodeNumber } : slot));
  };
  const saveOrder = async () => {
    if (!order) return;
    setSavingOrder(true); setError(null); setMessage('');
    try {
      await seriesAPI.reorder(series.id, orderedSlots);
      await invalidateSeries(queryClient);
      setOrder(null);
      setMessage(t('Episode order saved.'));
    } catch (err) {
      setError(err);
    } finally {
      setSavingOrder(false);
    }
  };

  const seasons = useMemo(() => {
    const groups = new Map<number, AdminEpisode[]>();
    for (const episode of episodes) groups.set(episode.season_number, [...(groups.get(episode.season_number) || []), episode]);
    return [...groups.entries()];
  }, [episodes]);
  const byID = useMemo(() => new Map(episodes.map((episode) => [episode.id, episode])), [episodes]);
  const openEpisode = (episode: AdminEpisode) => router.push({ pathname: '/admin/series/episode/[episodeId]', params: { episodeId: episode.id, seriesId: series.id } });

  return <>
    <AdminSection title={t('Episodes')} right={<Text style={adminStyles.muted}>{t('{count} episodes', { count: episodes.length })}</Text>}>
      <AdminButtons>
        <AdminButton variant="primary" icon="add" label={t('Add episode')} disabled={adding} onPress={() => setAdding(true)} />
        <AdminButton icon="scan-outline" label={detectionState === 'running' ? t('Detecting intros…') : t('Detect intros')} busy={detectionState === 'running'} disabled={!episodes.length} onPress={() => void startDetection()} />
        {episodes.length > 1 && !order && <AdminButton icon="swap-vertical" label={t('Episode order')} onPress={startReorder} />}
      </AdminButtons>
      <Text style={[adminStyles.muted, styles.help]}>{t("Finds each episode's intro by matching audio across the season. Timings anchored to an episode you timed manually are applied automatically; others go to Intro suggestions for review.")}</Text>
      {detectionNotice}
      <AdminError error={error} />
      {!!message && <AdminNotice tone="good" text={message} />}
      {!!metadataMatches.length && <AdminCard style={styles.topGap}>
        <Text style={adminStyles.text}>{t('TMDB has new titles or synopses for {count} existing episodes.', { count: metadataMatches.length })}</Text>
        <AdminButtons><AdminButton compact variant="primary" icon="download-outline" label={t('Save TMDB episode details')} busy={applyingMetadata} onPress={() => void applyMetadataTitles()} /></AdminButtons>
      </AdminCard>}
      {adding && <View style={styles.topGap}><AddEpisodeForm series={series} episodes={episodes} metadataEpisodes={metadataEpisodes} onDone={() => setAdding(false)} /></View>}
    </AdminSection>

    {order ? <AdminSection title={t('Episode order')}>
      <Text style={adminStyles.muted}>{t('Move the source video to the correct numbered slot. Titles and synopses stay with their episode positions.')}</Text>
      {orderedSlots.map((slot, index) => {
        const episode = byID.get(slot.id);
        return <AdminRow
          key={slot.id}
          title={t('Season {season} · Episode {episode}', { season: slot.seasonNumber, episode: slot.episodeNumber })}
          subtitle={[t('Video: {title}', { title: episode?.video?.title || episode?.video_id || '' }), t('Original file: {filename}', { filename: episode?.video?.original_filename || t('Unavailable for older uploads') })].join('\n')}
          imageSlot={<Image source={resolveMediaURL(episode?.video?.thumbnail_url)} style={adminStyles.thumb} contentFit="cover" />}
          right={<View style={styles.moves}>
            <PressableScale accessibilityLabel={t('Move episode up')} disabled={index === 0 || savingOrder} onPress={() => move(slot.id, -1)} style={[styles.move, index === 0 && styles.moveDisabled]}><Ionicons name="arrow-up" size={18} color={colors.text} /></PressableScale>
            <PressableScale accessibilityLabel={t('Move episode down')} disabled={index === orderedSlots.length - 1 || savingOrder} onPress={() => move(slot.id, 1)} style={[styles.move, index === orderedSlots.length - 1 && styles.moveDisabled]}><Ionicons name="arrow-down" size={18} color={colors.text} /></PressableScale>
          </View>}
        />;
      })}
      <AdminButtons>
        <AdminButton variant="primary" icon="save-outline" label={savingOrder ? t('Saving order...') : t('Save order')} busy={savingOrder} onPress={() => void saveOrder()} />
        <AdminButton label={t('Cancel')} disabled={savingOrder} onPress={() => setOrder(null)} />
      </AdminButtons>
    </AdminSection>
      : !episodes.length ? <AdminEmpty text={t('No episodes yet.')} />
        : seasons.map(([season, items]) => <AdminSection key={season} title={t('Season {n}', { n: season })}>
          {items.map((episode) => <AdminRow
            key={episode.id}
            title={`E${episode.episode_number} · ${episode.title || episode.video?.title || t('Untitled')}`}
            subtitle={episode.intro_end_seconds > episode.intro_start_seconds ? t('Intro {start}–{end}s', { start: Math.round(episode.intro_start_seconds), end: Math.round(episode.intro_end_seconds) }) : t('No intro timing')}
            imageSlot={<Image source={resolveMediaURL(episode.video?.thumbnail_url)} style={adminStyles.thumb} contentFit="cover" />}
            badges={(episode.video?.status && episode.video.status !== 'ready') || episode.video?.explicit || episode.content_warning ? <>
              {!!episode.video?.status && episode.video.status !== 'ready' && <AdminBadge tone="warn" label={t('Processing')} />}
              {!!episode.video?.explicit && <AdminBadge tone="bad" label="18+" />}
              {episode.content_warning && <AdminBadge tone="warn" label={t('Warning')} />}
            </> : undefined}
            onPress={() => openEpisode(episode)}
          />)}
        </AdminSection>)}

    {!!episodes.length && <AdminSection title={t('Subtitle delay for all episodes')}>
      <Text style={adminStyles.muted}>{t('Sets the same delay on every subtitle track of this series. Use negative values to show subtitles earlier.')}</Text>
      <AdminField label={t('Delay (ms)')} value={delayText} onChangeText={setDelayText} keyboardType="numbers-and-punctuation" autoCapitalize="none" />
      <AdminButtons><AdminButton icon="time-outline" label={t('Apply to all subtitles')} busy={savingDelay} onPress={applySubtitleDelay} /></AdminButtons>
    </AdminSection>}
  </>;
}

const useStyles = makeStyles(() => ({
  help: { marginTop: 8 },
  topGap: { marginTop: 12 },
  moves: { flexDirection: 'row', gap: 6 },
  move: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  moveDisabled: { opacity: .3 },
}));
