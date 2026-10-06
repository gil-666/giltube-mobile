import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { AdminButton, AdminButtons, AdminCard, AdminChips, AdminError, AdminField, AdminNotice, AdminSection, AdminToggle, adminStyles, formatBytes } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

import { attachIngest, bulkAttachIngestSeries, ingestKeys, previewIngestSeries, useIngestChannels, useIngestSeriesList } from './api';
import { canOpenAttach, canPreviewSeries, moveSeriesPreviewFile, normalizeSeriesPreview } from './helpers';
import { OptionPicker } from './OptionPicker';
import type { MediaIngest, SeriesPreviewFile } from './types';

/** Attach a finished download to a channel as a movie video, or bulk-attach a series pack. */
export function AttachPanel({ item, onDone }: { item: MediaIngest; onDone: (message: string) => void }) {
  const styles = useStyles();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const channels = useIngestChannels();
  const seriesList = useIngestSeriesList(item.media_type === 'series');
  const [channelID, setChannelID] = useState('');
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState('');
  const [filePath, setFilePath] = useState('');
  const [hidden, setHidden] = useState(false);
  const [seriesID, setSeriesID] = useState('');
  const [files, setFiles] = useState<SeriesPreviewFile[]>([]);
  const [previewNote, setPreviewNote] = useState('');

  const isSeries = item.media_type === 'series';
  const selectedSeries = seriesList.data?.find((series) => series.id === seriesID);
  const seasonCount = Math.max(1, Number(item.season_count || 1), Number(selectedSeries?.seasons || 0));
  const seasons = Array.from({ length: seasonCount }, (_, index) => index + 1);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ingestKeys.list });

  const preview = useMutation({
    mutationFn: () => previewIngestSeries(item.id),
    onSuccess: (data) => {
      const next = normalizeSeriesPreview((data?.files ?? []).map((file) => ({ ...file })));
      setFiles(next);
      setPreviewNote(next.length ? '' : t('No video files were found in this download.'));
    },
  });

  const attach = useMutation({
    mutationFn: () => attachIngest(item.id, {
      channel_id: channelID,
      title: title || item.title,
      description,
      file_path: filePath,
      hidden,
      series_id: seriesID,
      season_number: 1,
      episode_number: 1,
      episode_title: title || item.title,
      episode_synopsis: description,
    }),
    onSuccess: async () => { await refresh(); onDone(t('Attach queued. The video will appear once it finishes processing.')); },
  });

  const bulkAttach = useMutation({
    mutationFn: () => bulkAttachIngestSeries(item.id, {
      channel_id: channelID,
      title: title || item.title,
      description,
      hidden,
      series_id: seriesID,
      episodes: files.map((file) => ({
        file_path: file.file_path,
        season_number: file.season_number || 1,
        episode_number: file.episode_number || 1,
        episode_title: file.title || file.file_name || title || item.title,
        episode_synopsis: description,
      })),
    }),
    onSuccess: async () => { await refresh(); onDone(t('Series attach queued. Episodes will appear as they finish processing.')); },
  });

  const confirmAgain = (run: () => void) => {
    if (!item.attached_video_id) { run(); return; }
    Alert.alert(t('Attach again?'), t('"{title}" is already attached. Attaching again creates another copy.', { title: item.title }), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Attach again'), onPress: run },
    ]);
  };

  const updateFile = (path: string, patch: Partial<SeriesPreviewFile>, renumber = false) => setFiles((rows) => {
    const next = rows.map((file) => file.file_path === path ? { ...file, ...patch } : file);
    return renumber ? normalizeSeriesPreview(next) : next;
  });

  if (!canOpenAttach(item)) {
    return <AdminNotice tone="warn" text={t('Attaching is available once the download has finished and has a file path.')} />;
  }

  const channelOptions = (channels.data ?? []).map((channel) => ({ value: channel.id, label: channel.name, subtitle: channel.username ? `@${channel.username}` : undefined }));
  const seriesOptions = [{ value: '', label: t('Create a new series') }, ...(seriesList.data ?? []).map((series) => ({
    value: series.id,
    label: series.title,
    subtitle: t('{seasons} seasons · {episodes} episodes', { seasons: series.seasons || 1, episodes: series.episode_count || 0 }),
  }))];

  return <View>
    {!!item.attached_video_id && <AdminNotice tone="warn" text={t('This content has already been attached. You can proceed, but GilTube will create and transcode another copy from the source files.')} />}
    <AdminCard style={styles.topGap}>
      <AdminError error={channels.error} />
      <OptionPicker label={t('Channel')} value={channelID} onChange={setChannelID} placeholder={t('Select a channel')} options={channelOptions} />
      <AdminField label={t('Title')} value={title} onChangeText={setTitle} placeholder={item.title} />
      <AdminField label={t('Description')} value={description} onChangeText={setDescription} multiline />
      <AdminToggle label={t('Hidden')} value={hidden} onChange={setHidden} />
      {!isSeries && <AdminField label={t('File path override (optional)')} value={filePath} onChangeText={setFilePath} autoCapitalize="none" help={t('Leave empty to use the largest video file in the download.')} />}
    </AdminCard>

    {isSeries ? <AdminSection title={t('Series episodes')}>
      <AdminCard>
        <OptionPicker label={t('Series')} value={seriesID} onChange={(value) => { setSeriesID(value); setFiles((rows) => normalizeSeriesPreview(rows)); }} placeholder={t('Create a new series')} options={seriesOptions} />
        <Text style={[adminStyles.muted, styles.topGap]}>{selectedSeries ? t('Episodes will be appended to the selected series.') : t('A new series with {seasons} season(s) will be created.', { seasons: item.season_count || 1 })}</Text>
        <AdminButtons>
          <AdminButton icon="list-outline" label={preview.isPending ? t('Previewing…') : t('Preview episodes')} busy={preview.isPending} disabled={!canPreviewSeries(item)} onPress={() => preview.mutate()} />
        </AdminButtons>
        <AdminError error={preview.error} />
        {!!previewNote && <AdminNotice tone="warn" text={previewNote} />}
      </AdminCard>
      {!!files.length && <Text style={[adminStyles.muted, styles.count]}>{t('{count} files · {seasons} seasons', { count: files.length, seasons: item.season_count || 1 })}</Text>}
      {files.map((file) => <AdminCard key={file.file_path}>
        <View style={adminStyles.inlineRow}>
          <Text style={styles.episode}>S{file.season_number} E{file.episode_number}</Text>
          <TextInput value={file.title} onChangeText={(value) => updateFile(file.file_path, { title: value })} placeholder={t('Episode title')} placeholderTextColor={colors.textDim} selectionColor={colors.accentBright} style={styles.input} />
        </View>
        {seasons.length > 1 && <AdminChips value={String(file.season_number)} onChange={(value) => updateFile(file.file_path, { season_number: Number(value) }, true)} options={seasons.map((season) => ({ value: String(season), label: `S${season}` }))} />}
        <AdminButtons>
          <AdminButton compact icon="arrow-up" label={t('Move up')} onPress={() => setFiles((rows) => moveSeriesPreviewFile(rows, file.file_path, -1))} />
          <AdminButton compact icon="arrow-down" label={t('Move down')} onPress={() => setFiles((rows) => moveSeriesPreviewFile(rows, file.file_path, 1))} />
          <Text style={[adminStyles.muted, styles.size]}>{formatBytes(file.size)}</Text>
        </AdminButtons>
        <Text style={[adminStyles.mono, styles.topGap]}>{file.relative_path || file.file_name}</Text>
      </AdminCard>)}
      <AdminError error={bulkAttach.error} />
      <AdminButtons>
        <AdminButton variant="primary" icon="link-outline" label={bulkAttach.isPending ? t('Attaching…') : item.attached_video_id ? t('Attach episodes again') : t('Attach episodes')} busy={bulkAttach.isPending} disabled={!channelID || !files.length || !canPreviewSeries(item)} onPress={() => confirmAgain(() => bulkAttach.mutate())} />
      </AdminButtons>
    </AdminSection> : <>
      <AdminError error={attach.error} />
      <AdminButtons>
        <AdminButton variant="primary" icon="link-outline" label={attach.isPending ? t('Attaching…') : item.attached_video_id ? t('Attach again') : t('Attach')} busy={attach.isPending} disabled={!channelID} onPress={() => confirmAgain(() => attach.mutate())} />
      </AdminButtons>
    </>}
  </View>;
}

const useStyles = makeStyles(() => ({
  topGap: { marginTop: 8 },
  count: { marginBottom: 8 },
  episode: { color: colors.text, fontSize: 13, fontWeight: '900', minWidth: 58 },
  input: { flex: 1, minHeight: 38, borderRadius: radii.md, backgroundColor: colors.canvas, color: colors.text, fontSize: 13, paddingHorizontal: 10 },
  size: { alignSelf: 'center' },
}));
