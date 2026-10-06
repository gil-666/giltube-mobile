import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AdminButton, AdminButtons, AdminCard, AdminChips, AdminError, AdminField, AdminNotice, AdminNumberField, AdminProgress, AdminScreen, AdminSection, adminStyles, formatBytes } from '@/admin/ui';
import { createIngest, createUploadedIngest, ingestKeys } from '@/admin/ingest/api';
import type { IngestMediaType } from '@/admin/ingest/types';
import { uploadFileChunks } from '@/api/upload';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';

type Mode = 'torrent' | 'upload';
type UploadRow = { key: string; uri: string; name: string; size: number; progress: number; status: string };

// Same accept list as the web upload dialog (backend checks the extension too).
const UPLOAD_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.mpg', '.mpeg', '.wmv', '.mka', '.aac', '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus', '.ac3', '.eac3', '.dts', '.ts', '.m2ts', '.srt', '.ass', '.vtt']);

export default function NewMediaIngestScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('torrent');
  const [mediaType, setMediaType] = useState<IngestMediaType>('movie');
  const [title, setTitle] = useState('');
  const [yearText, setYearText] = useState('');
  const year = parseInt(yearText, 10) || 0;
  const [seasonCount, setSeasonCount] = useState(1);
  const [sourceURL, setSourceURL] = useState('');
  const [files, setFiles] = useState<UploadRow[]>([]);
  const [pickError, setPickError] = useState('');

  const done = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ingestKeys.list });
    router.replace({ pathname: '/admin/media-ingests/[id]', params: { id } });
  };

  const queue = useMutation({
    mutationFn: () => createIngest({
      media_type: mediaType,
      title: title.trim(),
      year: year || undefined,
      season_count: mediaType === 'series' ? Math.max(1, seasonCount) : 1,
      source_url: sourceURL.trim(),
    }),
    onSuccess: (data) => done(data.id),
  });

  const updateRow = (key: string, patch: Partial<UploadRow>) => setFiles((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));

  const upload = useMutation({
    mutationFn: async () => {
      const uploaded: { upload_id: string; file_name: string }[] = [];
      for (const row of files) {
        updateRow(row.key, { status: t('Uploading…'), progress: 0 });
        const { sessionID } = await uploadFileChunks({ uri: row.uri, name: row.name, size: row.size }, (fraction) => updateRow(row.key, { progress: Math.round(fraction * 100) }));
        updateRow(row.key, { status: t('Ready'), progress: 100 });
        uploaded.push({ upload_id: sessionID, file_name: row.name });
      }
      return createUploadedIngest({
        media_type: mediaType,
        title: title.trim(),
        year: year || undefined,
        season_count: mediaType === 'series' ? Math.max(1, seasonCount) : 1,
        files: uploaded,
      });
    },
    onSuccess: (data) => done(data.id),
  });

  const busy = queue.isPending || upload.isPending;

  const pickFiles = async () => {
    setPickError('');
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const next = [...files];
    const existing = new Set(next.map((row) => row.key));
    for (const asset of result.assets) {
      const extension = `.${asset.name.split('.').pop()?.toLowerCase() ?? ''}`;
      if (!asset.size || !UPLOAD_EXTENSIONS.has(extension)) {
        setPickError(t('{name} is not a supported media file.', { name: asset.name }));
        continue;
      }
      const key = `${asset.name}:${asset.size}:${asset.lastModified ?? ''}`;
      if (existing.has(key)) continue;
      existing.add(key);
      next.push({ key, uri: asset.uri, name: asset.name, size: asset.size, progress: 0, status: '' });
    }
    setFiles(next);
    if (!title && next.length === 1) setTitle(next[0].name.replace(/\.[^.]+$/, ''));
  };

  return <AdminScreen title={t('New ingest')} subtitle={t('Download torrents or upload files, then attach them as movies or series.')}>
    <AdminChips value={mode} onChange={(value) => !busy && setMode(value)} options={[
      { value: 'torrent', label: t('Magnet or torrent URL') },
      { value: 'upload', label: t('Upload files') },
    ]} />

    <AdminSection title={t('Details')}>
      <AdminCard>
        <AdminChips label={t('Media type')} value={mediaType} onChange={(value) => !busy && setMediaType(value)} options={[
          { value: 'movie', label: t('Movie') },
          { value: 'series', label: t('Series') },
        ]} />
        <AdminField label={mode === 'torrent' ? t('Title') : t('Title (optional)')} value={title} onChangeText={setTitle} editable={!busy} />
        <AdminField label={t('Year')} value={yearText} onChangeText={(text) => setYearText(text.replace(/[^0-9]/g, ''))} keyboardType="number-pad" autoCapitalize="none" editable={!busy} />
        {mediaType === 'series' && <AdminNumberField label={t('Seasons')} value={seasonCount} onChange={setSeasonCount} />}
      </AdminCard>
    </AdminSection>

    {mode === 'torrent' ? <AdminSection title={t('Source')}>
      <AdminCard>
        <AdminField label={t('Magnet link or torrent URL')} value={sourceURL} onChangeText={setSourceURL} placeholder="magnet:?xt=…" autoCapitalize="none" editable={!busy} help={t('Only use sources you are authorized to download.')} />
      </AdminCard>
      <AdminError error={queue.error} />
      <AdminButtons>
        <AdminButton variant="primary" icon="cloud-download-outline" label={queue.isPending ? t('Queueing…') : t('Queue download')} busy={queue.isPending} disabled={!title.trim() || !sourceURL.trim()} onPress={() => queue.mutate()} />
      </AdminButtons>
    </AdminSection> : <AdminSection title={t('Files')} right={<Text style={adminStyles.muted}>{t('{count} selected', { count: files.length })}</Text>}>
      <AdminNotice text={t('Video, audio and subtitle files are uploaded to the server and added as a ready-to-attach ingest. Keep the app open until it finishes.')} />
      {files.map((row) => <AdminCard key={row.key}>
        <View style={adminStyles.inlineRow}>
          <View style={styles.copy}>
            <Text numberOfLines={2} style={styles.fileName}>{row.name}</Text>
            <Text style={adminStyles.muted}>{[formatBytes(row.size), row.status].filter(Boolean).join(' · ')}</Text>
          </View>
          {!busy && <AdminButton compact icon="close" label={t('Remove')} onPress={() => setFiles((rows) => rows.filter((item) => item.key !== row.key))} />}
        </View>
        {(busy || row.progress > 0) && <AdminProgress value={row.progress} />}
      </AdminCard>)}
      {!!pickError && <AdminNotice tone="bad" text={pickError} />}
      <AdminError error={upload.error} />
      <AdminButtons>
        <AdminButton icon="document-attach-outline" label={t('Choose files')} disabled={busy} onPress={() => void pickFiles()} />
        <AdminButton variant="primary" icon="cloud-upload-outline" label={upload.isPending ? t('Uploading…') : t('Upload and create ingest')} busy={upload.isPending} disabled={!files.length} onPress={() => upload.mutate()} />
      </AdminButtons>
    </AdminSection>}
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  copy: { flex: 1, minWidth: 0 },
  fileName: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
}));
