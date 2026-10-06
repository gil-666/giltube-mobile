import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { musicAPI, useInvalidateMusic, useMusicCatalog, useMusicChannels } from '@/admin/music/api';
import { MusicArtwork, MusicSelect } from '@/admin/music/components';
import { errorMessage, releaseTypeLabel, statusLabel, statusTone } from '@/admin/music/helpers';
import type { LocalMusicFile, MusicArtistInput } from '@/admin/music/types';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminEmpty, AdminError, AdminField, AdminLoading, AdminRow, AdminScreen, AdminSection, AdminToggle, confirmAction, pickFile } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';

const emptyForm: MusicArtistInput = { name: '', bio: '', primary_channel_id: '', verified: false };

export default function MusicArtistScreen() {
  const styles = useStyles();
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { t } = useI18n();
  const catalog = useMusicCatalog();
  const channels = useMusicChannels();
  const invalidate = useInvalidateMusic();
  const artist = catalog.artists.find((item) => item.id === id);
  const [form, setForm] = useState<MusicArtistInput>(emptyForm);
  const [loadedID, setLoadedID] = useState('');
  const [avatar, setAvatar] = useState<LocalMusicFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Load the artist into the form once it arrives (render-time sync, no effect).
  if (artist && loadedID !== artist.id) {
    setLoadedID(artist.id);
    setForm({ name: artist.name, bio: artist.bio, primary_channel_id: artist.primary_channel_id || '', verified: artist.verified });
  }

  // A channel can back only one artist, so hide channels other artists already use.
  const channelOptions = useMemo(() => [
    { value: '', label: t('No channel (music-only artist)') },
    ...(channels.data || [])
      .filter((channel) => !catalog.artists.some((item) => item.primary_channel_id === channel.id && item.id !== id))
      .map((channel) => ({ value: channel.id, label: channel.name, subtitle: `@${channel.username}${channel.status && channel.status !== 'active' ? ` · ${channel.status}` : ''}` })),
  ], [channels.data, catalog.artists, id, t]);

  const releases = catalog.releases.filter((release) => release.artist_id === id);
  const set = <K extends keyof MusicArtistInput>(key: K, value: MusicArtistInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const chooseAvatar = async () => {
    const asset = await pickFile('image/*');
    if (asset) setAvatar({ uri: asset.uri, name: asset.name, size: asset.size });
  };

  const save = async () => {
    if (!form.name.trim()) { setError(new Error(t('Name is required.'))); return; }
    setSaving(true);
    setError(null);
    try {
      const input = { ...form, name: form.name.trim(), bio: form.bio.trim() };
      const saved = isNew ? await musicAPI.createArtist(input) : await musicAPI.updateArtist(id, input);
      if (avatar) await musicAPI.uploadArtistAvatar(saved.id, avatar);
      setAvatar(null);
      await invalidate();
      if (isNew) router.replace({ pathname: '/admin/music/artists/[id]', params: { id: saved.id } });
      else Alert.alert(t('Saved'), t('{title} was saved.', { title: input.name }));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => confirmAction(t, t('Delete artist?'), t('Delete {name}? Artists with releases can’t be deleted until their releases are removed.', { name: artist?.name || '' }), async () => {
    await musicAPI.deleteArtist(id);
    await invalidate();
    router.back();
  });

  if (!isNew && catalog.loading) return <AdminScreen title={t('Artist')}><AdminLoading /></AdminScreen>;
  if (!isNew && !artist) return <AdminScreen title={t('Artist')}><AdminError error={catalog.error} /><AdminEmpty text={t('Artist not found.')} /></AdminScreen>;

  return <AdminScreen title={isNew ? t('New artist') : artist?.name || t('Artist')} subtitle={artist ? `/${artist.slug}` : undefined} refreshing={catalog.refreshing} onRefresh={() => void catalog.refetch()}>
    <AdminSection title={t('Details')}>
      <AdminCard>
        <View style={styles.avatarRow}>
          <MusicArtwork url={artist?.avatar_url} localURI={avatar?.uri} size={84} round />
          <View style={styles.avatarCopy}>
            <Text style={styles.muted}>{t('Square images work best. Uploaded when you save.')}</Text>
            <AdminButtons>
              <AdminButton compact icon="image-outline" label={artist?.avatar_url || avatar ? t('Replace image') : t('Choose image')} onPress={() => void chooseAvatar()} />
              {!!avatar && <AdminButton compact label={t('Undo')} onPress={() => setAvatar(null)} />}
            </AdminButtons>
          </View>
        </View>
        <AdminField label={t('Name')} value={form.name} onChangeText={(value) => set('name', value)} autoCapitalize="words" />
        {!!artist && <AdminField label={t('Slug')} value={artist.slug} onChangeText={() => undefined} editable={false} help={t('Generated from the name when saved.')} />}
        <MusicSelect
          label={t('Primary channel (optional)')}
          value={form.primary_channel_id}
          options={channelOptions}
          onChange={(value) => set('primary_channel_id', value)}
          placeholder={channels.isLoading ? t('Loading…') : t('No channel (music-only artist)')}
          help={t('Connect a channel to show this artist’s music on it.')}
        />
        <AdminField label={t('Bio')} value={form.bio} onChangeText={(value) => set('bio', value)} multiline />
        <AdminToggle label={t('Verified artist')} value={form.verified} onChange={(value) => set('verified', value)} />
        <AdminError error={error} />
        <AdminButtons>
          <AdminButton variant="primary" icon="checkmark" label={saving ? t('Saving…') : t('Save')} busy={saving} onPress={() => void save()} />
          {!isNew && <AdminButton variant="danger" icon="trash-outline" label={t('Delete')} disabled={saving} onPress={remove} />}
        </AdminButtons>
      </AdminCard>
    </AdminSection>

    {!isNew && <AdminSection title={t('Releases')} right={<AdminButton compact icon="add" label={t('New release')} onPress={() => router.push({ pathname: '/admin/music/releases/[id]', params: { id: 'new', artist: id } })} />}>
      {releases.length ? releases.map((release) => <AdminRow
        key={release.id}
        imageSlot={<MusicArtwork url={release.cover_url} size={46} />}
        title={release.title}
        subtitle={`${releaseTypeLabel(t, release.release_type)} · ${t('{count} tracks', { count: release.track_count })}`}
        badges={<AdminBadge label={statusLabel(t, release.status)} tone={statusTone(release.status)} />}
        onPress={() => router.push({ pathname: '/admin/music/releases/[id]', params: { id: release.id } })}
      />) : <AdminEmpty text={t('No releases yet.')} />}
    </AdminSection>}
    {!!channels.error && <Text style={styles.muted}>{errorMessage(channels.error)}</Text>}
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCopy: { flex: 1, minWidth: 0 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
}));
