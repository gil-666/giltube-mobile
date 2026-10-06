import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { musicAPI, useInvalidateMusic, useMusicCatalog } from '@/admin/music/api';
import { releasePublishProblems, syncReleaseLyrics, syncSummary } from '@/admin/music/actions';
import { MusicArtwork, MusicStats } from '@/admin/music/components';
import { audioFormatLabel, errorMessage, lyricsStatusLabel, lyricsTone, publishErrorMessage, releaseRightsReady, releaseTypeLabel, sortTracks, statusLabel, statusTone, trackPublishProblems } from '@/admin/music/helpers';
import type { AdminMusicRelease, AdminMusicTrack } from '@/admin/music/types';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminRow, AdminScreen, AdminSection } from '@/admin/ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';
import { openGilTubeWeb } from '@/utils/web';

type Tab = 'artists' | 'releases' | 'tracks';

export default function MusicAdminScreen() {
  const styles = useStyles();
  const { t, dateTime } = useI18n();
  const catalog = useMusicCatalog();
  const invalidate = useInvalidateMusic();
  const [tab, setTab] = useState<Tab>('artists');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyID, setBusyID] = useState('');
  const [syncingTrackID, setSyncingTrackID] = useState('');
  const { overview, artists, releases, tracks } = catalog;

  const groups = useMemo(() => releases.map((release) => {
    const releaseTracks = sortTracks(tracks.filter((track) => track.release_id === release.id));
    return { release, tracks: releaseTracks, ready: releaseTracks.filter((track) => trackPublishProblems(t, track, release).length === 0).length };
  }).filter((group) => group.tracks.length > 0), [releases, tracks, t]);

  const formatDate = (value?: string) => value ? dateTime(value, { dateStyle: 'medium', timeZone: 'UTC' }) : t('Date not set');

  const run = async (key: string, action: () => Promise<unknown>, success: string, problems: string[] = []) => {
    setNotice('');
    setActionError('');
    setBusyID(key);
    try {
      await action();
      await invalidate();
      setNotice(success);
    } catch (error) {
      setActionError(publishErrorMessage(t, error, problems));
    } finally {
      setBusyID('');
    }
  };

  const setPublished = (release: AdminMusicRelease, publish: boolean) => run(
    `publish-${release.id}`,
    () => publish ? musicAPI.publishRelease(release.id) : musicAPI.unpublishRelease(release.id),
    t(publish ? 'Published {title}.' : 'Moved {title} back to draft.', { title: release.title }),
    publish ? releasePublishProblems(t, release, tracks) : [],
  );

  const syncGroup = async (release: AdminMusicRelease, releaseTracks: AdminMusicTrack[]) => {
    setNotice('');
    setActionError('');
    setBusyID(`sync-${release.id}`);
    try {
      const result = await syncReleaseLyrics(releaseTracks, setSyncingTrackID);
      await invalidate();
      setNotice(syncSummary(t, release.title, result));
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSyncingTrackID('');
      setBusyID('');
    }
  };

  const openWeb = () => void openGilTubeWeb('/music').catch((error) => Alert.alert(t('Something went wrong'), errorMessage(error)));

  return <AdminScreen
    title={t('Music')}
    subtitle={t('Artists, releases and tracks')}
    refreshing={catalog.refreshing}
    onRefresh={() => void catalog.refetch()}
    right={<PressableScale accessibilityLabel={t('Open GilTube Music')} onPress={openWeb} style={styles.headerButton}><Ionicons name="open-outline" size={20} color={colors.text} /></PressableScale>}
  >
    {catalog.loading ? <AdminLoading /> : <>
      <AdminError error={catalog.error} />
      {!!overview && <MusicStats items={[
        { label: t('Artists'), value: overview.artists },
        { label: t('Releases'), value: overview.releases },
        { label: t('Tracks'), value: overview.tracks },
        { label: t('Published'), value: overview.published, tone: 'good' },
        { label: t('Blocked'), value: overview.blocked, tone: overview.blocked ? 'warn' : undefined },
      ]} />}
      {!!notice && <AdminNotice tone="good" text={notice} />}
      {!!actionError && <AdminNotice tone="bad" text={actionError} />}
      <AdminChips<Tab> value={tab} onChange={setTab} options={[
        { value: 'artists', label: `${t('Artists')} ${artists.length}` },
        { value: 'releases', label: `${t('Releases')} ${releases.length}` },
        { value: 'tracks', label: `${t('Tracks')} ${tracks.length}` },
      ]} />

      {tab === 'artists' && <AdminSection title={t('Artists')} right={<AdminButton compact variant="primary" icon="add" label={t('New artist')} onPress={() => router.push({ pathname: '/admin/music/artists/[id]', params: { id: 'new' } })} />}>
        <Text style={styles.help}>{t('Artists can stand alone or be connected to a GilTube channel.')}</Text>
        {artists.length ? artists.map((artist) => <AdminRow
          key={artist.id}
          imageSlot={<MusicArtwork url={artist.avatar_url} size={44} round />}
          title={artist.name}
          subtitle={[artist.channel_name || t('Music-only artist'), artist.slug].join(' · ')}
          badges={<AdminBadge label={artist.verified ? t('Verified') : t('Standard')} tone={artist.verified ? 'info' : 'neutral'} />}
          onPress={() => router.push({ pathname: '/admin/music/artists/[id]', params: { id: artist.id } })}
        />) : <AdminEmpty text={t('No artists yet.')} />}
      </AdminSection>}

      {tab === 'releases' && <AdminSection title={t('Releases')} right={<AdminButton compact variant="primary" icon="add" label={t('New release')} disabled={!artists.length} onPress={() => router.push({ pathname: '/admin/music/releases/[id]', params: { id: 'new' } })} />}>
        <Text style={styles.help}>{t('Singles, EPs and albums. Publishing a release publishes all of its tracks.')}</Text>
        {!artists.length && <AdminNotice tone="warn" text={t('Create an artist first.')} />}
        {releases.length ? releases.map((release) => <AdminRow
          key={release.id}
          imageSlot={<MusicArtwork url={release.cover_url} size={52} />}
          title={release.title}
          subtitle={[release.artist_name, releaseTypeLabel(t, release.release_type), formatDate(release.release_date), t('{count} tracks', { count: release.track_count })].join(' · ')}
          badges={<>
            <AdminBadge label={statusLabel(t, release.status)} tone={statusTone(release.status)} />
            <AdminBadge label={releaseRightsReady(release) ? t('Rights complete') : t('Rights incomplete')} tone={releaseRightsReady(release) ? 'good' : 'warn'} />
          </>}
          onPress={() => router.push({ pathname: '/admin/music/releases/[id]', params: { id: release.id } })}
        />) : <AdminEmpty text={t('No releases yet.')} />}
      </AdminSection>}

      {tab === 'tracks' && <AdminSection title={t('Tracks')}>
        <Text style={styles.help}>{t('Tracks are grouped by release in disc and track order.')}</Text>
        <AdminButtons>
          <AdminButton compact variant="primary" icon="flash-outline" label={t('Quick upload')} onPress={() => router.push('/admin/music/quick-upload')} />
          <AdminButton compact icon="albums-outline" label={t('Import tracks')} disabled={!releases.length} onPress={() => router.push({ pathname: '/admin/music/import', params: { release: releases[0]?.id || '' } })} />
          <AdminButton compact icon="add" label={t('New track')} disabled={!releases.length} onPress={() => router.push({ pathname: '/admin/music/tracks/[id]', params: { id: 'new' } })} />
        </AdminButtons>
        {groups.length ? groups.map((group) => <AdminCard key={group.release.id} style={styles.group}>
          <View style={styles.groupHead}>
            <MusicArtwork url={group.release.cover_url} size={52} />
            <View style={styles.groupCopy}>
              <Text numberOfLines={2} style={styles.groupTitle}>{group.release.title}</Text>
              <Text numberOfLines={1} style={styles.groupSubtitle}>{group.release.artist_name} · {releaseTypeLabel(t, group.release.release_type)}</Text>
              <View style={styles.badges}>
                <AdminBadge label={t('{ready}/{total} ready', { ready: group.ready, total: group.tracks.length })} tone={group.ready === group.tracks.length ? 'good' : 'warn'} />
                <AdminBadge label={statusLabel(t, group.release.status)} tone={statusTone(group.release.status)} />
              </View>
            </View>
          </View>
          <AdminButtons>
            <AdminButton compact icon="create-outline" label={t('Edit release')} onPress={() => router.push({ pathname: '/admin/music/releases/[id]', params: { id: group.release.id } })} />
            <AdminButton compact icon="text-outline" label={busyID === `sync-${group.release.id}` ? t('Syncing lyrics…') : t('Sync release lyrics')} busy={busyID === `sync-${group.release.id}`} disabled={!!busyID} onPress={() => void syncGroup(group.release, group.tracks)} />
            {group.release.status === 'draft'
              ? <AdminButton compact variant="primary" icon="cloud-upload-outline" label={t('Publish release')} busy={busyID === `publish-${group.release.id}`} disabled={!!busyID} onPress={() => void setPublished(group.release, true)} />
              : <AdminButton compact icon="cloud-offline-outline" label={t('Unpublish release')} busy={busyID === `publish-${group.release.id}`} disabled={!!busyID} onPress={() => void setPublished(group.release, false)} />}
          </AdminButtons>
          {group.tracks.map((track) => {
            const problems = trackPublishProblems(t, track, group.release);
            return <AdminRow
              key={track.id}
              title={`${track.disc_number}.${track.track_number}  ${track.title}`}
              subtitle={track.audio_url ? `${track.audio_original_name} · ${audioFormatLabel(t, track)}` : t('Missing audio')}
              badges={<>
                {syncingTrackID === track.id && <AdminBadge label={t('Syncing…')} tone="info" />}
                <AdminBadge label={lyricsStatusLabel(t, track)} tone={lyricsTone(track)} />
                {!!track.official_video_id && <AdminBadge label={t('Video linked')} tone="info" />}
                {track.explicit && <AdminBadge label={t('Explicit')} />}
                {problems.length ? <AdminBadge label={problems.join(', ')} tone="warn" /> : <AdminBadge label={statusLabel(t, track.status)} tone={statusTone(track.status)} />}
              </>}
              onPress={() => router.push({ pathname: '/admin/music/tracks/[id]', params: { id: track.id } })}
            />;
          })}
        </AdminCard>) : <AdminEmpty text={t('No tracks yet. Use Quick upload to create a release from audio files.')} />}
      </AdminSection>}
    </>}
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  headerButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  group: { marginTop: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupCopy: { flex: 1, minWidth: 0 },
  groupTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  groupSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
}));
