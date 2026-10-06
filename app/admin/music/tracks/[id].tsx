import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { musicAPI, useInvalidateMusic, useMusicCatalog } from '@/admin/music/api';
import { MusicArtwork, MusicSelect, MusicVideoCard, MusicVideoPicker, pickAudioFiles } from '@/admin/music/components';
import { audioFormatLabel, formatDuration, isAllowedAudio, lyricsStatusLabel, lyricsTone, nextTrackNumber, publishErrorMessage, statusLabel, statusTone, trackPublishProblems } from '@/admin/music/helpers';
import type { LocalMusicFile, MusicTrackInput } from '@/admin/music/types';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminNumberField, AdminProgress, AdminScreen, AdminSection, AdminToggle, confirmAction, formatBytes } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';

type VideoChoice = { id: string; title: string; thumbnail: string; channel?: string };

const emptyForm = (releaseID = ''): MusicTrackInput => ({ release_id: releaseID, title: '', disc_number: 1, track_number: 1, duration_seconds: 0, isrc: '', explicit: false, language: '' });

export default function MusicTrackScreen() {
  const { id = 'new', release: releaseParam } = useLocalSearchParams<{ id: string; release?: string }>();
  const isNew = id === 'new';
  const { t, dateTime } = useI18n();
  const catalog = useMusicCatalog();
  const invalidate = useInvalidateMusic();
  const track = catalog.tracks.find((item) => item.id === id);
  const [form, setForm] = useState<MusicTrackInput>(() => emptyForm(releaseParam));
  const [loadedID, setLoadedID] = useState('');
  const [audio, setAudio] = useState<LocalMusicFile | null>(null);
  const [video, setVideo] = useState<VideoChoice | null>(null);
  const [pickingVideo, setPickingVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [showLyrics, setShowLyrics] = useState(false);

  // Load the track into the form once it arrives (render-time sync, no effect).
  if (track && loadedID !== track.id) {
    setLoadedID(track.id);
    setForm({ release_id: track.release_id, title: track.title, disc_number: track.disc_number, track_number: track.track_number, duration_seconds: track.duration_seconds, isrc: track.isrc, explicit: track.explicit, language: track.language });
    setVideo(track.official_video_id ? { id: track.official_video_id, title: track.official_video_title || track.official_video_id, thumbnail: track.official_video_thumbnail } : null);
  }
  // New tracks start on the requested (or first) release, after its last track.
  if (isNew && !loadedID && !catalog.loading) {
    const releaseID = releaseParam || catalog.releases[0]?.id || '';
    setLoadedID('new');
    setForm((current) => ({ ...current, release_id: releaseID, track_number: nextTrackNumber(catalog.tracks, releaseID, current.disc_number) }));
  }

  const release = catalog.releases.find((item) => item.id === form.release_id);
  const set = <K extends keyof MusicTrackInput>(key: K, value: MusicTrackInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const chooseAudio = async () => {
    const [file] = await pickAudioFiles(false);
    if (!file) return;
    if (!isAllowedAudio(file.name)) { setError(new Error(t('Use MP3, M4A, AAC, WAV, FLAC, OGG, or Opus audio.'))); return; }
    setError(null);
    setAudio(file);
  };

  const run = async (key: string, action: () => Promise<unknown>, success: string, problems: string[] = []) => {
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

  const save = async () => {
    if (!form.release_id || !form.title.trim()) { setError(new Error(t('Release and title are required.'))); return; }
    setBusy('save');
    setError(null);
    setNotice('');
    setProgress(0);
    try {
      const input = { ...form, title: form.title.trim(), isrc: form.isrc.trim(), language: form.language.trim(), disc_number: Math.max(1, form.disc_number || 1), track_number: Math.max(1, form.track_number || 1) };
      const saved = isNew ? await musicAPI.createTrack(input) : await musicAPI.updateTrack(id, input);
      if (audio) {
        await musicAPI.uploadTrackAudio(saved.id, audio, setProgress);
        setAudio(null);
      }
      const previousVideoID = track?.official_video_id || '';
      if (video && video.id !== previousVideoID) await musicAPI.setVideo(saved.id, video.id);
      else if (!video && previousVideoID) await musicAPI.clearVideo(saved.id);
      await invalidate();
      if (isNew) router.replace({ pathname: '/admin/music/tracks/[id]', params: { id: saved.id } });
      else setNotice(t('{title} was saved.', { title: input.title }));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy('');
      setProgress(0);
    }
  };

  const remove = () => confirmAction(t, t('Delete track?'), t('Delete {title}? Its audio files are removed too.', { title: track?.title || '' }), async () => {
    await musicAPI.deleteTrack(id);
    await invalidate();
    router.back();
  });

  if (catalog.loading) return <AdminScreen title={t('Track')}><AdminLoading /></AdminScreen>;
  if (!isNew && !track) return <AdminScreen title={t('Track')}><AdminError error={catalog.error} /><AdminEmpty text={t('Track not found.')} /></AdminScreen>;
  if (isNew && !catalog.releases.length) return <AdminScreen title={t('New track')}><AdminEmpty text={t('Create a release first.')} /></AdminScreen>;

  const problems = track ? trackPublishProblems(t, track, release) : [];
  const lyricsText = track?.synced_lyrics || track?.lyrics || '';
  const releaseOptions = catalog.releases.map((item) => ({ value: item.id, label: item.title, subtitle: item.artist_name }));

  return <AdminScreen title={isNew ? t('New track') : track?.title || t('Track')} subtitle={track ? `${track.artist_name} · ${track.release_title}` : undefined} refreshing={catalog.refreshing} onRefresh={() => void catalog.refetch()}>
    {!!track && <AdminSection title={t('Status')}>
      <AdminCard>
        <View style={styles.statusRow}>
          <MusicArtwork url={track.cover_url} size={56} />
          <View style={styles.badges}>
            <AdminBadge label={statusLabel(t, track.status)} tone={statusTone(track.status)} />
            <AdminBadge label={lyricsStatusLabel(t, track)} tone={lyricsTone(track)} />
            {!!track.official_video_id && <AdminBadge label={t('Video linked')} tone="info" />}
            {track.explicit && <AdminBadge label={t('Explicit')} />}
          </View>
        </View>
        {problems.length > 0 && <AdminNotice tone="warn" text={t('Missing: {fields}', { fields: problems.join(', ') })} />}
        <AdminButtons>
          {track.status === 'draft'
            ? <AdminButton variant="primary" icon="cloud-upload-outline" label={t('Publish track')} busy={busy === 'publish'} disabled={!!busy} onPress={() => void run('publish', () => musicAPI.publishTrack(id), t('Published {title}.', { title: track.title }), problems)} />
            : <AdminButton icon="cloud-offline-outline" label={t('Unpublish track')} busy={busy === 'publish'} disabled={!!busy} onPress={() => void run('publish', () => musicAPI.unpublishTrack(id), t('Moved {title} back to draft.', { title: track.title }))} />}
          {!!release && <AdminButton icon="disc-outline" label={t('Edit release')} onPress={() => router.push({ pathname: '/admin/music/releases/[id]', params: { id: release.id } })} />}
        </AdminButtons>
      </AdminCard>
    </AdminSection>}

    {!!notice && <AdminNotice tone="good" text={notice} />}

    <AdminSection title={t('Details')}>
      <AdminCard>
        <MusicSelect label={t('Release')} value={form.release_id} options={releaseOptions} placeholder={t('Select a release')} onChange={(value) => setForm((current) => ({ ...current, release_id: value, track_number: isNew ? nextTrackNumber(catalog.tracks, value, current.disc_number) : current.track_number }))} />
        <AdminField label={t('Title')} value={form.title} onChangeText={(value) => set('title', value)} autoCapitalize="words" />
        <View style={styles.pair}>
          <View style={styles.half}><AdminNumberField label={t('Disc')} value={form.disc_number} onChange={(value) => set('disc_number', value)} /></View>
          <View style={styles.half}><AdminNumberField label={t('Track number')} value={form.track_number} onChange={(value) => set('track_number', value)} /></View>
        </View>
        <AdminField label="ISRC" value={form.isrc} onChangeText={(value) => set('isrc', value.toUpperCase())} autoCapitalize="characters" placeholder="USXXX2600001" />
        <AdminField label={t('Language')} value={form.language} onChangeText={(value) => set('language', value)} autoCapitalize="none" placeholder={t('e.g. en, es')} />
        <AdminToggle label={t('Explicit')} value={form.explicit} onChange={(value) => set('explicit', value)} />
        {!!track?.duration_seconds && <Text style={styles.help}>{t('Duration: {duration} (read from the audio master)', { duration: formatDuration(track.duration_seconds) })}</Text>}
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Audio master')}>
      <AdminCard>
        {track?.audio_url
          ? <><Text style={styles.text}>{track.audio_original_name}</Text><Text style={styles.muted}>{audioFormatLabel(t, track)}</Text></>
          : <Text style={styles.warn}>{t('Missing audio')}</Text>}
        {!!audio && <AdminNotice text={t('{name} ({size}) is uploaded when you save.', { name: audio.name, size: formatBytes(audio.size || 0) })} />}
        <Text style={styles.help}>{t('MP3, M4A, AAC, WAV, FLAC, OGG or Opus up to 1 GB. GilTube keeps the master and creates low, medium and high streaming qualities.')}</Text>
        <AdminButtons>
          <AdminButton compact icon="musical-note-outline" label={track?.audio_url || audio ? t('Replace audio') : t('Choose audio')} disabled={busy === 'save'} onPress={() => void chooseAudio()} />
          {!!audio && <AdminButton compact label={t('Undo')} disabled={busy === 'save'} onPress={() => setAudio(null)} />}
        </AdminButtons>
        {busy === 'save' && !!audio && <AdminProgress value={progress} label={progress >= 95 ? t('Processing audio…') : t('Uploading {percent}%', { percent: progress })} />}
      </AdminCard>
    </AdminSection>

    {!!track && <AdminSection title={t('Lyrics')}>
      <AdminCard>
        <Text style={styles.text}>{lyricsStatusLabel(t, track)}</Text>
        {!!track.lyrics_source && <Text style={styles.muted}>{[track.lyrics_source, track.lyrics_synced_at ? dateTime(track.lyrics_synced_at) : ''].filter(Boolean).join(' · ')}</Text>}
        <Text style={styles.help}>{t('Lyrics are fetched from LRCLIB by artist, title, album and duration. Timed lyrics are used when available.')}</Text>
        <AdminButtons>
          <AdminButton compact icon="sync-outline" label={busy === 'lyrics' ? t('Syncing…') : t('Sync from LRCLIB')} busy={busy === 'lyrics'} disabled={!!busy} onPress={() => void run('lyrics', async () => {
            const saved = await musicAPI.syncLyrics(id);
            setNotice(t(saved.synced_lyrics ? 'Timed lyrics saved for {title}.' : 'Plain lyrics saved for {title}.', { title: track.title }));
          }, '')} />
          {!!lyricsText && <AdminButton compact icon={showLyrics ? 'chevron-up' : 'chevron-down'} label={showLyrics ? t('Hide lyrics') : t('Show lyrics')} onPress={() => setShowLyrics((value) => !value)} />}
        </AdminButtons>
        {showLyrics && !!lyricsText && <Text selectable style={styles.lyrics}>{lyricsText}</Text>}
      </AdminCard>
    </AdminSection>}

    <AdminSection title={t('Official video')}>
      <AdminCard>
        {video
          ? <MusicVideoCard title={video.title} thumbnail={video.thumbnail} subtitle={video.channel || t('GilTube video')} onRemove={() => { setVideo(null); setPickingVideo(false); }} />
          : <Text style={styles.muted}>{t('No video linked.')}</Text>}
        {(video?.id || '') !== (track?.official_video_id || '') && <AdminNotice text={t('The video link changes when you save.')} />}
        <AdminButtons>
          <AdminButton compact icon={pickingVideo ? 'close' : 'search'} label={pickingVideo ? t('Close') : video ? t('Choose a different video') : t('Choose a video')} onPress={() => setPickingVideo((value) => !value)} />
        </AdminButtons>
        {pickingVideo && <MusicVideoPicker excludeID={video?.id} onSelect={(item) => { setVideo({ id: item.id, title: item.title || item.id, thumbnail: item.thumbnail_url, channel: item.channel_name }); setPickingVideo(false); }} />}
      </AdminCard>
    </AdminSection>

    <AdminError error={error} />
    <AdminButtons>
      <AdminButton variant="primary" icon="checkmark" label={busy === 'save' ? t('Saving…') : t('Save')} busy={busy === 'save'} disabled={!!busy && busy !== 'save'} onPress={() => void save()} />
      {!isNew && <AdminButton variant="danger" icon="trash-outline" label={t('Delete')} disabled={!!busy} onPress={remove} />}
    </AdminButtons>
  </AdminScreen>;
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  text: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  warn: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  help: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 8 },
  lyrics: { marginTop: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.canvas, color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },
});
