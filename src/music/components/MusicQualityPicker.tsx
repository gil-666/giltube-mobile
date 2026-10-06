import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { MUSIC_QUALITY_PREFERENCES, normalizeMusicQuality, type MusicQualityPreference } from '@/music/quality';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

const LABELS: Record<MusicQualityPreference, string> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', maximum: 'Maximum' };
// "Auto" has no connection signal in the app, so it plays and downloads High.
const HELP: Record<MusicQualityPreference, string> = {
  auto: 'Uses High (320 kbps AAC) in the app.',
  low: 'Up to 128 kbps AAC. Smallest downloads.',
  medium: 'Up to 256 kbps AAC.',
  high: 'Up to 320 kbps AAC.',
  maximum: 'Up to 24-bit lossless audio when available. Largest downloads.',
};

/** The account's music quality (PUT /account/music-quality). Signed-out users see a sign-in hint. */
export function MusicQualityPicker() {
  const styles = useStyles();
  const { t } = useI18n();
  const { account, status, refreshAccount } = useAuth();
  const saved = normalizeMusicQuality(account?.music_quality);
  const [pending, setPending] = useState<MusicQualityPreference | null>(null);
  const [error, setError] = useState('');
  const selected = pending ?? saved;

  const choose = async (quality: MusicQualityPreference) => {
    if (quality === saved || pending) return;
    setPending(quality);
    setError('');
    try {
      await apiRequest('/account/music-quality', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality }) });
      await refreshAccount();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save music quality.'));
    } finally {
      setPending(null);
    }
  };

  return <View style={styles.card}>
    <View style={styles.header}>
      <Ionicons name="options-outline" size={18} color={colors.text} />
      <Text style={styles.title}>{t('Music quality')}</Text>
      {!!pending && <ActivityIndicator size="small" color={colors.textMuted} />}
    </View>
    <Text style={styles.body}>{t('Streaming and new downloads use this quality. Existing downloads keep theirs.')}</Text>
    {status !== 'signedIn'
      ? <Text style={styles.hint}>{t('Sign in to choose a quality. Downloads use High until then.')}</Text>
      : <>
        <View style={styles.options}>
          {MUSIC_QUALITY_PREFERENCES.map((quality) => {
            const active = quality === selected;
            return <PressableScale key={quality} disabled={!!pending} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => void choose(quality)} style={[styles.option, active && styles.optionActive]}>
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{t(LABELS[quality])}</Text>
            </PressableScale>;
          })}
        </View>
        <Text style={styles.help}>{t(HELP[selected])}</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </>}
  </View>;
}

const useStyles = makeStyles(() => ({
  card: { padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  body: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  hint: { color: colors.textDim, fontSize: 12, marginTop: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  option: { height: 34, paddingHorizontal: 13, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  optionActive: { backgroundColor: withAlpha(colors.highlight, 0.18), borderWidth: 1, borderColor: colors.highlight },
  optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  optionTextActive: { color: colors.text },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  error: { color: colors.danger, fontSize: 12, marginTop: 6 },
}));
