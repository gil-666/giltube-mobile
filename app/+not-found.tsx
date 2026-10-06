import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, usePathname, type Href } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { nativeRouteForLocalizedWebPath } from '@/app-links/nativeWebRoute';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import { openGilTubeWeb } from '@/utils/web';

export default function UnsupportedWebRoute() {
  const styles = useStyles();
  const { t } = useI18n();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const nativeRoute = nativeRouteForLocalizedWebPath(path);
  if (nativeRoute) return <Redirect href={nativeRoute as Href} />;
  const openWeb = () => void openGilTubeWeb(path).catch((error) => Alert.alert(t('Could not open GilTube web'), error instanceof Error ? error.message : t('Please try again.')));
  return <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
    <View style={styles.icon}><Ionicons name="globe-outline" size={31} color={colors.accentBright} /></View>
    <Text style={styles.title}>{t('This page lives on GilTube web')}</Text>
    <Text style={styles.body}>{t('The link opened in the app. This section does not have a native screen yet, but you can continue on the website.')}</Text>
    <PressableScale onPress={openWeb} style={styles.primary}><Text style={styles.primaryText}>{t('Open GilTube web')}</Text><Ionicons name="open-outline" size={18} color={colors.onAccent} /></PressableScale>
    <PressableScale onPress={() => router.replace('/(tabs)')} style={styles.secondary}><Text style={styles.secondaryText}>{t('Go to Home')}</Text></PressableScale>
  </View>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, backgroundColor: colors.screen },
  icon: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.accentBright, .12) },
  title: { color: colors.text, fontSize: 23, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 20 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  primary: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22, borderRadius: radii.pill, backgroundColor: colors.accent, marginTop: 25 },
  primaryText: { color: colors.onAccent, fontSize: 13, fontWeight: '900' },
  secondary: { height: 45, justifyContent: 'center', paddingHorizontal: 20, marginTop: 8 },
  secondaryText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
}));
