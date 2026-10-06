import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { musicAPI, useInvalidateMusic, useMusicCatalog } from '@/admin/music/api';
import { MusicArtwork, MusicSelect, pickAudioFiles } from '@/admin/music/components';
import { errorMessage, isAllowedAudio, isValidDate, naturalCompare, RELEASE_TYPES, releaseTypeLabel } from '@/admin/music/helpers';
import { ImportTrackRow, type ImportItem } from '@/admin/music/ImportTrackRow';
import { readAudioTags, type ParsedAudioTags } from '@/admin/music/tags';
import type { LocalMusicFile, MusicReleaseInput, MusicReleaseType } from '@/admin/music/types';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminField, AdminLoading, AdminNotice, AdminProgress, AdminScreen, AdminSection, AdminToggle } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

// Quick upload: pick audio files, read their embedded tags, confirm the
// album details, then create (or reuse) the artist, create the release and
// upload every track — the same three steps as the web wizard.

type Step = 'files' | 'details' | 'review';
type QuickItem = ImportItem & { tags: ParsedAudioTags };
type QuickForm = Omit<MusicReleaseInput, 'artist_id'> & { artist: string };

const emptyForm = (): QuickForm => ({ artist: '', title: '', release_type: 'album', release_date: '', label: '', copyright_text: '', phonogram_text: '', territories: 'Worldwide', rights_confirmed: false });

export default function MusicQuickUploadScreen() {
  const { t } = useI18n();
  const catalog = useMusicCatalog();
  const invalidate = useInvalidateMusic();
  const [step, setStep] = useState<Step>('files');
  const [items, setItems] = useState<QuickItem[]>([]);
  const [reading, setReading] = useState(false);
  const [form, setForm] = useState<QuickForm>(emptyForm);
  const [tagSource, setTagSource] = useState('');
  const [cover, setCover] = useState<LocalMusicFile | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [releaseID, setReleaseID] = useState('');
  const [message, setMessage] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  const tagChoices = useMemo(() => items
    .filter((item) => item.tags.artist || item.tags.album || item.tags.date || item.tags.cover)
    .map((item) => ({ value: item.key, label: item.title, subtitle: [item.tags.artist, item.tags.album].filter(Boolean).join(' · ') || undefined })), [items]);

  const set = <K extends keyof QuickForm>(key: K, value: QuickForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const applyTagSource = (key: string, list: QuickItem[] = items) => {
    const source = list.find((item) => item.key === key) || list[0];
    setTagSource(key);
    if (!source) return;
    setForm((current) => ({
      ...current,
      artist: source.tags.artist || current.artist,
      title: source.tags.album || source.tags.title || current.title,
      release_date: source.tags.date && /^\d{4}-\d{2}-\d{2}$/.test(source.tags.date) ? source.tags.date : source.tags.date ? `${source.tags.date.slice(0, 4)}-01-01` : current.release_date,
    }));
    if (source.tags.cover) setCover(source.tags.cover);
  };

  const choose = async () => {
    const files = await pickAudioFiles(true);
    if (!files.length) return;
    const accepted = files.filter((file) => isAllowedAudio(file.name)).sort((left, right) => naturalCompare(left.name, right.name));
    const skipped = files.length - accepted.length;
    setReading(true);
    setMessage(null);
    // Let the spinner render before the synchronous tag reads.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const parsed = accepted.map((file, index): QuickItem => {
        const tags = readAudioTags(file);
        return { key: `${file.uri}-${index}`, file, title: tags.title, discNumber: tags.discNumber || 1, trackNumber: tags.trackNumber || index + 1, trackID: '', status: 'pending', error: '', tags };
      });
      parsed.sort((left, right) => left.discNumber - right.discNumber || left.trackNumber - right.trackNumber || naturalCompare(left.file.name, right.file.name));
      setItems(parsed);
      setCover(null);
      setForm(emptyForm());
      const firstWithTags = parsed.find((item) => item.tags.artist || item.tags.album || item.tags.date || item.tags.cover) || parsed[0];
      if (firstWithTags) applyTagSource(firstWithTags.key, parsed);
      if (skipped) setMessage({ tone: 'warn', text: t('Skipped {count} files that are not MP3, M4A, AAC, WAV, FLAC, OGG or Opus.', { count: skipped }) });
    } finally {
      setReading(false);
    }
  };

  const update = (key: string, patch: Partial<QuickItem>) => setItems((list) => list.map((item) => item.key === key ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => setItems((list) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    return next.map((entry, position) => entry.trackID ? entry : { ...entry, trackNumber: position + 1 });
  });

  const next = () => {
    setMessage(null);
    if (step === 'files') { setStep('details'); return; }
    if (step === 'details') {
      if (!form.artist.trim() || !form.title.trim()) { setMessage({ tone: 'bad', text: t('Artist and release title are required.') }); return; }
      if (!isValidDate(form.release_date.trim())) { setMessage({ tone: 'bad', text: t('Use the date format YYYY-MM-DD.') }); return; }
      setStep('review');
      return;
    }
    void runImport();
  };

  const runImport = async () => {
    if (!items.length || importing) return;
    if (items.some((item) => !item.title.trim())) { setMessage({ tone: 'bad', text: t('Every track needs a title.') }); return; }
    setImporting(true);
    setMessage(null);
    setProgress(0);
    let failed = 0;
    let coverApplied = false;
    let targetRelease = releaseID;
    const working = [...items];
    try {
      if (!targetRelease) {
        const artistName = form.artist.trim();
        const artist = catalog.artists.find((item) => item.name.toLowerCase() === artistName.toLowerCase())
          || await musicAPI.createArtist({ name: artistName, bio: '', primary_channel_id: '', verified: false });
        const release = await musicAPI.createRelease({
          artist_id: artist.id, title: form.title.trim(), release_type: form.release_type, release_date: form.release_date.trim(), label: form.label.trim(),
          copyright_text: form.copyright_text.trim(), phonogram_text: form.phonogram_text.trim(), territories: form.territories.trim() || 'Worldwide', rights_confirmed: form.rights_confirmed,
        });
        targetRelease = release.id;
        setReleaseID(release.id);
        if (cover) {
          try {
            await musicAPI.uploadReleaseCover(release.id, cover);
            coverApplied = true;
          } catch {
            // The embedded cover is optional; the track artwork fallback below can still apply.
          }
        }
      } else {
        coverApplied = true;
      }

      for (let index = 0; index < working.length; index += 1) {
        const item = working[index];
        if (!item || item.status === 'done') continue;
        update(item.key, { status: 'uploading', error: '' });
        try {
          let trackID = item.trackID;
          if (!trackID) {
            const track = await musicAPI.createTrack({ release_id: targetRelease, title: item.title.trim(), disc_number: item.discNumber || 1, track_number: item.trackNumber || index + 1, duration_seconds: 0, isrc: '', explicit: false, language: '' });
            trackID = track.id;
            working[index] = { ...item, trackID };
            update(item.key, { trackID });
          }
          await musicAPI.uploadTrackAudio(trackID, item.file, (percent) => setProgress(Math.round(((index + percent / 100) / working.length) * 100)));
          if (!coverApplied) {
            try {
              await musicAPI.coverFromTrack(targetRelease, trackID);
              coverApplied = true;
            } catch {
              // Embedded artwork is optional; keep importing.
            }
          }
          update(item.key, { status: 'done' });
          setProgress(Math.round(((index + 1) / working.length) * 100));
        } catch (error) {
          failed += 1;
          update(item.key, { status: 'error', error: errorMessage(error) });
        }
      }
      await invalidate();
    } catch (error) {
      setMessage({ tone: 'bad', text: errorMessage(error) });
      setImporting(false);
      return;
    }
    setImporting(false);
    if (failed) {
      setMessage({ tone: 'bad', text: t('{count} tracks need attention. Fix them and import again to retry.', { count: failed }) });
      return;
    }
    router.replace({ pathname: '/admin/music/releases/[id]', params: { id: targetRelease } });
  };

  const back = () => {
    setMessage(null);
    if (step === 'review') setStep('details');
    else if (step === 'details') setStep('files');
    else router.back();
  };

  const stepTitle = step === 'details' ? t('Album details') : step === 'review' ? t('Review tracks') : t('Select audio files');
  const primaryLabel = importing ? t('Uploading {percent}%', { percent: progress })
    : step === 'files' ? t('Continue')
      : step === 'details' ? t('Review tracks')
        : releaseID ? t('Retry failed tracks') : t('Create release and upload {count} tracks', { count: items.length });
  const canAdvance = step === 'files' ? items.length > 0 : step === 'details' ? !!(form.artist.trim() && form.title.trim()) : items.length > 0;
  const existingArtist = catalog.artists.find((item) => item.name.toLowerCase() === form.artist.trim().toLowerCase());

  return <AdminScreen title={t('Quick upload')} subtitle={stepTitle}>
    {step === 'files' && <AdminSection title={t('Audio files')} right={<AdminButton compact icon="folder-open-outline" label={items.length ? t('Choose again') : t('Choose files')} disabled={reading} onPress={() => void choose()} />}>
      <Text style={styles.help}>{t('Pick the album’s audio files. Titles, track numbers, album details and cover art are read from their tags when present.')}</Text>
      {reading ? <AdminLoading /> : items.length ? items.map((item) => <View key={item.key} style={styles.fileRow}>
        <Text style={styles.position}>{item.trackNumber}</Text>
        <View style={styles.fileCopy}>
          <Text numberOfLines={2} style={styles.fileTitle}>{item.title}</Text>
          <Text numberOfLines={1} style={styles.fileName}>{item.file.name}</Text>
        </View>
        <AdminBadge label={item.tags.album || item.tags.artist ? t('Tags found') : t('From file name')} tone={item.tags.album || item.tags.artist ? 'good' : 'neutral'} />
      </View>) : <AdminEmpty text={t('No files selected.')} />}
    </AdminSection>}

    {step === 'details' && <AdminSection title={t('Album details')}>
      <AdminCard>
        {tagChoices.length > 1 && <MusicSelect label={t('Use tags from')} value={tagSource} options={tagChoices} onChange={(value) => applyTagSource(value)} />}
        <AdminField label={t('Artist')} value={form.artist} onChangeText={(value) => set('artist', value)} autoCapitalize="words" help={form.artist.trim() ? existingArtist ? t('Uses the existing artist {name}.', { name: existingArtist.name }) : t('A new artist is created.') : undefined} />
        <AdminField label={t('Release title')} value={form.title} onChangeText={(value) => set('title', value)} autoCapitalize="words" />
        <AdminChips<MusicReleaseType> label={t('Release type')} value={form.release_type} onChange={(value) => set('release_type', value)} options={RELEASE_TYPES.map((type) => ({ value: type, label: releaseTypeLabel(t, type) }))} />
        <AdminField label={t('Release date')} value={form.release_date} onChangeText={(value) => set('release_date', value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" help={t('Optional.')} />
        <AdminField label={t('Record label')} value={form.label} onChangeText={(value) => set('label', value)} />
        <AdminField label={t('Copyright line')} value={form.copyright_text} onChangeText={(value) => set('copyright_text', value)} placeholder="© 2026 Rights holder" />
        <AdminField label={t('Phonogram line')} value={form.phonogram_text} onChangeText={(value) => set('phonogram_text', value)} placeholder="℗ 2026 Rights holder" />
        <AdminField label={t('Territories')} value={form.territories} onChangeText={(value) => set('territories', value)} placeholder={t('Worldwide, or country codes like US, MX')} />
        {!!cover && <View style={styles.coverRow}>
          <MusicArtwork localURI={cover.uri} size={72} />
          <View style={styles.fileCopy}>
            <Text style={styles.fileTitle}>{t('Embedded cover found')}</Text>
            <Text style={styles.fileName}>{t('It becomes the release cover.')}</Text>
          </View>
          <AdminButton compact label={t('Remove')} onPress={() => setCover(null)} />
        </View>}
        <AdminToggle label={t('I confirm GilTube has the rights to distribute this release')} value={form.rights_confirmed} onChange={(value) => set('rights_confirmed', value)} />
      </AdminCard>
    </AdminSection>}

    {step === 'review' && <AdminSection title={t('Review tracks')}>
      <AdminCard>
        <Text style={styles.fileTitle}>{form.title}</Text>
        <Text style={styles.fileName}>{form.artist} · {t('{count} tracks', { count: items.length })}</Text>
      </AdminCard>
      <Text style={styles.help}>{t('Adjust disc and track numbers, titles and order before uploading.')}</Text>
      {items.map((item, index) => <ImportTrackRow key={item.key} item={item} editNumbers first={index === 0} last={index === items.length - 1} locked={importing} onChange={(patch) => update(item.key, patch)} onMove={(direction) => move(index, direction)} />)}
    </AdminSection>}

    {progress > 0 && <AdminProgress value={progress} label={`${progress}%`} />}
    {!!message && <AdminNotice tone={message.tone} text={message.text} />}
    <AdminButtons>
      <AdminButton icon="chevron-back" label={step === 'files' ? t('Cancel') : t('Back')} disabled={importing || (step !== 'review' && !!releaseID)} onPress={back} />
      <AdminButton variant="primary" icon={step === 'review' ? 'cloud-upload-outline' : 'chevron-forward'} label={primaryLabel} busy={importing} disabled={!canAdvance || reading} onPress={next} />
    </AdminButtons>
    {!!releaseID && !importing && <AdminButtons>
      <AdminButton icon="disc-outline" label={t('Open release')} onPress={() => router.replace({ pathname: '/admin/music/releases/[id]', params: { id: releaseID } })} />
    </AdminButtons>}
  </AdminScreen>;
}

const styles = StyleSheet.create({
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  position: { width: 26, color: colors.textMuted, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  fileCopy: { flex: 1, minWidth: 0 },
  fileTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  fileName: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
});
