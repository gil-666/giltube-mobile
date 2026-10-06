import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { formatLocalDateTime, opsAPI, parseLocalDateTime, type FeaturedCandidate, type FeaturedItem, type FeaturedPayload, type FeaturedType } from '@/admin/ops/api';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminRow, AdminScreen, AdminSection, AdminToggle, alertError, confirmAction, useAdminStyles, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

const FEATURED_KEY = ['admin', 'ops', 'featured'] as const;
const typeLabels: Record<FeaturedType, string> = { video: 'Video', live: 'Live stream', movie: 'Movie', series: 'Series' };

type Form = { content_type: FeaturedType; content_id: string; header: string; description: string; action_text: string; slot: string; enabled: boolean; notifications_enabled: boolean; scheduled_for: string };
const blank = (): Form => ({ content_type: 'video', content_id: '', header: '', description: '', action_text: '', slot: '1', enabled: true, notifications_enabled: false, scheduled_for: '' });

export default function FeaturedAdminScreen() {
  const styles = useStyles();
  const adminStyles = useAdminStyles();
  const { t } = useI18n();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const items = useQuery({ queryKey: FEATURED_KEY, queryFn: opsAPI.featured, enabled: isAdmin });
  const [form, setForm] = useState<Form>(blank);
  const [editingID, setEditingID] = useState('');
  const [selected, setSelected] = useState<FeaturedCandidate | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const candidates = useQuery({ queryKey: ['admin', 'ops', 'featured', 'candidates', form.content_type, debounced], queryFn: () => opsAPI.featuredCandidates(form.content_type, debounced), enabled: isAdmin });
  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const reset = () => { setForm(blank()); setEditingID(''); setSelected(null); setQuery(''); };
  const save = useMutation({
    mutationFn: () => {
      const slot = parseInt(form.slot, 10);
      if (!form.content_id) throw new Error(t('Pick the content to feature.'));
      if (!(slot >= 1 && slot <= 5)) throw new Error(t('Slot must be between 1 and 5.'));
      let scheduled: Date | null = null;
      if (form.content_type === 'live' && form.scheduled_for.trim()) {
        scheduled = parseLocalDateTime(form.scheduled_for);
        if (!scheduled) throw new Error(t('Use the format YYYY-MM-DD HH:MM for the scheduled start.'));
      }
      const payload: FeaturedPayload = {
        content_type: form.content_type, content_id: form.content_id, header: form.header, description: form.description, action_text: form.action_text,
        position: slot - 1, enabled: form.enabled, notifications_enabled: form.notifications_enabled, ...(scheduled ? { scheduled_for: scheduled.toISOString() } : {}),
      };
      return editingID ? opsAPI.updateFeatured(editingID, payload) : opsAPI.createFeatured(payload);
    },
    onMutate: () => setMessage(''),
    onSuccess: () => { setMessage(t('Featured content saved.')); reset(); void client.invalidateQueries({ queryKey: FEATURED_KEY }); },
    onError: alertError(t),
  });
  const remove = useMutation({ mutationFn: (id: string) => opsAPI.deleteFeatured(id), onSuccess: (_data, id) => { if (id === editingID) reset(); void client.invalidateQueries({ queryKey: FEATURED_KEY }); }, onError: alertError(t) });

  const edit = (item: FeaturedItem) => {
    setEditingID(item.id);
    setMessage('');
    setQuery('');
    setForm({ content_type: item.content_type, content_id: item.content_id, header: item.header, description: item.description, action_text: item.action_text, slot: String(item.position + 1), enabled: item.enabled, notifications_enabled: item.notifications_enabled, scheduled_for: formatLocalDateTime(item.scheduled_for) });
    setSelected({ id: item.content_id, content_type: item.content_type, title: item.title, image_url: item.image_url, channel_id: item.channel_id, channel_name: item.channel_name, scheduled_for: item.scheduled_for });
  };
  const pick = (candidate: FeaturedCandidate) => {
    setSelected(candidate);
    update({ content_id: candidate.id, ...(candidate.content_type === 'live' && candidate.scheduled_for && !form.scheduled_for ? { scheduled_for: formatLocalDateTime(candidate.scheduled_for) } : {}) });
  };

  return <AdminScreen title={t('Featured')} subtitle={t('Control the five hero slots shared by the website and app.')} refreshing={items.isRefetching} onRefresh={() => { void items.refetch(); void candidates.refetch(); }}>
    {!!message && <AdminNotice tone="good" text={message} />}

    <AdminSection title={editingID ? t('Edit featured item') : t('Add featured item')}>
      <AdminCard>
        <AdminChips label={t('Content type')} value={form.content_type} onChange={(content_type) => { update({ content_type, content_id: '' }); setSelected(null); }} options={(Object.keys(typeLabels) as FeaturedType[]).map((value) => ({ value, label: t(typeLabels[value]) }))} />
        <Text style={styles.label}>{t('Selected content')}</Text>
        {selected ? <CandidateRow candidate={selected} active /> : <Text style={adminStyles.muted}>{t('Nothing selected yet. Pick something below.')}</Text>}
        <AdminField label={t('Find content')} value={query} onChangeText={setQuery} placeholder={t('Search by title or channel')} autoCapitalize="none" />
        {candidates.isLoading ? <AdminLoading /> : <AdminError error={candidates.error} />}
        {!candidates.isLoading && !candidates.data?.length && <AdminEmpty text={t('No matching content.')} />}
        {candidates.data?.filter((candidate) => candidate.id !== selected?.id).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onPress={() => pick(candidate)} />)}

        {form.content_type === 'live' && <AdminField label={t('Scheduled start')} value={form.scheduled_for} onChangeText={(scheduled_for) => update({ scheduled_for })} placeholder="2026-10-31 20:00" autoCapitalize="none" help={t('Local time, YYYY-MM-DD HH:MM. Leave empty to keep the stream’s schedule.')} />}
        <AdminChips label={t('Slot')} value={form.slot} onChange={(slot) => update({ slot })} options={['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }))} />
        <AdminField label={t('Header')} value={form.header} onChangeText={(header) => update({ header: header.slice(0, 100) })} placeholder={t('Featured, Premiere, Coming soon…')} />
        <AdminField label={t('Action button text')} value={form.action_text} onChangeText={(action_text) => update({ action_text: action_text.slice(0, 40) })} placeholder={t('Play')} />
        <AdminField label={t('Custom description')} value={form.description} onChangeText={(description) => update({ description: description.slice(0, 500) })} multiline />
        <AdminToggle label={t('Show this slot')} value={form.enabled} onChange={(enabled) => update({ enabled })} />
        <AdminToggle label={t('Send featured notifications')} value={form.notifications_enabled} onChange={(notifications_enabled) => update({ notifications_enabled })} />
        <AdminButtons>
          <AdminButton variant="primary" icon="save-outline" label={editingID ? t('Save item') : t('Add featured item')} busy={save.isPending} disabled={!form.content_id} onPress={() => save.mutate()} />
          {!!editingID && <AdminButton label={t('Cancel')} onPress={reset} />}
        </AdminButtons>
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('Current featured items')}>
      <AdminError error={items.error} />
      {items.isLoading ? <AdminLoading /> : !items.data?.length ? <AdminEmpty text={t('No featured content yet.')} /> : items.data.map((item) => <AdminCard key={item.id} style={item.id === editingID ? styles.editing : undefined}>
        {!!item.image_url && <Image source={resolveMediaURL(item.image_url)} style={styles.hero} contentFit="cover" />}
        <Text style={adminStyles.muted}>{t('Slot {slot}', { slot: item.position + 1 })} · {t(typeLabels[item.content_type] ?? item.content_type)}</Text>
        <Text numberOfLines={2} style={styles.title}>{item.header || item.title}</Text>
        <Text numberOfLines={1} style={adminStyles.muted}>{[item.title, item.channel_name].filter(Boolean).join(' · ')}</Text>
        <View style={styles.badges}>
          <AdminBadge label={item.enabled ? t('Visible') : t('Hidden')} tone={item.enabled ? 'good' : 'neutral'} />
          <AdminBadge label={item.notifications_enabled ? t('Notifications on') : t('Notifications off')} tone={item.notifications_enabled ? 'info' : 'neutral'} />
          {item.is_live && <AdminBadge label={t('Live')} tone="bad" />}
        </View>
        <AdminButtons>
          <AdminButton compact icon="create-outline" label={t('Edit')} onPress={() => edit(item)} />
          <AdminButton compact variant="danger" icon="trash-outline" label={t('Delete')} disabled={remove.isPending} onPress={() => confirmAction(t, t('Remove featured item?'), t('Remove “{title}” from featured content?', { title: item.title }), () => remove.mutate(item.id))} />
        </AdminButtons>
      </AdminCard>)}
    </AdminSection>
  </AdminScreen>;
}

function CandidateRow({ candidate, onPress, active }: { candidate: FeaturedCandidate; onPress?: () => void; active?: boolean }) {
  const adminStyles = useAdminStyles();
  return <AdminRow
    title={candidate.title}
    subtitle={candidate.channel_name}
    onPress={onPress}
    imageSlot={<Image source={resolveMediaURL(candidate.image_url)} style={adminStyles.thumb} contentFit="cover" />}
    right={active ? <AdminBadge label="✓" tone="good" /> : undefined}
  />;
}

const useStyles = makeStyles(() => ({
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginTop: 12, marginBottom: 2 },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: colors.surfaceStrong, marginBottom: 10 },
  title: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  editing: { borderColor: colors.accentBright },
}));
