import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

// The app checks for an update by itself on every cold start (see app.json
// "updates"). This also checks when the app returns to the foreground, so
// people who keep it open for days still get fixes, then offers a restart
// once an update has downloaded. If ignored, it applies at the next launch.
const foregroundCheckInterval = 30 * 60 * 1000;

export function OTAUpdateBanner() {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const [dismissedID, setDismissedID] = useState('');
  const [restarting, setRestarting] = useState(false);
  const lastCheckAt = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    // The native startup check just ran.
    lastCheckAt.current = Date.now();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheckAt.current < foregroundCheckInterval) return;
      lastCheckAt.current = Date.now();
      void (async () => {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      })().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  const updateID = downloadedUpdate?.updateId || '';
  if (!Updates.isEnabled || !isUpdatePending || !updateID || dismissedID === updateID) return null;

  const restart = () => {
    setRestarting(true);
    void Updates.reloadAsync().catch(() => setRestarting(false));
  };

  return (
    <Animated.View entering={FadeInUp.duration(320)} exiting={FadeOutUp.duration(200)} pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.card} accessibilityRole="alert">
        <View style={styles.icon}><Ionicons name="sparkles" size={17} color={colors.accentBright} /></View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{t('Update ready')}</Text>
          <Text style={styles.body} numberOfLines={2}>{t('Restart GilTube to use the latest version.')}</Text>
        </View>
        <PressableScale disabled={restarting} onPress={restart} style={styles.button}>
          <Text style={styles.buttonText}>{t('Restart')}</Text>
        </PressableScale>
        <Pressable accessibilityLabel={t('Later')} hitSlop={10} onPress={() => setDismissedID(updateID)} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 1000 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 8,
    borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.accentBright, 0.14) },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  button: { height: 34, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  buttonText: { color: colors.onAccent, fontSize: 13, fontWeight: '900' },
  close: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' },
}));
