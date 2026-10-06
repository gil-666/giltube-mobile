import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { formatLocalDateTime, parseLocalDateTime } from '@/admin/ops/api';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminField, AdminLoading, AdminNotice, AdminScreen, AdminSection, AdminToggle, alertError, confirmAction, useAdminStyles, useIsAdmin } from '@/admin/ui';
import { newsAPI, type NewsCTAKind, type NewsItem, type NewsPayload } from '@/api/news';
import { useI18n } from '@/i18n';
import { NewsMarkdown } from '@/news/NewsMarkdown';
import { colors, makeStyles, radii } from '@/theme/tokens';

const NEWS_KEY = ['admin', 'news'] as const;

type Form = { title: string; body: string; show_panel: boolean; notify: boolean; loud: boolean; cta_kind: NewsCTAKind; cta_label: string; cta_target: string; enabled: boolean; starts_at: string; ends_at: string };
const blank = (): Form => ({ title: '', body: '', show_panel: true, notify: false, loud: false, cta_kind: 'none', cta_label: '', cta_target: '', enabled: true, starts_at: '', ends_at: '' });

const formFromItem = (item: NewsItem): Form => ({
  title: item.title, body: item.body, show_panel: item.show_panel, notify: item.notify_mode !== 'none', loud: item.notify_mode === 'loud',
  cta_kind: item.cta_kind, cta_label: item.cta_label, cta_target: item.cta_target, enabled: item.enabled,
  starts_at: formatLocalDateTime(item.starts_at), ends_at: formatLocalDateTime(item.ends_at),
});

const payloadFromItem = (item: NewsItem, patch: Partial<NewsPayload> = {}): NewsPayload => ({
  title: item.title, body: item.body, show_panel: item.show_panel, notify_mode: item.notify_mode, cta_kind: item.cta_kind,
  cta_label: item.cta_label, cta_target: item.cta_target, enabled: item.enabled, starts_at: item.starts_at, ends_at: item.ends_at, ...patch,
});

const CHEAT_SHEET = '# Heading · **bold** · *italic* · ~~strike~~ · `code`\n[link text](/video/ID) or [link](https://…)\n- list item · 1. numbered · > quote · --- divider';

export default function NewsAdminScreen() {
  const styles = useStyles();
  const adminStyles = useAdminStyles();
  const { t, dateTime, number } = useI18n();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const items = useQuery({ queryKey: NEWS_KEY, queryFn: newsAPI.adminList, enabled: isAdmin });
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  const refresh = () => void client.invalidateQueries({ queryKey: NEWS_KEY });
  const reset = () => { setForm(blank()); setEditing(null); setPreview(false); };

  const buildPayload = (): NewsPayload => {
    const title = form.title.trim();
    if (!title) throw new Error(t('Add a title.'));
    if (!form.show_panel && !form.notify) throw new Error(t('Choose at least one way to deliver this news.'));
    const starts = form.starts_at.trim() ? parseLocalDateTime(form.starts_at) : null;
    if (form.starts_at.trim() && !starts) throw new Error(t('Use the format YYYY-MM-DD HH:MM for the start.'));
    const ends = form.ends_at.trim() ? parseLocalDateTime(form.ends_at) : null;
    if (form.ends_at.trim() && !ends) throw new Error(t('Use the format YYYY-MM-DD HH:MM for the end.'));
    return {
      title, body: form.body, show_panel: form.show_panel, notify_mode: form.notify ? (form.loud ? 'loud' : 'silent') : 'none',
      cta_kind: form.cta_kind, cta_label: form.cta_kind === 'none' ? '' : form.cta_label.trim(), cta_target: form.cta_kind === 'none' ? '' : form.cta_target.trim(),
      enabled: form.enabled, ...(starts ? { starts_at: starts.toISOString() } : {}), ends_at: ends ? ends.toISOString() : null,
    };
  };

  const save = useMutation({
    mutationFn: (payload: NewsPayload) => editing ? newsAPI.adminUpdate(editing.id, payload) : newsAPI.adminCreate(payload),
    onMutate: () => setMessage(''),
    onSuccess: () => { setMessage(t('News saved.')); reset(); refresh(); },
    onError: alertError(t),
  });
  const toggle = useMutation({
    mutationFn: ({ item, enabled }: { item: NewsItem; enabled: boolean }) => newsAPI.adminUpdate(item.id, payloadFromItem(item, { enabled })),
    onSuccess: refresh,
    onError: alertError(t),
  });
  const remove = useMutation({
    mutationFn: (id: string) => newsAPI.adminDelete(id),
    onSuccess: (_data, id) => { if (id === editing?.id) reset(); refresh(); },
    onError: alertError(t),
  });

  // A loud notification is pushed once, when an unsent item goes live.
  const sendsPush = (mode: NewsPayload['notify_mode'], enabled: boolean, item: NewsItem | null) => mode === 'loud' && enabled && !item?.notified_at;
  const confirmLoud = (run: () => void) => Alert.alert(t('Send a push notification?'), t('This sends a push notification to every user.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Send'), onPress: run },
  ]);

  const submit = () => {
    let payload: NewsPayload;
    try { payload = buildPayload(); } catch (error) { alertError(t)(error); return; }
    if (sendsPush(payload.notify_mode, payload.enabled !== false, editing)) confirmLoud(() => save.mutate(payload));
    else save.mutate(payload);
  };
  const setEnabled = (item: NewsItem, enabled: boolean) => {
    if (sendsPush(item.notify_mode, enabled, item)) confirmLoud(() => toggle.mutate({ item, enabled }));
    else toggle.mutate({ item, enabled });
  };
  const edit = (item: NewsItem) => { setEditing(item); setForm(formFromItem(item)); setPreview(false); setMessage(''); };

  // "Now" for status chips: when the list was fetched (keeps render pure).
  const now = items.dataUpdatedAt;
  const badges = (item: NewsItem) => {
    const starts = new Date(item.starts_at).getTime();
    const ends = item.ends_at ? new Date(item.ends_at).getTime() : null;
    return <>
      {!item.enabled && <AdminBadge label={t('Disabled')} tone="neutral" />}
      {item.show_panel && <AdminBadge label={t('Panel')} tone="info" />}
      {item.notify_mode === 'silent' && <AdminBadge label={t('Silent')} tone="neutral" />}
      {item.notify_mode === 'loud' && <AdminBadge label={t('Loud')} tone="warn" />}
      {starts > now && <AdminBadge label={t('Scheduled')} tone="info" />}
      {ends !== null && ends <= now && <AdminBadge label={t('Ended')} tone="neutral" />}
      {!!item.notified_at && <AdminBadge label={t('Notified {time}', { time: dateTime(item.notified_at) })} tone="good" />}
    </>;
  };

  const ctaPlaceholder = form.cta_kind === 'external' ? 'https://…' : '/video/…  ·  /account-settings#themes';

  return <AdminScreen title={t('News')} subtitle={t('Startup panels and announcements for the website and app.')} refreshing={items.isRefetching} onRefresh={() => void items.refetch()}>
    {!!message && <AdminNotice tone="good" text={message} />}

    <AdminSection title={editing ? t('Edit news') : t('New news')}>
      <AdminCard>
        <AdminField label={t('Title')} value={form.title} onChangeText={(title) => update({ title: title.slice(0, 120) })} placeholder={t('What’s new?')} />
        <AdminChips label={t('Body (Markdown)')} value={preview ? 'preview' : 'write'} onChange={(mode) => setPreview(mode === 'preview')} options={[{ value: 'write', label: t('Write') }, { value: 'preview', label: t('Preview') }]} />
        {preview
          ? <View style={styles.preview}>{form.body.trim() ? <NewsMarkdown source={form.body} /> : <Text style={adminStyles.muted}>{t('Nothing to preview yet.')}</Text>}</View>
          : <AdminField label="" value={form.body} onChangeText={(body) => update({ body: body.slice(0, 10000) })} multiline placeholder={t('Write the announcement…')} />}
        <Text style={styles.cheat}>{t(CHEAT_SHEET)}</Text>
        <Text style={adminStyles.muted}>{t('{count} of 10,000 characters', { count: number(form.body.length) })}</Text>

        <Text style={styles.label}>{t('Delivery')}</Text>
        <AdminToggle label={t('Show as a panel on startup')} help={t('Appears once when the website or app opens, until the user dismisses it.')} value={form.show_panel} onChange={(show_panel) => update({ show_panel })} />
        <AdminToggle label={t('Send a notification')} help={editing?.notified_at ? t('Already sent. Saving won’t send it again.') : undefined} value={form.notify} onChange={(notify) => update({ notify })} />
        {form.notify && <AdminChips value={form.loud ? 'loud' : 'silent'} onChange={(mode) => update({ loud: mode === 'loud' })} options={[{ value: 'silent', label: t('Silent') }, { value: 'loud', label: t('Loud') }]} />}
        {form.notify && <Text style={styles.help}>{t('Silent: only in the notification list. Loud: also a push notification.')}</Text>}

        <AdminChips label={t('Call to action')} value={form.cta_kind} onChange={(cta_kind) => update({ cta_kind })} options={[{ value: 'none', label: t('None') }, { value: 'internal', label: t('Page on GilTube') }, { value: 'external', label: t('External link') }]} />
        {form.cta_kind !== 'none' && <>
          <AdminField label={t('Button label')} value={form.cta_label} onChangeText={(cta_label) => update({ cta_label: cta_label.slice(0, 40) })} placeholder={t('Learn more')} />
          <AdminField label={form.cta_kind === 'external' ? t('Link') : t('GilTube path')} value={form.cta_target} onChangeText={(cta_target) => update({ cta_target })} placeholder={ctaPlaceholder} autoCapitalize="none" keyboardType="url" />
        </>}

        <Text style={styles.label}>{t('Schedule (optional)')}</Text>
        <AdminField label={t('Starts')} value={form.starts_at} onChangeText={(starts_at) => update({ starts_at })} placeholder="2026-10-31 20:00" autoCapitalize="none" help={t('Local time, YYYY-MM-DD HH:MM. Empty starts now.')} />
        <AdminField label={t('Ends')} value={form.ends_at} onChangeText={(ends_at) => update({ ends_at })} placeholder="2026-11-07 20:00" autoCapitalize="none" help={t('Empty never ends.')} />
        <AdminToggle label={t('Enabled')} value={form.enabled} onChange={(enabled) => update({ enabled })} />

        <AdminButtons>
          <AdminButton variant="primary" icon="save-outline" label={editing ? t('Save news') : t('Publish news')} busy={save.isPending} disabled={!form.title.trim()} onPress={submit} />
          {!!editing && <AdminButton label={t('Cancel')} onPress={reset} />}
        </AdminButtons>
      </AdminCard>
    </AdminSection>

    <AdminSection title={t('All news')}>
      <AdminError error={items.error} />
      {items.isLoading ? <AdminLoading /> : !items.data?.length ? <AdminEmpty text={t('No news yet.')} /> : items.data.map((item) => <AdminCard key={item.id} style={item.id === editing?.id ? styles.editing : undefined}>
        <View style={styles.itemHead}>
          <View style={styles.itemCopy}>
            <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
            <Text style={adminStyles.muted}>{dateTime(item.starts_at)}{item.ends_at ? ` → ${dateTime(item.ends_at)}` : ''}</Text>
          </View>
          <Switch accessibilityLabel={t('Enabled')} value={item.enabled} disabled={toggle.isPending} onValueChange={(enabled) => setEnabled(item, enabled)} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.white} />
        </View>
        <View style={styles.badges}>{badges(item)}</View>
        {item.show_panel && <Text style={[adminStyles.muted, styles.dismissals]}>{t('Dismissed by {count}', { count: number(item.dismiss_count || 0) })}</Text>}
        <AdminButtons>
          <AdminButton compact icon="create-outline" label={t('Edit')} onPress={() => edit(item)} />
          <AdminButton compact variant="danger" icon="trash-outline" label={t('Delete')} disabled={remove.isPending} onPress={() => confirmAction(t, t('Delete news?'), t('Delete “{title}”? Its notifications are removed too.', { title: item.title }), () => remove.mutate(item.id))} />
        </AdminButtons>
      </AdminCard>)}
    </AdminSection>
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginTop: 18, marginBottom: 2 },
  help: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 6 },
  cheat: { color: colors.textDim, fontSize: 11, lineHeight: 16, fontFamily: 'monospace', marginTop: 8, marginBottom: 4 },
  preview: { minHeight: 96, marginTop: 4, padding: 14, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.canvas },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  dismissals: { marginTop: 8 },
  editing: { borderColor: colors.accentBright },
}));
