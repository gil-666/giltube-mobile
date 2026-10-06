import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

/** Floating back button (and optional right-side content) over a music screen. */
export function MusicBackBar({ right, overArtwork = false }: { right?: ReactNode; overArtwork?: boolean }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return <View pointerEvents="box-none" style={[styles.bar, { paddingTop: insets.top + 6 }]}>
    <PressableScale accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/music'))} style={[styles.round, overArtwork && styles.roundOverArtwork]}>
      <Ionicons name="chevron-back" size={24} color={overArtwork ? colors.white : colors.text} />
    </PressableScale>
    <View style={styles.right}>{right}</View>
  </View>;
}

/** A round icon button that matches MusicBackBar. */
export function MusicIconButton({ icon, label, onPress, overArtwork = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; overArtwork?: boolean }) {
  const styles = useStyles();
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, overArtwork && styles.roundOverArtwork]}>
    <Ionicons name={icon} size={21} color={overArtwork ? colors.white : colors.text} />
  </PressableScale>;
}

/** Centered loading / error / empty message. */
export function MusicState({ kind, title, body, onRetry }: { kind: 'loading' | 'error' | 'empty'; title?: string; body?: string; onRetry?: () => void }) {
  const styles = useStyles();
  const { t } = useI18n();
  if (kind === 'loading') return <View style={styles.state}><ActivityIndicator color={colors.accentBright} size="large" /></View>;
  return <View style={styles.state}>
    <View style={styles.stateIcon}><Ionicons name={kind === 'error' ? 'cloud-offline-outline' : 'musical-notes-outline'} size={28} color={colors.accentBright} /></View>
    {!!title && <Text style={styles.stateTitle}>{title}</Text>}
    {!!body && <Text style={styles.stateBody}>{body}</Text>}
    {!!onRetry && <PressableScale onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>{t('Try again')}</Text></PressableScale>}
  </View>;
}

const useStyles = makeStyles(() => ({
  bar: { position: 'absolute', zIndex: 10, top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.canvas, 0.72) },
  roundOverArtwork: { backgroundColor: 'rgba(0,0,0,.45)' },
  state: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 140, paddingBottom: 40 },
  stateIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.accentBright, 0.12) },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  stateBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  retry: { marginTop: 18, height: 40, paddingHorizontal: 20, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '800' },
}));
