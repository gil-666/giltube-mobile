import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

import type { UploadStatus } from '@/api/upload';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

export function formatUploadBytes(bytes: number) {
  if (bytes < 1000 * 1000) return `${Math.max(0, Math.round(bytes / 1000))} KB`;
  if (bytes < 1000 * 1000 * 1000) return `${(bytes / 1000 / 1000).toFixed(1)} MB`;
  return `${(bytes / 1000 / 1000 / 1000).toFixed(2)} GB`;
}

function formatDuration(seconds: number, t: ReturnType<typeof useI18n>['t']) {
  if (seconds < 60) return t('{count} s', { count: Math.max(1, Math.round(seconds)) });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('{count} min', { count: minutes });
  return t('{hours} h {minutes} min', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** Detailed progress for a chunked upload: phase, bytes, speed, time left, parts. */
export function UploadProgressCard({ status }: { status: UploadStatus | null }) {
  const styles = useStyles();
  const { t } = useI18n();
  if (!status) return null;
  const percent = status.totalBytes ? Math.min(100, (status.sentBytes / status.totalBytes) * 100) : 0;
  const retrying = status.phase === 'retrying';

  const title = {
    preparing: t('Preparing your file…'),
    checking: t('Checking for an earlier upload…'),
    uploading: t('Uploading'),
    retrying: t('Connection lost'),
    finishing: t('Finishing up…'),
  }[status.phase];
  const icon = retrying ? 'cloud-offline-outline' : status.phase === 'finishing' ? 'construct-outline' : 'cloud-upload-outline';

  return <View style={[styles.card, retrying && styles.cardWarning]}>
    <View style={styles.header}>
      <Ionicons name={icon} size={18} color={retrying ? colors.warning : colors.gilid} />
      <Text style={styles.title}>{title}</Text>
      {status.phase === 'uploading' || status.phase === 'retrying'
        ? <Text style={styles.percent}>{percent.toFixed(percent < 10 ? 1 : 0)}%</Text>
        : <ActivityIndicator size="small" color={colors.textMuted} />}
    </View>

    <View style={styles.track}><View style={[styles.fill, retrying && styles.fillWarning, { width: `${Math.max(1, percent)}%` }]} /></View>

    {status.totalBytes > 0 && <View style={styles.row}>
      <Text style={styles.primary}>{t('{sent} of {total}', { sent: formatUploadBytes(status.sentBytes), total: formatUploadBytes(status.totalBytes) })}</Text>
      {status.totalChunks > 0 && <Text style={styles.meta}>{t('Part {current} of {total}', { current: Math.min(status.chunk, status.totalChunks), total: status.totalChunks })}</Text>}
    </View>}

    {status.phase === 'uploading' && <Text style={styles.meta}>
      {status.bytesPerSecond > 0
        ? `${formatUploadBytes(status.bytesPerSecond)}/s${status.etaSeconds ? ` · ${t('about {time} left', { time: formatDuration(status.etaSeconds, t) })}` : ''}`
        : t('Measuring speed…')}
    </Text>}
    {retrying && status.retry && <Text style={styles.warning}>
      {t('{reason}. Retrying in {seconds} s (attempt {attempt}). Your progress is kept.', { reason: t(status.retry.reason), seconds: status.retry.inSeconds, attempt: status.retry.attempt })}
    </Text>}
    {status.phase === 'preparing' && <Text style={styles.meta}>{t('Opening the file on your phone.')}</Text>}
    {status.phase === 'finishing' && <Text style={styles.meta}>{t('All parts sent. The server is putting your video together; this can take a minute for large files.')}</Text>}
    {status.resumedBytes > 0 && <Text style={styles.resumed}>
      {t('Resumed: {size} was already on the server from your earlier attempt.', { size: formatUploadBytes(status.resumedBytes) })}
    </Text>}
    {status.phase !== 'finishing' && <Text style={styles.hint}>{t('Keep GilTube open until the upload finishes. If it stops, upload the same file again to continue.')}</Text>}
  </View>;
}

const useStyles = makeStyles(() => ({
  card: { marginTop: 24, padding: 15, gap: 9, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardWarning: { borderColor: colors.warning },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '900' },
  percent: { color: colors.text, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  fill: { height: '100%', backgroundColor: colors.gilid },
  fillWarning: { backgroundColor: colors.warning },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  primary: { color: colors.text, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  meta: { color: colors.textMuted, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  warning: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  resumed: { color: colors.gilid, fontSize: 11, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 10, marginTop: 2 },
}));
