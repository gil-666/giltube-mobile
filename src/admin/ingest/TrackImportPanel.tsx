import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminNumberField, AdminSection, AdminToggle, adminStyles, formatBytes } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

import { fetchSeriesEpisodes, importAudioTrack, importSubtitleTrack, ingestKeys, listAudioSources, listSubtitleSources, useIngestEpisodes, useIngestMovies, useIngestSeriesList } from './api';
import { audioStreamLabel, bulkRowState, errorMessage, inferBulkRows, subtitleStreamLabel, type BulkTrackRow } from './helpers';
import { OptionPicker } from './OptionPicker';
import type { AudioStream, MediaIngest, SubtitleStream, TrackImportRequest, TrackSource, TrackTargetType } from './types';

type Kind = 'audio' | 'subtitle';
type Stream = AudioStream | SubtitleStream;
type Source = TrackSource<Stream>;

const jobStatusLabels: Record<string, string> = { queued: 'Queued…', processing: 'Extracting audio…', completed: 'Done' };

/**
 * Extracts audio or subtitle streams from the ingest's files into existing
 * movies or episodes — one at a time or a whole season in bulk.
 */
export function TrackImportPanel({ item, kind }: { item: MediaIngest; kind: Kind }) {
  const { t } = useI18n();
  const isAudio = kind === 'audio';
  const sources = useQuery<Source[]>({
    queryKey: isAudio ? ingestKeys.audioSources(item.id) : ingestKeys.subtitleSources(item.id),
    queryFn: () => isAudio ? listAudioSources(item.id) : listSubtitleSources(item.id),
    staleTime: 60_000,
  });
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const streamLabel = (stream: Stream) => isAudio ? audioStreamLabel(stream as AudioStream) : subtitleStreamLabel(t, stream as SubtitleStream);

  // Stop waiting on audio jobs once the panel is gone.
  const cancelled = useRef(false);
  useEffect(() => { cancelled.current = false; return () => { cancelled.current = true; }; }, []);

  const runImport = (body: TrackImportRequest, onStatus?: (status: string) => void) => isAudio
    ? importAudioTrack(item.id, body, onStatus, () => cancelled.current)
    : importSubtitleTrack(item.id, body);

  return <View>
    <AdminChips value={mode} onChange={setMode} options={[
      { value: 'single', label: t('One title') },
      { value: 'bulk', label: t('Whole series') },
    ]} />
    <AdminNotice text={isAudio ? t('The original audio of the target stays untouched; the extracted stream is added as an extra language track.') : t('Text subtitle streams are converted to WebVTT and appended without removing existing tracks.')} />
    {sources.isLoading ? <><AdminLoading /><Text style={[adminStyles.muted, styles.center]}>{t('Inspecting files…')}</Text></>
      : sources.error ? <><AdminError error={sources.error} /><AdminButtons><AdminButton label={t('Try again')} icon="refresh" onPress={() => void sources.refetch()} /></AdminButtons></>
        : !sources.data?.length ? <AdminEmpty text={isAudio ? t('No audio streams were found in this ingest.') : t('No subtitle streams were found in this ingest.')} />
          : mode === 'single'
            ? <SingleImport item={item} isAudio={isAudio} sources={sources.data} streamLabel={streamLabel} runImport={runImport} />
            : <BulkImport isAudio={isAudio} sources={sources.data} streamLabel={streamLabel} runImport={runImport} />}
  </View>;
}

type ImportFn = (body: TrackImportRequest, onStatus?: (status: string) => void) => Promise<{ target_title?: string }>;

function SingleImport({ item, isAudio, sources, streamLabel, runImport }: { item: MediaIngest; isAudio: boolean; sources: Source[]; streamLabel: (stream: Stream) => string; runImport: ImportFn }) {
  const { t } = useI18n();
  const [targetType, setTargetType] = useState<TrackTargetType>(item.media_type === 'series' ? 'episode' : 'movie');
  const [targetID, setTargetID] = useState('');
  const [seriesID, setSeriesID] = useState('');
  // A single file is preselected (with its first stream), as on the web panel.
  const only = sources.length === 1 ? sources[0] : undefined;
  const [filePath, setFilePath] = useState(only?.file_path ?? '');
  const [streamIndex, setStreamIndex] = useState(only?.streams[0]?.index ?? -1);
  const [language, setLanguage] = useState(String(only?.streams[0]?.tags?.language || '').trim() || 'es');
  const [label, setLabel] = useState(String(only?.streams[0]?.tags?.title || '').trim() || 'Español');
  const [delayMs, setDelayMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobStatus, setJobStatus] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const movies = useIngestMovies(targetType === 'movie');
  const seriesList = useIngestSeriesList(targetType === 'episode');
  const episodes = useIngestEpisodes(targetType === 'episode' ? seriesID : '');
  const source = sources.find((entry) => entry.file_path === filePath);

  const selectStream = (src: Source | undefined, index: number) => {
    setStreamIndex(index);
    const stream = src?.streams.find((entry) => entry.index === index);
    const lang = String(stream?.tags?.language || '').trim();
    const title = String(stream?.tags?.title || '').trim();
    if (lang) setLanguage(lang);
    if (title) setLabel(title);
  };
  const selectFile = (path: string) => {
    setFilePath(path);
    const src = sources.find((entry) => entry.file_path === path);
    selectStream(src, src?.streams[0]?.index ?? -1);
  };

  const canImport = !!targetID && !!filePath && streamIndex >= 0;

  const submit = async () => {
    setBusy(true); setError(''); setMessage(''); setJobStatus('');
    try {
      const result = await runImport({
        target_type: targetType,
        target_id: targetID,
        file_path: filePath,
        stream_index: streamIndex,
        label,
        language,
        default: isDefault,
        delay_ms: delayMs,
        ...(isAudio ? { trim_start_ms: Math.max(0, trimStartMs) } : {}),
      }, setJobStatus);
      setMessage(t('Track added to {title}.', { title: result?.target_title || label }));
    } catch (err) {
      setError(errorMessage(err, isAudio ? t('Failed to extract audio.') : t('Failed to import subtitles.')));
    } finally {
      setBusy(false); setJobStatus('');
    }
  };

  return <View>
    <AdminSection title={t('Destination')}>
      <AdminCard>
        <AdminChips value={targetType} onChange={(value) => { setTargetType(value); setTargetID(''); setSeriesID(''); }} options={[
          { value: 'movie', label: t('Movie') },
          { value: 'episode', label: t('Episode') },
        ]} />
        {targetType === 'movie'
          ? <OptionPicker label={t('Movie')} value={targetID} onChange={setTargetID} placeholder={t('Select a movie')} options={(movies.data ?? []).map((movie) => ({ value: movie.id, label: movie.title, disabled: !movie.video_id, subtitle: movie.video_id ? undefined : t('No video yet') }))} />
          : <>
            <OptionPicker label={t('Series')} value={seriesID} onChange={(value) => { setSeriesID(value); setTargetID(''); }} placeholder={t('Select a series')} options={(seriesList.data ?? []).map((series) => ({ value: series.id, label: series.title }))} />
            <OptionPicker label={t('Episode')} value={targetID} onChange={setTargetID} disabled={!seriesID || episodes.isLoading} placeholder={episodes.isLoading ? t('Loading…') : t('Select an episode')} options={(episodes.data ?? []).map((episode) => ({ value: episode.id, label: `S${episode.season_number} E${episode.episode_number} · ${episode.title}` }))} />
          </>}
        <AdminError error={movies.error || seriesList.error || episodes.error} />
      </AdminCard>
    </AdminSection>
    <AdminSection title={t('Source')}>
      <AdminCard>
        <OptionPicker label={t('File')} value={filePath} onChange={selectFile} placeholder={t('Select a file')} options={sources.map((entry) => ({ value: entry.file_path, label: entry.relative_path, subtitle: formatBytes(entry.size) }))} />
        <OptionPicker label={t('Stream')} value={streamIndex} onChange={(value) => selectStream(source, value)} disabled={!source} placeholder={t('Select a stream')} options={(source?.streams ?? []).map((stream) => ({ value: stream.index, label: streamLabel(stream) }))} />
      </AdminCard>
    </AdminSection>
    <AdminSection title={t('Track details')}>
      <AdminCard>
        <AdminField label={t('Language code')} value={language} onChangeText={setLanguage} placeholder="es" autoCapitalize="none" />
        <AdminField label={t('Label')} value={label} onChangeText={setLabel} placeholder={isAudio ? 'Español Latino' : 'Español'} />
        <AdminNumberField label={t('Delay (ms)')} value={delayMs} onChange={setDelayMs} help={t('Positive values play the track later.')} />
        {isAudio && <AdminNumberField label={t('Trim start (ms)')} value={trimStartMs} onChange={setTrimStartMs} help={t('Cuts this much from the start of the extracted audio.')} />}
        <AdminToggle label={t('Default track')} value={isDefault} onChange={setIsDefault} />
      </AdminCard>
    </AdminSection>
    {!!jobStatus && <AdminNotice text={t(jobStatusLabels[jobStatus] ?? jobStatus)} />}
    {!!message && <AdminNotice tone="good" text={message} />}
    {!!error && <AdminNotice tone="bad" text={error} />}
    <AdminButtons>
      <AdminButton variant="primary" icon={isAudio ? 'musical-notes-outline' : 'text-outline'} label={busy ? (isAudio ? t('Extracting…') : t('Importing…')) : isAudio ? t('Add audio track') : t('Add subtitle track')} busy={busy} disabled={!canImport} onPress={() => void submit()} />
    </AdminButtons>
  </View>;
}

function BulkImport({ isAudio, sources, streamLabel, runImport }: { isAudio: boolean; sources: Source[]; streamLabel: (stream: Stream) => string; runImport: ImportFn }) {
  const { t } = useI18n();
  const seriesList = useIngestSeriesList();
  const [seriesID, setSeriesID] = useState('');
  const [rows, setRows] = useState<BulkTrackRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState('');
  const [language, setLanguage] = useState('es');
  const [label, setLabel] = useState('Español');
  const [delayMs, setDelayMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const completed = useRef<string[]>([]);

  const loadSeries = async (id: string) => {
    setSeriesID(id); setRows([]); setRowsError(''); setMessage(''); setError('');
    if (!id) return;
    setRowsLoading(true);
    try {
      const episodes = await fetchSeriesEpisodes(id);
      setRows(inferBulkRows(episodes, sources, isAudio ? completed.current : [], isAudio));
    } catch (err) {
      setRowsError(errorMessage(err, t('Failed to load episodes.')));
    } finally {
      setRowsLoading(false);
    }
  };

  const patchRow = (targetId: string, patch: Partial<BulkTrackRow>) => setRows((list) => list.map((row) => row.targetId === targetId ? { ...row, ...patch } : row));
  const ready = rows.filter((row) => row.included && row.sourcePath && row.streamIndex >= 0 && row.status !== 'done');

  const submit = async () => {
    const queue = [...ready];
    if (!queue.length) return;
    setBusy(true); setMessage(''); setError('');
    setProgress({ current: 0, total: queue.length });
    let ok = 0;
    let failed = 0;
    for (const row of queue) {
      patchRow(row.targetId, { status: 'importing', error: '' });
      try {
        await runImport({
          target_type: 'episode',
          target_id: row.targetId,
          file_path: row.sourcePath,
          stream_index: row.streamIndex,
          label,
          language,
          default: false,
          delay_ms: delayMs,
          ...(isAudio ? { trim_start_ms: Math.max(0, trimStartMs) } : {}),
        });
        ok += 1;
        completed.current.push(`${row.sourcePath}:${row.targetId}`);
        patchRow(row.targetId, { status: 'done', included: false });
      } catch (err) {
        failed += 1;
        patchRow(row.targetId, { status: 'error', error: errorMessage(err, t('Import failed.')) });
      } finally {
        setProgress((value) => ({ ...value, current: value.current + 1 }));
      }
    }
    setBusy(false);
    setMessage(t('{count} tracks added.', { count: ok }));
    if (failed) setError(t('{count} tracks failed.', { count: failed }));
  };

  const sourceOptions = [{ value: '', label: t('Skip this episode') }, ...sources.map((entry) => ({ value: entry.file_path, label: entry.relative_path, subtitle: formatBytes(entry.size) }))];

  return <View>
    <AdminSection title={t('Series and track')}>
      <AdminCard>
        <OptionPicker label={t('Series')} value={seriesID} onChange={(value) => void loadSeries(value)} disabled={busy} placeholder={t('Select a series')} options={(seriesList.data ?? []).map((series) => ({ value: series.id, label: series.title }))} />
        <AdminField label={t('Language code')} value={language} onChangeText={setLanguage} autoCapitalize="none" editable={!busy} />
        <AdminField label={t('Label')} value={label} onChangeText={setLabel} editable={!busy} />
        <AdminNumberField label={t('Delay (ms)')} value={delayMs} onChange={setDelayMs} />
        {isAudio && <AdminNumberField label={t('Trim start (ms)')} value={trimStartMs} onChange={setTrimStartMs} />}
      </AdminCard>
    </AdminSection>
    <AdminSection title={t('Episode links')}>
      <Text style={[adminStyles.muted, styles.help]}>{t('Files are matched to episodes automatically. Check each link before importing.')}</Text>
      <AdminButtons>
        <AdminButton compact label={t('Include matched')} disabled={busy} onPress={() => setRows((list) => list.map((row) => row.sourcePath && row.streamIndex >= 0 && row.status !== 'done' ? { ...row, included: true } : row))} />
        <AdminButton compact label={t('Exclude all')} disabled={busy} onPress={() => setRows((list) => list.map((row) => row.status !== 'done' ? { ...row, included: false } : row))} />
      </AdminButtons>
      <AdminError error={rowsError || seriesList.error} />
      {rowsLoading ? <AdminLoading /> : !seriesID ? <AdminEmpty text={t('Choose a series to link its episodes.')} /> : !rows.length ? <AdminEmpty text={t('This series has no episodes.')} /> : rows.map((row) => {
        const rowSource = sources.find((entry) => entry.file_path === row.sourcePath);
        const locked = busy || row.status === 'done';
        const stateColor = row.status === 'error' ? '#fca5a5' : row.status === 'done' ? colors.success : row.matchKind ? '#67e8f9' : colors.warning;
        return <AdminCard key={row.targetId} style={!row.included ? styles.excluded : undefined}>
          <AdminToggle label={`S${row.seasonNumber} E${row.episodeNumber} · ${row.targetTitle}`} value={row.included} disabled={locked || !row.sourcePath} onChange={(value) => patchRow(row.targetId, { included: value })} />
          <Text style={[styles.state, { color: stateColor }]}>{bulkRowState(t, row)}</Text>
          <OptionPicker compact value={row.sourcePath} disabled={locked} placeholder={t('Skip this episode')} options={sourceOptions} onChange={(value) => {
            const src = sources.find((entry) => entry.file_path === value);
            patchRow(row.targetId, { sourcePath: value, streamIndex: src?.streams[0]?.index ?? -1, included: !!src, matchKind: '', status: '', error: '' });
          }} />
          <OptionPicker compact value={row.streamIndex} disabled={locked || !rowSource} placeholder={t('Select a stream')} options={(rowSource?.streams ?? []).map((stream) => ({ value: stream.index, label: streamLabel(stream) }))} onChange={(value) => patchRow(row.targetId, { streamIndex: value })} />
          {!!row.error && <Text style={styles.rowError}>{row.error}</Text>}
        </AdminCard>;
      })}
    </AdminSection>
    {!!message && <AdminNotice tone="good" text={message} />}
    {!!error && <AdminNotice tone="bad" text={error} />}
    <AdminButtons>
      <AdminButton variant="primary" icon="layers-outline" label={busy ? t('Importing {current}/{total}…', progress) : t('Import {count} tracks', { count: ready.length })} busy={busy} disabled={!ready.length} onPress={() => void submit()} />
    </AdminButtons>
  </View>;
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  help: { marginBottom: 2 },
  excluded: { opacity: .6 },
  state: { fontSize: 11, fontWeight: '700', marginTop: 6 },
  rowError: { color: '#fca5a5', fontSize: 12, marginTop: 6 },
});
