import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { musicAPI, useInvalidateMusic, useMusicCatalog } from '@/admin/music/api';
import { MusicSelect, pickAudioFiles } from '@/admin/music/components';
import { errorMessage, inferredTrackTitle, isAllowedAudio, naturalCompare, nextTrackNumber } from '@/admin/music/helpers';
import { ImportTrackRow, type ImportItem } from '@/admin/music/ImportTrackRow';
import { AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminField, AdminLoading, AdminNotice, AdminNumberField, AdminProgress, AdminScreen, AdminSection, AdminToggle } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';

// Bulk import: pick several audio files for one release; each becomes a
// track (title from the file name) and its master is uploaded in order.

export default function MusicImportScreen() {
  const styles = useStyles();
  const { release: releaseParam } = useLocalSearchParams<{ release?: string }>();
  const { t } = useI18n();
  const catalog = useMusicCatalog();
  const invalidate = useInvalidateMusic();
  const [chosenReleaseID, setReleaseID] = useState(releaseParam || '');
  const [disc, setDisc] = useState(1);
  const [language, setLanguage] = useState('');
  const [explicit, setExplicit] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  const releaseID = chosenReleaseID || catalog.releases[0]?.id || '';

  // Once any track exists the release/disc are fixed (web parity).
  const locked = importing || items.some((item) => !!item.trackID);

  const renumber = (list: ImportItem[], targetRelease = releaseID, targetDisc = disc) => {
    const start = nextTrackNumber(catalog.tracks, targetRelease, targetDisc);
    return list.map((item, index) => item.trackID ? item : { ...item, discNumber: targetDisc, trackNumber: start + index });
  };

  const choose = async () => {
    const files = await pickAudioFiles(true);
    if (!files.length) return;
    const rejected = files.filter((file) => !isAllowedAudio(file.name));
    const accepted = files.filter((file) => isAllowedAudio(file.name)).sort((left, right) => naturalCompare(left.name, right.name));
    setMessage(rejected.length ? { tone: 'warn', text: t('Skipped {count} files that are not MP3, M4A, AAC, WAV, FLAC, OGG or Opus.', { count: rejected.length }) } : null);
    setProgress(0);
    setItems(renumber(accepted.map((file, index) => ({ key: `${file.uri}-${index}`, file, title: inferredTrackTitle(file.name), discNumber: disc, trackNumber: 0, trackID: '', status: 'pending', error: '' }))));
  };

  const update = (key: string, patch: Partial<ImportItem>) => setItems((list) => list.map((item) => item.key === key ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => setItems((list) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    return renumber(next);
  });
  const remove = (index: number) => setItems((list) => renumber(list.filter((_, itemIndex) => itemIndex !== index)));

  const runImport = async () => {
    if (!releaseID || !items.length || importing) return;
    if (items.some((item) => !item.title.trim())) { setMessage({ tone: 'bad', text: t('Every track needs a title.') }); return; }
    setImporting(true);
    setMessage(null);
    let failed = 0;
    const working = [...items];
    try {
      for (let index = 0; index < working.length; index += 1) {
        const item = working[index];
        if (!item || item.status === 'done') continue;
        setCurrent(index + 1);
        let trackID = item.trackID;
        update(item.key, { status: 'uploading', error: '' });
        try {
          if (!trackID) {
            const created = await musicAPI.createTrack({ release_id: releaseID, title: item.title.trim(), disc_number: disc, track_number: item.trackNumber, duration_seconds: 0, isrc: '', explicit, language: language.trim() });
            trackID = created.id;
            working[index] = { ...item, trackID };
            update(item.key, { trackID });
          }
          await musicAPI.uploadTrackAudio(trackID, item.file, (percent) => setProgress(Math.round(((index + percent / 100) / working.length) * 100)));
          update(item.key, { status: 'done' });
          setProgress(Math.round(((index + 1) / working.length) * 100));
        } catch (error) {
          failed += 1;
          update(item.key, { status: 'error', error: errorMessage(error) });
        }
      }
      await invalidate();
    } finally {
      setImporting(false);
    }
    if (failed) {
      setMessage({ tone: 'bad', text: t('{count} tracks need attention. Fix them and import again to retry.', { count: failed }) });
      return;
    }
    setMessage({ tone: 'good', text: t('Imported {count} tracks.', { count: working.length }) });
    setTimeout(() => router.back(), 900);
  };

  if (catalog.loading) return <AdminScreen title={t('Import tracks')}><AdminLoading /></AdminScreen>;
  if (!catalog.releases.length) return <AdminScreen title={t('Import tracks')}><AdminEmpty text={t('Create a release first.')} /></AdminScreen>;

  return <AdminScreen title={t('Import tracks')} subtitle={t('Add several audio files to one release')}>
    <AdminSection title={t('Release')}>
      <AdminCard>
        <MusicSelect label={t('Release')} value={releaseID} disabled={locked} options={catalog.releases.map((item) => ({ value: item.id, label: item.title, subtitle: item.artist_name }))} onChange={(value) => { setReleaseID(value); setItems((list) => renumber(list, value)); }} />
        <AdminNumberField label={t('Disc')} value={disc} onChange={(value) => { if (locked) return; const next = Math.max(1, value || 1); setDisc(next); setItems((list) => renumber(list, releaseID, next)); }} />
        <AdminField label={t('Language (optional)')} value={language} onChangeText={setLanguage} autoCapitalize="none" placeholder={t('e.g. en, es')} />
        <AdminToggle label={t('Mark all as explicit')} value={explicit} onChange={setExplicit} />
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Audio files')} right={<AdminButton compact icon="folder-open-outline" label={items.length ? t('Choose again') : t('Choose files')} disabled={locked} onPress={() => void choose()} />}>
      <Text style={styles.help}>{t('Files are sorted by name and numbered after the release’s last track. Titles come from the file names.')}</Text>
      {items.length ? items.map((item, index) => <ImportTrackRow key={item.key} item={item} first={index === 0} last={index === items.length - 1} locked={locked} onChange={(patch) => update(item.key, patch)} onMove={(direction) => move(index, direction)} onRemove={() => remove(index)} />) : <AdminEmpty text={t('No files selected.')} />}
    </AdminSection>

    {progress > 0 && <AdminProgress value={progress} label={importing ? t('Importing {current} of {total}…', { current, total: items.length }) : `${progress}%`} />}
    {!!message && <AdminNotice tone={message.tone} text={message.text} />}
    <AdminButtons>
      <AdminButton variant="primary" icon="cloud-upload-outline" label={importing ? t('Importing {current} of {total}…', { current, total: items.length }) : t('Import {count} tracks', { count: items.length })} busy={importing} disabled={!items.length || !releaseID} onPress={() => void runImport()} />
    </AdminButtons>
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
}));
