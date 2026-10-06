import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { opsAPI, type PlaybackIntro } from '@/admin/ops/api';
import { AdminButton, AdminButtons, AdminCard, AdminError, AdminLoading, AdminNotice, AdminScreen, AdminSection, AdminToggle, adminStyles, alertError, confirmAction, formatBytes, pickFile, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

const INTRO_KEY = ['admin', 'ops', 'playback-intro'] as const;
const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED = /\.(mp4|m4v|webm)$/i;

export default function PlaybackIntroAdminScreen() {
  const styles = useStyles();
  const { t, dateTime } = useI18n();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const intro = useQuery({ queryKey: INTRO_KEY, queryFn: opsAPI.playbackIntro, enabled: isAdmin });
  const [file, setFile] = useState<DocumentPickerAsset | null>(null);
  const [message, setMessage] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const store = (data: PlaybackIntro) => client.setQueryData(INTRO_KEY, data);

  const upload = useMutation({
    mutationFn: (asset: DocumentPickerAsset) => opsAPI.uploadPlaybackIntro(asset),
    onMutate: () => setMessage(''),
    onSuccess: (data) => { store(data); setFile(null); setPreviewing(false); setMessage(t('Intro uploaded and enabled. Viewers will fetch the new version on their next movie or episode.')); },
    onError: alertError(t, 'Failed to upload intro'),
  });
  const settings = useMutation({
    mutationFn: (patch: { enabled?: boolean; allow_skip?: boolean }) => opsAPI.updatePlaybackIntro(patch),
    onMutate: () => setMessage(''),
    onSuccess: (data) => { store(data); setMessage(t('Intro settings saved.')); },
    onError: (error) => { alertError(t, 'Failed to save intro settings')(error); void intro.refetch(); },
  });
  const remove = useMutation({
    mutationFn: opsAPI.deletePlaybackIntro,
    onMutate: () => setMessage(''),
    onSuccess: (data) => { store(data); setPreviewing(false); setMessage(t('Intro removed.')); },
    onError: alertError(t, 'Failed to remove intro'),
  });

  const choose = async () => {
    const asset = await pickFile(['video/mp4', 'video/webm', 'video/x-m4v']);
    if (!asset) return;
    if (!ALLOWED.test(asset.name)) return alertError(t)(new Error(t('Intro must be an .mp4, .m4v or .webm file.')));
    if (asset.size && asset.size > MAX_BYTES) return alertError(t)(new Error(t('Intro must be smaller than 500 MB.')));
    setFile(asset);
  };

  const data = intro.data;
  const busy = upload.isPending || settings.isPending || remove.isPending;
  return <AdminScreen title={t('Playback intro')} subtitle={t('A short clip played before every movie and series episode.')} refreshing={intro.isRefetching} onRefresh={() => void intro.refetch()}>
    <AdminNotice text={t('Viewers download the intro once and keep it cached until you replace it.')} />
    {!!message && <AdminNotice tone="good" text={message} />}
    <AdminError error={intro.error} />

    <AdminSection title={t('Current intro')}>
      {intro.isLoading ? <AdminLoading /> : <AdminCard>
        {data?.url ? <>
          {previewing ? <IntroPreview key={data.version} url={resolveMediaURL(data.url)} /> : <AdminButtons><AdminButton icon="play" label={t('Preview')} onPress={() => setPreviewing(true)} /></AdminButtons>}
          <Text style={[adminStyles.muted, styles.meta]}>{t('{size} · version {version} · updated {date}', { size: formatBytes(data.size), version: data.version, date: data.updated_at ? dateTime(data.updated_at) : '—' })}</Text>
        </> : <Text style={adminStyles.muted}>{t('No intro uploaded')}</Text>}
      </AdminCard>}
    </AdminSection>

    <AdminSection title={data?.url ? t('Replace intro') : t('Upload intro')}>
      <AdminCard>
        <Text style={adminStyles.muted}>{t('MP4 (H.264/AAC) or WebM, up to 500 MB. Keep it short — it plays before every title.')}</Text>
        {!!file && <Text style={[adminStyles.text, styles.meta]} numberOfLines={2}>{file.name}{file.size ? ` · ${formatBytes(file.size)}` : ''}</Text>}
        <AdminButtons>
          <AdminButton icon="folder-open-outline" label={file ? t('Choose another') : t('Choose video')} disabled={busy} onPress={() => void choose()} />
          <AdminButton variant="primary" icon="cloud-upload-outline" label={upload.isPending ? t('Uploading…') : t('Upload')} busy={upload.isPending} disabled={!file || busy} onPress={() => file && upload.mutate(file)} />
        </AdminButtons>
        {upload.isPending && <Text style={[adminStyles.muted, styles.meta]}>{t('Keep the app open until the upload finishes.')}</Text>}
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Settings')}>
      <AdminCard>
        <AdminToggle label={t('Play intro before movies and episodes')} value={!!data?.enabled} disabled={!data?.url || busy} onChange={(enabled) => settings.mutate({ enabled })} />
        <AdminToggle label={t('Let viewers skip the intro')} value={!!data?.allow_skip} disabled={!data || busy} onChange={(allow_skip) => settings.mutate({ allow_skip })} />
        {!!data?.url && <AdminButtons>
          <AdminButton variant="danger" icon="trash-outline" label={t('Remove intro')} disabled={busy} busy={remove.isPending} onPress={() => confirmAction(t, t('Remove intro?'), t('Remove the playback intro? Movies and episodes will start immediately.'), () => remove.mutate(), 'Remove')} />
        </AdminButtons>}
      </AdminCard>
    </AdminSection>
  </AdminScreen>;
}

function IntroPreview({ url }: { url: string }) {
  const styles = useStyles();
  const player = useVideoPlayer(url, (instance) => { instance.loop = false; instance.play(); });
  return <View style={styles.player}>
    <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" />
  </View>;
}

const useStyles = makeStyles(() => ({
  meta: { marginTop: 8 },
  player: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.black },
}));
