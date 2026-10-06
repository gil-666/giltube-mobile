import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminProgress, AdminSection, AdminToggle, alertError, confirmAction, formatBytes, pickFile } from './ui';
import { withUploadFile, type PickedAsset } from './movies/files';
import { apiRequest } from '@/api/client';
import { sendForm, uploadFileChunks } from '@/api/upload';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

// Shared subtitle + audio track manager for one playable item. The three
// track APIs share one shape and differ only in their base path (relative to
// /api/v1, no trailing slash):
//   videos:   `/videos/${videoID}`
//   movies:   `/admin/movies/${movieID}`
//   episodes: `/admin/series/episodes/${episodeID}`
// Differences between them (checked against the backend routes):
//   - only movies accept chunked audio uploads (/audio-upload/finalize);
//     videos and episodes take the audio file in one multipart request.
//   - only movies and episodes expose POST /audio/:trackId/sync.

type Track = { id: string; label: string; language: string; uri: string; default: boolean; delay_ms: number; trim_start_ms?: number };
type SubtitleList = { subtitles?: Track[] | null };
type AudioList = { audio_tracks?: Track[] | null };

const SUBTITLE_TYPES = ['text/vtt', 'application/x-subrip', 'text/plain', 'application/octet-stream', '*/*'];
const AUDIO_TYPES = ['audio/*', 'video/*', 'application/octet-stream'];

function capabilities(basePath: string) {
  const movie = basePath.startsWith('/admin/movies/');
  const episode = basePath.startsWith('/admin/series/episodes/');
  return { chunkedAudio: movie, sync: movie || episode, movie };
}

function trackName(track: Track) {
  return track.label || track.language || track.id;
}

function parseMs(text: string) {
  const parsed = parseInt(text.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trackForm(fields: { label: string; language: string; isDefault: boolean; delayMs?: number }) {
  const form = new FormData();
  if (fields.label.trim()) form.append('label', fields.label.trim());
  if (fields.language.trim()) form.append('language', fields.language.trim());
  form.append('default', fields.isDefault ? 'true' : 'false');
  if (typeof fields.delayMs === 'number') form.append('delay_ms', String(Math.round(fields.delayMs)));
  return form;
}

/** Milliseconds input that accepts negative values plus quick nudge buttons. */
function DelayField({ label, value, onChange, help, allowNegative = true }: { label: string; value: number; onChange: (value: number) => void; help?: string; allowNegative?: boolean }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Follow outside changes (e.g. a reset) without clobbering a half-typed "-".
    setSeen(value);
    if (parseMs(text) !== value) setText(String(value));
  }
  const clamp = (next: number) => allowNegative ? next : Math.max(0, next);
  const nudge = (delta: number) => { const next = clamp(value + delta); setText(String(next)); onChange(next); };
  return <View>
    <AdminField label={label} value={text} onChangeText={(next) => { setText(next); onChange(clamp(parseMs(next))); }} keyboardType="numbers-and-punctuation" autoCapitalize="none" help={help} />
    <View style={styles.nudges}>
      {[-1000, -100, 100, 1000].map((delta) => <AdminButton key={delta} compact label={`${delta > 0 ? '+' : '−'}${Math.abs(delta) >= 1000 ? `${Math.abs(delta) / 1000}s` : `${Math.abs(delta)}ms`}`} onPress={() => nudge(delta)} />)}
    </View>
  </View>;
}

/** Add or replace form shared by subtitles and audio. */
function UploadForm({ kind, replacing, onCancel, onSubmit, busy, progress }: {
  kind: 'subtitle' | 'audio';
  replacing: Track | null;
  onCancel: () => void;
  onSubmit: (input: { asset: PickedAsset; label: string; language: string; isDefault: boolean; delayMs: number }) => Promise<boolean>;
  busy: boolean;
  progress: number | null;
}) {
  const { t } = useI18n();
  // The parent keys this form by the track being replaced, so state starts fresh per target.
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [label, setLabel] = useState(replacing?.label || '');
  const [language, setLanguage] = useState(replacing?.language || 'en');
  const [isDefault, setIsDefault] = useState(!!replacing?.default);
  const [delayMs, setDelayMs] = useState(replacing?.delay_ms || 0);

  const choose = async () => {
    try {
      const picked = await pickFile(kind === 'subtitle' ? SUBTITLE_TYPES : AUDIO_TYPES);
      if (!picked) return;
      setAsset({ uri: picked.uri, name: picked.name, size: picked.size, mimeType: picked.mimeType });
      if (kind === 'audio' && !label.trim()) setLabel(picked.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      alertError(t)(error);
    }
  };

  const submit = async () => {
    if (!asset) return;
    if (kind === 'subtitle' && !/\.(srt|vtt|ass)$/i.test(asset.name)) {
      alertError(t, 'Unsupported file')(new Error(t('Choose a .srt, .vtt or .ass subtitle file.')));
      return;
    }
    const ok = await onSubmit({ asset, label, language, isDefault, delayMs });
    if (ok) {
      setAsset(null);
      setLabel('');
      setLanguage('en');
      setIsDefault(false);
      setDelayMs(0);
    }
  };

  const heading = replacing
    ? t('Replace "{name}"', { name: trackName(replacing) })
    : kind === 'subtitle' ? t('Add subtitle') : t('Add audio track');
  return <AdminCard>
    <Text style={styles.cardTitle}>{heading}</Text>
    <AdminButtons>
      <AdminButton icon="document-attach-outline" label={asset ? t('Change file') : kind === 'subtitle' ? t('Choose subtitle file') : t('Choose audio file')} onPress={() => void choose()} disabled={busy} />
    </AdminButtons>
    {asset ? <Text style={styles.meta}>{asset.name}{asset.size ? ` · ${formatBytes(asset.size)}` : ''}</Text> : <Text style={styles.meta}>{kind === 'subtitle' ? t('.srt, .vtt or .ass') : t('Audio or video file (.mka, .mkv, .mp4, .aac, .mp3, .wav, .flac, .m4a)')}</Text>}
    <AdminField label={t('Language code')} value={language} onChangeText={setLanguage} placeholder="en" autoCapitalize="none" />
    <AdminField label={t('Label')} value={label} onChangeText={setLabel} placeholder={t('English')} />
    <AdminToggle label={t('Default track')} value={isDefault} onChange={setIsDefault} />
    <DelayField label={t('Delay (ms)')} value={delayMs} onChange={setDelayMs} help={kind === 'audio' ? t('Positive values play the track later, negative values earlier. Timing is baked in when the file is processed.') : t('Positive values show subtitles later, negative values earlier.')} />
    {progress !== null && <AdminProgress value={progress} label={progress >= 100 ? t('Processing on the server…') : t('Uploading {percent}%', { percent: Math.round(progress) })} />}
    {busy && progress === null && <Text style={styles.meta}>{t('Uploading and processing… keep the app open.')}</Text>}
    <AdminButtons>
      <AdminButton variant="primary" icon="cloud-upload-outline" label={replacing ? t('Replace file') : kind === 'subtitle' ? t('Add subtitle') : t('Add audio track')} onPress={() => void submit()} disabled={!asset} busy={busy} />
      {!!replacing && <AdminButton label={t('Cancel')} onPress={onCancel} disabled={busy} />}
    </AdminButtons>
  </AdminCard>;
}

function TrackCard({ kind, track, busy, duplicateDefaults, syncSupported, onSaveMeta, onReplace, onDelete, onSync }: {
  kind: 'subtitle' | 'audio';
  track: Track;
  busy: boolean;
  duplicateDefaults: boolean;
  syncSupported: boolean;
  onSaveMeta: (track: Track, patch: { label: string; language: string; isDefault: boolean; delayMs: number }) => Promise<boolean>;
  onReplace: (track: Track) => void;
  onDelete: (track: Track) => void;
  onSync: (track: Track, delayMs: number, trimStartMs: number) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [label, setLabel] = useState(track.label);
  const [language, setLanguage] = useState(track.language);
  const [delayMs, setDelayMs] = useState(track.delay_ms || 0);
  const [trimMs, setTrimMs] = useState(track.trim_start_ms || 0);
  // Re-seed the inputs whenever the server copy of the track changes.
  const [seen, setSeen] = useState(track);
  if (seen !== track) {
    setSeen(track);
    setLabel(track.label);
    setLanguage(track.language);
    setDelayMs(track.delay_ms || 0);
    setTrimMs(track.trim_start_ms || 0);
  }

  return <AdminCard>
    <Text numberOfLines={2} style={styles.cardTitle}>{track.label || t('Untitled track')}</Text>
    <View style={styles.badges}>
      <AdminBadge label={track.language || 'und'} tone="info" />
      <AdminBadge label={track.default ? t('Default') : t('Optional')} tone={track.default ? 'good' : 'neutral'} />
      <AdminBadge label={`${track.delay_ms || 0} ms`} />
      {!!track.trim_start_ms && <AdminBadge label={t('Trim {ms} ms', { ms: track.trim_start_ms })} />}
    </View>

    {editing && <>
      <AdminField label={t('Language code')} value={language} onChangeText={setLanguage} placeholder="en" autoCapitalize="none" />
      <AdminField label={t('Label')} value={label} onChangeText={setLabel} />
      {kind === 'subtitle' && <DelayField label={t('Delay (ms)')} value={delayMs} onChange={setDelayMs} help={t('Positive values show subtitles later, negative values earlier.')} />}
      <AdminButtons>
        <AdminButton variant="primary" label={t('Save')} busy={busy} onPress={() => void onSaveMeta(track, { label, language, isDefault: track.default, delayMs: kind === 'subtitle' ? delayMs : track.delay_ms || 0 }).then((ok) => { if (ok) setEditing(false); })} />
        <AdminButton label={t('Close')} onPress={() => setEditing(false)} disabled={busy} />
      </AdminButtons>
    </>}

    {syncing && <>
      <AdminNotice text={t('Re-encodes this track from its original upload with the new timing. This can take a few minutes on long videos.')} />
      <DelayField label={t('Delay (ms)')} value={delayMs} onChange={setDelayMs} help={t('Positive values play the track later, negative values earlier.')} />
      <DelayField label={t('Trim start (ms)')} value={trimMs} onChange={setTrimMs} allowNegative={false} help={t('Cuts this much from the beginning of the audio before applying the delay.')} />
      <AdminButtons>
        <AdminButton variant="primary" icon="sync-outline" label={t('Apply sync')} busy={busy} onPress={() => void onSync(track, delayMs, trimMs).then((ok) => { if (ok) setSyncing(false); })} />
        <AdminButton label={t('Close')} onPress={() => { setSyncing(false); setDelayMs(track.delay_ms || 0); setTrimMs(track.trim_start_ms || 0); }} disabled={busy} />
      </AdminButtons>
    </>}

    {!editing && !syncing && <AdminButtons>
      <AdminButton compact icon="create-outline" label={t('Edit')} onPress={() => setEditing(true)} disabled={busy} />
      {(!track.default || duplicateDefaults) && <AdminButton compact icon="star-outline" label={track.default ? t('Keep only this default') : t('Make default')} disabled={busy} onPress={() => void onSaveMeta(track, { label: track.label, language: track.language, isDefault: true, delayMs: track.delay_ms || 0 })} />}
      {kind === 'audio' && syncSupported && <AdminButton compact icon="pulse-outline" label={t('Sync timing')} onPress={() => setSyncing(true)} disabled={busy} />}
      <AdminButton compact icon="swap-horizontal-outline" label={t('Replace')} onPress={() => onReplace(track)} disabled={busy} />
      <AdminButton compact variant="danger" icon="trash-outline" label={t('Delete')} onPress={() => onDelete(track)} disabled={busy} />
    </AdminButtons>}
  </AdminCard>;
}

export function TrackManager({ basePath, title }: { basePath: string; title?: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const caps = capabilities(basePath);
  const subtitleKey = ['admin', 'tracks', basePath, 'subtitles'];
  const audioKey = ['admin', 'tracks', basePath, 'audio'];
  const subtitles = useQuery({ queryKey: subtitleKey, queryFn: () => apiRequest<SubtitleList>(`${basePath}/subtitles`), enabled: !!basePath, retry: false });
  const audio = useQuery({ queryKey: audioKey, queryFn: () => apiRequest<AudioList>(`${basePath}/audio`), enabled: !!basePath, retry: false });

  const [busy, setBusy] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const [replaceSubtitle, setReplaceSubtitle] = useState<Track | null>(null);
  const [replaceAudio, setReplaceAudio] = useState<Track | null>(null);
  const [globalDelay, setGlobalDelay] = useState(0);
  const [message, setMessage] = useState('');

  const [seenBase, setSeenBase] = useState(basePath);
  if (seenBase !== basePath) {
    setSeenBase(basePath);
    setReplaceSubtitle(null);
    setReplaceAudio(null);
    setMessage('');
  }

  const subtitleTracks = subtitles.data?.subtitles || [];
  const audioTracks = audio.data?.audio_tracks || [];
  const subtitleDefaults = subtitleTracks.filter((track) => track.default).length;
  const audioDefaults = audioTracks.filter((track) => track.default).length;

  const afterChange = () => {
    if (caps.movie) {
      // Public movie pages carry media capabilities (audio/subtitle availability).
      void queryClient.invalidateQueries({ queryKey: ['movie'] });
    }
  };
  const putSubtitles = (data: SubtitleList | null | undefined) => {
    if (data?.subtitles) queryClient.setQueryData<SubtitleList>(subtitleKey, { subtitles: data.subtitles });
    else void queryClient.invalidateQueries({ queryKey: subtitleKey });
    afterChange();
  };
  const putAudio = (data: AudioList | null | undefined) => {
    if (data?.audio_tracks) queryClient.setQueryData<AudioList>(audioKey, { audio_tracks: data.audio_tracks });
    else void queryClient.invalidateQueries({ queryKey: audioKey });
    afterChange();
  };

  /** Runs one track action with a shared busy flag; returns whether it succeeded. */
  const run = async (key: string, action: () => Promise<void>, done?: string) => {
    setBusy(key);
    setMessage('');
    try {
      await action();
      if (done) setMessage(done);
      return true;
    } catch (error) {
      alertError(t)(error);
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Subtitles
  const submitSubtitle = (input: { asset: PickedAsset; label: string; language: string; isDefault: boolean; delayMs: number }) => run('subtitle-upload', async () => {
    const target = replaceSubtitle;
    const data = await withUploadFile(input.asset, (file) => {
      const form = trackForm(input);
      form.append('subtitle', file);
      return apiRequest<SubtitleList>(target ? `${basePath}/subtitles/${encodeURIComponent(target.id)}` : `${basePath}/subtitles`, { method: target ? 'PUT' : 'POST', body: form });
    });
    putSubtitles(data);
    setReplaceSubtitle(null);
  }, t('Subtitle saved.'));

  const saveSubtitleMeta = (track: Track, patch: { label: string; language: string; isDefault: boolean; delayMs: number }) => run(`subtitle-${track.id}`, async () => {
    const data = await apiRequest<SubtitleList>(`${basePath}/subtitles/${encodeURIComponent(track.id)}`, { method: 'PUT', body: trackForm(patch) });
    putSubtitles(data);
  }, t('Subtitle updated.'));

  const deleteSubtitle = (track: Track) => confirmAction(t, t('Delete subtitle?'), t('Delete subtitle "{name}"?', { name: trackName(track) }), () => run(`subtitle-${track.id}`, async () => {
    putSubtitles(await apiRequest<SubtitleList>(`${basePath}/subtitles/${encodeURIComponent(track.id)}`, { method: 'DELETE' }));
    if (replaceSubtitle?.id === track.id) setReplaceSubtitle(null);
  }, t('Subtitle deleted.')));

  const fixSubtitleDefaults = () => {
    const preferred = subtitleTracks.find((track) => track.default) || subtitleTracks[0];
    if (preferred) void saveSubtitleMeta(preferred, { label: preferred.label, language: preferred.language, isDefault: true, delayMs: preferred.delay_ms || 0 });
  };

  const applyGlobalDelay = () => void run('subtitle-global', async () => {
    let latest: SubtitleList | null = null;
    for (const track of subtitleTracks) {
      latest = await apiRequest<SubtitleList>(`${basePath}/subtitles/${encodeURIComponent(track.id)}`, { method: 'PUT', body: trackForm({ label: track.label, language: track.language, isDefault: track.default, delayMs: globalDelay }) });
    }
    putSubtitles(latest);
  }, t('Delay applied to {count} subtitles.', { count: subtitleTracks.length }));

  // Audio
  const submitAudio = (input: { asset: PickedAsset; label: string; language: string; isDefault: boolean; delayMs: number }) => run('audio-upload', async () => {
    const target = replaceAudio;
    setAudioProgress(caps.chunkedAudio ? 0 : null);
    try {
      let data: AudioList;
      if (caps.chunkedAudio) {
        const { sessionID, fileName } = await uploadFileChunks(input.asset, (fraction) => setAudioProgress(Math.min(99, fraction * 99)));
        setAudioProgress(100);
        const form = trackForm(input);
        form.append('uploadSessionId', sessionID);
        form.append('fileName', fileName);
        if (target) form.append('trackId', target.id);
        data = await sendForm(`${basePath}/audio-upload/finalize`, form) as AudioList;
      } else {
        data = await withUploadFile(input.asset, (file) => {
          const form = trackForm(input);
          form.append('audio', file);
          return apiRequest<AudioList>(target ? `${basePath}/audio/${encodeURIComponent(target.id)}` : `${basePath}/audio`, { method: target ? 'PUT' : 'POST', body: form });
        });
      }
      putAudio(data);
      setReplaceAudio(null);
    } finally {
      setAudioProgress(null);
    }
  }, t('Audio track saved.'));

  const saveAudioMeta = (track: Track, patch: { label: string; language: string; isDefault: boolean }) => run(`audio-${track.id}`, async () => {
    // Timing is only changed by a re-upload or an explicit sync.
    putAudio(await apiRequest<AudioList>(`${basePath}/audio/${encodeURIComponent(track.id)}`, { method: 'PUT', body: trackForm(patch) }));
  }, t('Audio track updated.'));

  const syncAudio = (track: Track, delayMs: number, trimStartMs: number) => run(`audio-${track.id}`, async () => {
    putAudio(await apiRequest<AudioList>(`${basePath}/audio/${encodeURIComponent(track.id)}/sync`, { method: 'POST', body: JSON.stringify({ delay_ms: Math.round(delayMs), trim_start_ms: Math.max(0, Math.round(trimStartMs)) }) }));
  }, t('Audio timing updated.'));

  const deleteAudio = (track: Track) => confirmAction(t, t('Delete audio track?'), t('Delete audio track "{name}"?', { name: trackName(track) }), () => run(`audio-${track.id}`, async () => {
    putAudio(await apiRequest<AudioList>(`${basePath}/audio/${encodeURIComponent(track.id)}`, { method: 'DELETE' }));
    if (replaceAudio?.id === track.id) setReplaceAudio(null);
  }, t('Audio track deleted.')));

  const refresh = () => {
    void subtitles.refetch();
    void audio.refetch();
  };

  return <View>
    {!!title && <Text style={styles.context}>{t('Tracks for {title}', { title })}</Text>}
    {!!message && <AdminNotice tone="good" text={message} />}

    <AdminSection title={t('Audio tracks')} right={<AdminButton compact icon="refresh" label={t('Refresh')} onPress={refresh} />}>
      <Text style={styles.help}>{t('Alternate languages or commentary. Viewers pick them from the player.')}</Text>
      {audio.isLoading ? <AdminLoading /> : audio.error ? <AdminError error={audio.error} /> : audioTracks.length === 0 ? <AdminEmpty text={t('No extra audio tracks yet.')} /> : audioTracks.map((track) => <TrackCard
        key={track.id}
        kind="audio"
        track={track}
        busy={busy !== null}
        duplicateDefaults={audioDefaults > 1}
        syncSupported={caps.sync}
        onSaveMeta={saveAudioMeta}
        onReplace={setReplaceAudio}
        onDelete={deleteAudio}
        onSync={syncAudio}
      />)}
      {!audio.error && <UploadForm key={`audio-${replaceAudio?.id ?? 'new'}`} kind="audio" replacing={replaceAudio} onCancel={() => setReplaceAudio(null)} onSubmit={submitAudio} busy={busy === 'audio-upload'} progress={busy === 'audio-upload' ? audioProgress : null} />}
    </AdminSection>

    <AdminSection title={t('Subtitles')} right={subtitleTracks.length > 0 && subtitleDefaults !== 1 ? <AdminButton compact icon="star-outline" label={t('Fix default')} onPress={fixSubtitleDefaults} disabled={busy !== null} /> : undefined}>
      {subtitles.isLoading ? <AdminLoading /> : subtitles.error ? <AdminError error={subtitles.error} /> : subtitleTracks.length === 0 ? <AdminEmpty text={t('No subtitles yet.')} /> : <>
        {subtitleDefaults !== 1 && <AdminNotice tone="warn" text={subtitleDefaults === 0 ? t('No subtitle is marked as default.') : t('More than one subtitle is marked as default.')} />}
        {subtitleTracks.map((track) => <TrackCard
          key={track.id}
          kind="subtitle"
          track={track}
          busy={busy !== null}
          duplicateDefaults={subtitleDefaults > 1}
          syncSupported={false}
          onSaveMeta={saveSubtitleMeta}
          onReplace={setReplaceSubtitle}
          onDelete={deleteSubtitle}
          onSync={async () => false}
        />)}
        <AdminCard>
          <Text style={styles.cardTitle}>{t('Delay for all subtitles')}</Text>
          <DelayField label={t('Delay (ms)')} value={globalDelay} onChange={setGlobalDelay} help={t('Sets the same delay on every subtitle track, e.g. after replacing the video file.')} />
          <AdminButtons><AdminButton label={t('Apply to all')} onPress={applyGlobalDelay} busy={busy === 'subtitle-global'} disabled={busy !== null} /></AdminButtons>
        </AdminCard>
      </>}
      {!subtitles.error && <UploadForm key={`subtitle-${replaceSubtitle?.id ?? 'new'}`} kind="subtitle" replacing={replaceSubtitle} onCancel={() => setReplaceSubtitle(null)} onSubmit={submitSubtitle} busy={busy === 'subtitle-upload'} progress={null} />}
    </AdminSection>
  </View>;
}

const styles = StyleSheet.create({
  context: { color: colors.textMuted, fontSize: 12, marginTop: 14 },
  help: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  nudges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
