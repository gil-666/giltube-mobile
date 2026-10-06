import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { ChannelPicker } from '@/admin/ops/ChannelPicker';
import { MirrorImportError, opsAPI, type MirrorChannel } from '@/admin/ops/api';
import { AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminRow, AdminScreen, AdminSection, AdminToggle, adminStyles, alertError, confirmAction, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';

const MAPPINGS_KEY = ['admin', 'ops', 'youtube-mirrors'] as const;

const blankImport = { url: '', giltubeChannelID: '', explicit: false, hidden: false, createNewChannel: false, copyChannelInfo: false };
const blankMapping = { youtubeChannelID: '', youtubeChannelTitle: '', youtubeChannelURL: '', giltubeChannelID: '', createNewChannel: false };

export default function YouTubeMirrorsAdminScreen() {
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const mappings = useQuery({ queryKey: MAPPINGS_KEY, queryFn: opsAPI.mirrorChannels, enabled: isAdmin });
  const [importForm, setImportForm] = useState(blankImport);
  const [mappingForm, setMappingForm] = useState(blankMapping);
  const [importMessage, setImportMessage] = useState('');
  const [detected, setDetected] = useState<{ id: string; title: string } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: MAPPINGS_KEY });

  const startImport = useMutation({
    mutationFn: () => opsAPI.importMirrorVideo({
      url: importForm.url.trim(), giltube_channel_id: importForm.createNewChannel ? '' : importForm.giltubeChannelID,
      explicit: importForm.explicit, hidden: importForm.hidden, create_new_channel: importForm.createNewChannel, copy_channel_info: importForm.copyChannelInfo,
    }),
    onMutate: () => { setImportMessage(''); setDetected(null); },
    onSuccess: (data) => {
      setImportMessage(data.retried ? t('Retrying the earlier failed import (video {id}).', { id: data.video_id }) : data.existing ? t('This video is already mirrored (video {id}).', { id: data.video_id }) : t('Import started (video {id}). It will appear once downloaded and transcoded.', { id: data.video_id }));
      setImportForm((form) => ({ ...form, url: '', createNewChannel: false, copyChannelInfo: false }));
      void refresh();
      void client.invalidateQueries({ queryKey: ['admin', 'ops', 'channels'] });
    },
    onError: (error) => {
      if (error instanceof MirrorImportError && error.youtubeChannelID && error.message.includes('not linked')) setDetected({ id: error.youtubeChannelID, title: error.youtubeChannelTitle });
    },
  });

  const saveMapping = useMutation({
    mutationFn: () => opsAPI.saveMirrorChannel({
      youtube_channel_id: mappingForm.youtubeChannelID.trim(), youtube_channel_title: mappingForm.youtubeChannelTitle.trim(), youtube_channel_url: mappingForm.youtubeChannelURL.trim(),
      giltube_channel_id: mappingForm.createNewChannel ? '' : mappingForm.giltubeChannelID, create_new_channel: mappingForm.createNewChannel,
    }),
    onSuccess: () => { setMappingForm(blankMapping); setDetected(null); void refresh(); void client.invalidateQueries({ queryKey: ['admin', 'ops', 'channels'] }); },
    onError: alertError(t),
  });
  const removeMapping = useMutation({ mutationFn: (youtubeChannelID: string) => opsAPI.deleteMirrorChannel(youtubeChannelID), onSuccess: () => void refresh(), onError: alertError(t) });

  const canSaveMapping = !!mappingForm.youtubeChannelID.trim() && (mappingForm.createNewChannel || !!mappingForm.giltubeChannelID);
  const editing = !!mappingForm.youtubeChannelID && mappings.data?.some((mapping) => mapping.youtube_channel_id === mappingForm.youtubeChannelID);
  const edit = (mapping: MirrorChannel) => setMappingForm({ youtubeChannelID: mapping.youtube_channel_id, youtubeChannelTitle: mapping.youtube_channel_title || '', youtubeChannelURL: mapping.youtube_channel_url || '', giltubeChannelID: mapping.giltube_channel_id, createNewChannel: false });
  const remove = (mapping: MirrorChannel) => confirmAction(t, t('Remove mirror channel?'), t('Stop mirroring {title}? Already imported videos stay on GilTube.', { title: mapping.youtube_channel_title || mapping.youtube_channel_id }), () => removeMapping.mutate(mapping.youtube_channel_id));

  return <AdminScreen title={t('YouTube mirrors')} subtitle={t('Copy YouTube videos into GilTube channels.')} refreshing={mappings.isRefetching} onRefresh={() => void mappings.refetch()}>
    <AdminSection title={t('Import a video')}>
      <AdminCard>
        <Text style={adminStyles.muted}>{t('Paste a YouTube video URL. It is downloaded and published to the GilTube channel linked to its YouTube channel, or to the channel you pick.')}</Text>
        <AdminField label={t('YouTube URL')} value={importForm.url} onChangeText={(url) => setImportForm((form) => ({ ...form, url }))} placeholder="https://www.youtube.com/watch?v=..." autoCapitalize="none" keyboardType="url" />
        <AdminToggle label={t('Create a new GilTube channel')} help={t('Creates a channel from the YouTube channel and links it.')} value={importForm.createNewChannel} onChange={(createNewChannel) => setImportForm((form) => ({ ...form, createNewChannel }))} />
        <ChannelPicker label={t('GilTube channel')} value={importForm.giltubeChannelID} onChange={(giltubeChannelID) => setImportForm((form) => ({ ...form, giltubeChannelID }))} emptyLabel={t('Use the mapped channel')} disabled={importForm.createNewChannel} />
        <AdminToggle label={t('Copy channel info')} help={t('Update the GilTube channel name, avatar and description from YouTube.')} value={importForm.copyChannelInfo} onChange={(copyChannelInfo) => setImportForm((form) => ({ ...form, copyChannelInfo }))} />
        <AdminToggle label={t('Explicit')} value={importForm.explicit} onChange={(explicit) => setImportForm((form) => ({ ...form, explicit }))} />
        <AdminToggle label={t('Hidden')} value={importForm.hidden} onChange={(hidden) => setImportForm((form) => ({ ...form, hidden }))} />
        <AdminButtons>
          <AdminButton variant="primary" icon="cloud-download-outline" label={startImport.isPending ? t('Starting…') : t('Import')} busy={startImport.isPending} disabled={!importForm.url.trim()} onPress={() => startImport.mutate()} />
        </AdminButtons>
        {!!importMessage && <AdminNotice tone="good" text={importMessage} />}
        <AdminError error={startImport.error} />
        {!!detected && <AdminCard style={styles.detected}>
          <Text style={adminStyles.text}>{t('This YouTube channel is not linked to a GilTube channel yet.')}</Text>
          <Text selectable style={adminStyles.mono}>{detected.id}</Text>
          {!!detected.title && <Text style={adminStyles.muted}>{detected.title}</Text>}
          <Text style={adminStyles.muted}>{t('Link it below, pick a channel above, or turn on “Create a new GilTube channel”.')}</Text>
          <AdminButtons><AdminButton compact icon="link-outline" label={t('Link this channel')} onPress={() => setMappingForm({ ...blankMapping, youtubeChannelID: detected.id, youtubeChannelTitle: detected.title })} /></AdminButtons>
        </AdminCard>}
      </AdminCard>
    </AdminSection>

    <AdminSection title={editing ? t('Edit mirror channel') : t('Add mirror channel')}>
      <AdminCard>
        <Text style={adminStyles.muted}>{t('Link a YouTube channel to a GilTube channel so imports from it land in the right place.')}</Text>
        <AdminField label={t('YouTube channel ID')} value={mappingForm.youtubeChannelID} onChangeText={(youtubeChannelID) => setMappingForm((form) => ({ ...form, youtubeChannelID }))} placeholder="UC..." autoCapitalize="none" editable={!editing} />
        <AdminField label={t('YouTube channel name')} value={mappingForm.youtubeChannelTitle} onChangeText={(youtubeChannelTitle) => setMappingForm((form) => ({ ...form, youtubeChannelTitle }))} />
        <AdminToggle label={t('Create a new GilTube channel')} value={mappingForm.createNewChannel} onChange={(createNewChannel) => setMappingForm((form) => ({ ...form, createNewChannel }))} />
        <ChannelPicker label={t('Mirrors to')} value={mappingForm.giltubeChannelID} onChange={(giltubeChannelID) => setMappingForm((form) => ({ ...form, giltubeChannelID }))} disabled={mappingForm.createNewChannel} />
        <AdminButtons>
          <AdminButton variant="primary" icon="save-outline" label={t('Save')} busy={saveMapping.isPending} disabled={!canSaveMapping} onPress={() => saveMapping.mutate()} />
          {(editing || !!mappingForm.youtubeChannelID) && <AdminButton label={t('Cancel')} onPress={() => setMappingForm(blankMapping)} />}
        </AdminButtons>
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Mirrored channels')}>
      <AdminError error={mappings.error} />
      {mappings.isLoading ? <AdminLoading /> : !mappings.data?.length ? <AdminEmpty text={t('No YouTube channels are linked yet.')} /> : mappings.data.map((mapping) => <View key={mapping.youtube_channel_id}>
        <AdminRow icon="logo-youtube" title={mapping.youtube_channel_title || t('Untitled channel')} subtitle={`${mapping.youtube_channel_id}\n${t('Mirrors to')}: ${mapping.giltube_channel_name || mapping.giltube_channel_id}`} right={<View style={styles.actions}>
          <AdminButton compact icon="create-outline" label={t('Edit')} onPress={() => edit(mapping)} />
          <AdminButton compact variant="danger" icon="trash-outline" label={t('Delete')} disabled={removeMapping.isPending} onPress={() => remove(mapping)} />
        </View>} />
      </View>)}
    </AdminSection>
  </AdminScreen>;
}

const styles = StyleSheet.create({
  detected: { marginTop: 12, marginBottom: 0 },
  actions: { gap: 6 },
});
