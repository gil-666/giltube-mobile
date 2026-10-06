import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { formatDuration, invalidateSeries, seriesAPI, seriesKeys, type IntroSuggestion } from '@/admin/series/api';
import { IntroPlayer } from '@/admin/series/IntroPlayer';
import { AdminBadge, AdminButton, AdminButtons, AdminCard, AdminChips, AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminScreen, adminStyles, useIsAdmin } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

type Status = 'pending' | 'approved' | 'rejected' | 'all';

export default function AdminIntroSuggestionsScreen() {
  const styles = useStyles();
  const { t, dateTime } = useI18n();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('pending');
  const [previewID, setPreviewID] = useState('');
  const [reviewingID, setReviewingID] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const suggestions = useQuery({ queryKey: seriesKeys.suggestions(status), queryFn: () => seriesAPI.introSuggestions(status), enabled: isAdmin });
  const items = suggestions.data?.suggestions || [];

  const review = async (suggestion: IntroSuggestion, action: 'approve' | 'reject') => {
    setReviewingID(suggestion.id); setError(null); setMessage('');
    try {
      await seriesAPI.reviewSuggestion(suggestion.id, action);
      setMessage(action === 'approve' ? t('Intro timing applied to the episode.') : t('Intro suggestion rejected.'));
      if (previewID === suggestion.id) setPreviewID('');
      await invalidateSeries(queryClient);
    } catch (err) {
      setError(err);
    } finally {
      setReviewingID('');
    }
  };

  return <AdminScreen title={t('Intro suggestions')} subtitle={t('Review community-submitted intro skip timings for series episodes.')} refreshing={suggestions.isRefetching} onRefresh={() => void suggestions.refetch()}>
    <AdminChips<Status> options={[{ value: 'pending', label: t('Pending') }, { value: 'approved', label: t('Approved') }, { value: 'rejected', label: t('Rejected') }, { value: 'all', label: t('All') }]} value={status} onChange={(value) => { setStatus(value); setPreviewID(''); }} />
    <AdminError error={error || suggestions.error} />
    {!!message && <AdminNotice tone="good" text={message} />}
    <View style={styles.list}>
      {suggestions.isLoading ? <AdminLoading /> : !items.length ? <AdminEmpty text={t('No intro suggestions found.')} /> : items.map((suggestion) => {
        const pending = suggestion.status === 'pending';
        const busy = reviewingID === suggestion.id;
        return <AdminCard key={suggestion.id}>
          <View style={adminStyles.inlineRow}>
            <Text numberOfLines={2} style={styles.title}>{suggestion.series_title} · {t('S{season} E{episode}', { season: suggestion.season_number, episode: suggestion.episode_number })}</Text>
            <AdminBadge tone={suggestion.status === 'approved' ? 'good' : suggestion.status === 'rejected' ? 'bad' : 'warn'} label={t(suggestion.status === 'approved' ? 'Approved' : suggestion.status === 'rejected' ? 'Rejected' : 'Pending')} />
          </View>
          {!!suggestion.episode_title && <Text style={adminStyles.text}>{suggestion.episode_title}</Text>}
          <Text style={[adminStyles.muted, styles.gap]}>
            {suggestion.source === 'auto'
              ? t('Auto-detected · matched {percent}% of episodes', { percent: Math.round((suggestion.confidence || 0) * 100) })
              : t('Suggested by {username}', { username: suggestion.username || t('User') })}
            {suggestion.created_at ? ` · ${dateTime(suggestion.created_at)}` : ''}
          </Text>
          <View style={styles.timings}>
            <View style={styles.timing}><Text style={styles.timingLabel}>{t('Current timing')}</Text><Text style={styles.timingValue}>{formatDuration(suggestion.current_intro_start_seconds)} - {formatDuration(suggestion.current_intro_end_seconds)}</Text></View>
            <View style={styles.timing}><Text style={styles.timingLabel}>{t('Suggested timing')}</Text><Text style={styles.timingValue}>{formatDuration(suggestion.intro_start_seconds)} - {formatDuration(suggestion.intro_end_seconds)}</Text></View>
          </View>
          {!!suggestion.note && <Text style={[adminStyles.text, styles.gap]}>“{suggestion.note}”</Text>}
          {previewID === suggestion.id && !!suggestion.video_hls_path && <View style={styles.gap}><IntroPlayer hlsPath={suggestion.video_hls_path} start={suggestion.intro_start_seconds} end={suggestion.intro_end_seconds} /></View>}
          <AdminButtons>
            <AdminButton compact icon="play-outline" label={t('Open episode')} onPress={() => router.push({ pathname: '/video/[id]', params: { id: suggestion.video_id } })} />
            <AdminButton compact icon={previewID === suggestion.id ? 'close' : 'eye-outline'} label={previewID === suggestion.id ? t('Close preview') : t('Preview timing')} disabled={!suggestion.video_hls_path} onPress={() => setPreviewID(previewID === suggestion.id ? '' : suggestion.id)} />
            <AdminButton compact variant="primary" icon="checkmark" label={t('Apply timing')} busy={busy} disabled={!pending || !!reviewingID} onPress={() => void review(suggestion, 'approve')} />
            <AdminButton compact variant="danger" icon="close" label={t('Reject')} disabled={!pending || !!reviewingID} onPress={() => void review(suggestion, 'reject')} />
          </AdminButtons>
        </AdminCard>;
      })}
    </View>
  </AdminScreen>;
}

const useStyles = makeStyles(() => ({
  list: { marginTop: 14 },
  title: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  gap: { marginTop: 8 },
  timings: { flexDirection: 'row', gap: 8, marginTop: 10 },
  timing: { flex: 1, borderRadius: radii.md, backgroundColor: colors.surfaceStrong, padding: 10 },
  timingLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
  timingValue: { color: colors.text, fontSize: 13, fontWeight: '800', fontFamily: 'monospace', marginTop: 3 },
}));
