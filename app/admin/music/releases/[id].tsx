import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { releasePublishProblems, syncReleaseLyrics, syncSummary } from '@/admin/music/actions';
import { musicAPI, useInvalidateMusic, useMusicCatalog } from '@/admin/music/api';
import { MusicArtwork, MusicSelect } from '@/admin/music/components';
import { errorMessage, isValidDate, lyricsStatusLabel, lyricsTone, publishErrorMessage, RELEASE_TYPES, releaseRightsProblems, releaseTypeLabel, sortTracks, statusLabel, statusTone, trackPublishProblems } from '@/admin/music/helpers';
import type { LocalMusicFile, MusicReleaseInput, MusicReleaseType } from '@/admin/music/types';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminRow, AdminScreen, AdminSection, AdminToggle, confirmAction, pickFile } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

const emptyForm = (artistID = ''): MusicReleaseInput => ({
  artist_id: artistID, title: '', release_type: 'single', release_date: '', label: '',
  copyright_text: '', phonogram_text: '', territories: 'Worldwide', rights_confirmed: false,
});

export default function MusicReleaseScreen() {
  const { id = 'new', artist: artistParam } = useLocalSearchParams<{ id: string; artist?: string }>();
  const isNew = id === 'new';
  const { t } = useI18n();
  const catalog = useMusicCatalog();
  const invalidate = useInvalidateMusic();
  const release = catalog.releases.find((item) => item.id === id);
  const [form, setForm] = useState<MusicReleaseInput>(() => emptyForm(artistParam));
  const [loadedID, setLoadedID] = useState('');
  const [cover, setCover] = useState<LocalMusicFile | null>(null);
  const [artworkTrackID, setArtworkTrackID] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  const tracks = useMemo(() => sortTracks(catalog.tracks.filter((track) => track.release_id === id)), [catalog.tracks, id]);
  const artworkTracks = useMemo(() => tracks.filter((track) => !!track.audio_url), [tracks]);

  // Load the release into the form once it arrives (render-time sync, no effect).
  if (release && loadedID !== release.id) {
    setLoadedID(release.id);
    setForm({
      artist_id: release.artist_id, title: release.title, release_type: release.release_type,
      release_date: release.release_date?.slice(0, 10) || '', label: release.label,
      copyright_text: release.copyright_text, phonogram_text: release.phonogram_text,
      territories: release.territories || 'Worldwide', rights_confirmed: release.rights_confirmed,
    });
  }

  // New releases default to the first artist; the artwork picker to the first track with audio.
  const artistID = form.artist_id || (isNew ? catalog.artists[0]?.id || '' : '');
  const artworkTrack = artworkTrackID || artworkTracks[0]?.id || '';

  const set = <K extends keyof MusicReleaseInput>(key: K, value: MusicReleaseInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const run = async (key: string, action: () => Promise<unknown>, success?: string, problems: string[] = []) => {
    setBusy(key);
    setError(null);
    setNotice('');
    try {
      await action();
      await invalidate();
      if (success) setNotice(success);
    } catch (actionError) {
      setError(new Error(publishErrorMessage(t, actionError, problems)));
    } finally {
      setBusy('');
    }
  };

  const chooseCover = async () => {
    const asset = await pickFile('image/*');
    if (asset) setCover({ uri: asset.uri, name: asset.name, size: asset.size });
  };

  const save = async () => {
    if (!artistID || !form.title.trim()) { setError(new Error(t('Artist and title are required.'))); return; }
    if (!isValidDate(form.release_date.trim())) { setError(new Error(t('Use the date format YYYY-MM-DD.'))); return; }
    setBusy('save');
    setError(null);
    setNotice('');
    try {
      const input = { ...form, artist_id: artistID, title: form.title.trim(), release_date: form.release_date.trim(), territories: form.territories.trim() || 'Worldwide' };
      const saved = isNew ? await musicAPI.createRelease(input) : await musicAPI.updateRelease(id, input);
      if (cover) await musicAPI.uploadReleaseCover(saved.id, cover);
      setCover(null);
      await invalidate();
      if (isNew) router.replace({ pathname: '/admin/music/releases/[id]', params: { id: saved.id } });
      else setNotice(t('{title} was saved.', { title: input.title }));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy('');
    }
  };

  const remove = () => confirmAction(t, t('Delete release?'), t('Delete {title} and all of its tracks? This removes their audio files.', { title: release?.title || '' }), async () => {
    await musicAPI.deleteRelease(id);
    await invalidate();
    router.back();
  });

  const syncAll = () => run('sync', async () => {
    const result = await syncReleaseLyrics(tracks);
    Alert.alert(t('Lyrics'), syncSummary(t, release?.title || '', result));
  });

  if (!isNew && catalog.loading) return <AdminScreen title={t('Release')}><AdminLoading /></AdminScreen>;
  if (!isNew && !release) return <AdminScreen title={t('Release')}><AdminError error={catalog.error} /><AdminEmpty text={t('Release not found.')} /></AdminScreen>;

  const artistOptions = catalog.artists.map((artist) => ({ value: artist.id, label: artist.name, subtitle: artist.channel_name || undefined }));
  const rightsProblems = release ? releaseRightsProblems(t, release) : [];
  const publishProblems = release ? releasePublishProblems(t, release, catalog.tracks) : [];

  return <AdminScreen title={isNew ? t('New release') : release?.title || t('Release')} subtitle={release ? `${release.artist_name} · /${release.slug}` : undefined} refreshing={catalog.refreshing} onRefresh={() => void catalog.refetch()}>
    {!!release && <AdminSection title={t('Status')}>
      <AdminCard>
        <View style={styles.badges}>
          <AdminBadge label={statusLabel(t, release.status)} tone={statusTone(release.status)} />
          <AdminBadge label={rightsProblems.length ? t('Rights incomplete') : t('Rights complete')} tone={rightsProblems.length ? 'warn' : 'good'} />
          <AdminBadge label={t('{count} tracks', { count: release.track_count })} />
          {release.has_lossless_audio && <AdminBadge label={t('Lossless')} tone="info" />}
        </View>
        {release.status === 'draft' && publishProblems.length > 0 && <AdminNotice tone="warn" text={t('Missing: {fields}', { fields: publishProblems.join(', ') })} />}
        <AdminButtons>
          {release.status === 'draft'
            ? <AdminButton variant="primary" icon="cloud-upload-outline" label={t('Publish release')} busy={busy === 'publish'} disabled={!!busy} onPress={() => void run('publish', () => musicAPI.publishRelease(id), t('Published {title}.', { title: release.title }), publishProblems)} />
            : <AdminButton icon="cloud-offline-outline" label={t('Unpublish release')} busy={busy === 'publish'} disabled={!!busy} onPress={() => void run('publish', () => musicAPI.unpublishRelease(id), t('Moved {title} back to draft.', { title: release.title }))} />}
        </AdminButtons>
        <Text style={styles.help}>{t('Publishing a release publishes all of its tracks.')}</Text>
      </AdminCard>
    </AdminSection>}

    {!!notice && <AdminNotice tone="good" text={notice} />}

    <AdminSection title={t('Details')}>
      <AdminCard>
        <MusicSelect label={t('Artist')} value={artistID} options={artistOptions} onChange={(value) => set('artist_id', value)} placeholder={t('Select an artist')} />
        <AdminField label={t('Title')} value={form.title} onChangeText={(value) => set('title', value)} autoCapitalize="words" />
        <AdminChips<MusicReleaseType> label={t('Release type')} value={form.release_type} onChange={(value) => set('release_type', value)} options={RELEASE_TYPES.map((type) => ({ value: type, label: releaseTypeLabel(t, type) }))} />
        <AdminField label={t('Release date')} value={form.release_date} onChangeText={(value) => set('release_date', value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" help={t('Optional.')} />
        <AdminField label={t('Record label')} value={form.label} onChangeText={(value) => set('label', value)} />
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Cover')}>
      <AdminCard>
        <View style={styles.coverRow}>
          <MusicArtwork url={release?.cover_url} localURI={cover?.uri} size={110} />
          <View style={styles.coverCopy}>
            <Text style={styles.muted}>{cover ? t('New cover selected. It is uploaded when you save.') : release?.cover_url ? t('Current cover. Choose a new image to replace it.') : t('No cover yet.')}</Text>
            <AdminButtons>
              <AdminButton compact icon="image-outline" label={t('Choose image')} onPress={() => void chooseCover()} />
              {!!cover && <AdminButton compact label={t('Undo')} onPress={() => setCover(null)} />}
            </AdminButtons>
          </View>
        </View>
        {!isNew && artworkTracks.length > 0 && <>
          <MusicSelect
            label={t('Use artwork embedded in a track')}
            value={artworkTrack}
            options={artworkTracks.map((track) => ({ value: track.id, label: `${track.disc_number}.${track.track_number} · ${track.title}`, subtitle: track.audio_original_name }))}
            onChange={setArtworkTrackID}
            help={t('Extracts the cover art stored in the uploaded audio master.')}
          />
          <AdminButtons>
            <AdminButton compact icon="color-wand-outline" label={busy === 'artwork' ? t('Extracting…') : t('Use track artwork')} busy={busy === 'artwork'} disabled={!artworkTrack || !!busy} onPress={() => void run('artwork', () => musicAPI.coverFromTrack(id, artworkTrack), t('Cover updated from the track artwork.'))} />
          </AdminButtons>
        </>}
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Rights')}>
      <AdminCard>
        <AdminField label={t('Copyright line')} value={form.copyright_text} onChangeText={(value) => set('copyright_text', value)} placeholder="© 2026 Rights holder" />
        <AdminField label={t('Phonogram line')} value={form.phonogram_text} onChangeText={(value) => set('phonogram_text', value)} placeholder="℗ 2026 Rights holder" />
        <AdminField label={t('Territories')} value={form.territories} onChangeText={(value) => set('territories', value)} placeholder={t('Worldwide, or country codes like US, MX')} />
        <AdminToggle label={t('I confirm GilTube has the rights to distribute this release')} value={form.rights_confirmed} onChange={(value) => set('rights_confirmed', value)} />
      </AdminCard>
    </AdminSection>

    <AdminError error={error} />
    <AdminButtons>
      <AdminButton variant="primary" icon="checkmark" label={busy === 'save' ? t('Saving…') : t('Save')} busy={busy === 'save'} disabled={!!busy && busy !== 'save'} onPress={() => void save()} />
      {!isNew && <AdminButton variant="danger" icon="trash-outline" label={t('Delete')} disabled={!!busy} onPress={remove} />}
    </AdminButtons>

    {!isNew && <AdminSection title={t('Tracks')}>
      <AdminButtons>
        <AdminButton compact variant="primary" icon="add" label={t('New track')} onPress={() => router.push({ pathname: '/admin/music/tracks/[id]', params: { id: 'new', release: id } })} />
        <AdminButton compact icon="albums-outline" label={t('Import tracks')} onPress={() => router.push({ pathname: '/admin/music/import', params: { release: id } })} />
        {tracks.length > 0 && <AdminButton compact icon="text-outline" label={busy === 'sync' ? t('Syncing lyrics…') : t('Sync release lyrics')} busy={busy === 'sync'} disabled={!!busy} onPress={() => void syncAll()} />}
      </AdminButtons>
      {tracks.length ? tracks.map((track) => {
        const problems = trackPublishProblems(t, track, release);
        return <AdminRow
          key={track.id}
          title={`${track.disc_number}.${track.track_number}  ${track.title}`}
          subtitle={track.audio_url ? track.audio_original_name : t('Missing audio')}
          badges={<>
            <AdminBadge label={lyricsStatusLabel(t, track)} tone={lyricsTone(track)} />
            {!!track.official_video_id && <AdminBadge label={t('Video linked')} tone="info" />}
            {problems.length ? <AdminBadge label={problems.join(', ')} tone="warn" /> : <AdminBadge label={statusLabel(t, track.status)} tone={statusTone(track.status)} />}
          </>}
          onPress={() => router.push({ pathname: '/admin/music/tracks/[id]', params: { id: track.id } })}
        />;
      }) : <AdminEmpty text={t('No tracks on this release yet.')} />}
    </AdminSection>}
    {!!catalog.error && <Text style={styles.muted}>{errorMessage(catalog.error)}</Text>}
  </AdminScreen>;
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coverCopy: { flex: 1, minWidth: 0 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  help: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 8 },
});
