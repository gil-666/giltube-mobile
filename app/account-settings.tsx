import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { openGilTubeWeb } from '@/utils/web';

export default function AccountSettingsLink() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const open = () => void openGilTubeWeb('/account-settings').catch((error) => Alert.alert(t('Could not open GilTube web'), error instanceof Error ? error.message : t('Please try again.')));
  return <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}><View style={styles.header}><PressableScale onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={25} color={colors.text} /></PressableScale><Text style={styles.heading}>{t('Account settings')}</Text></View><View style={styles.content}><View style={styles.icon}><Ionicons name="person-outline" size={30} color={colors.gilid} /></View><Text style={styles.title}>{t('Manage your GilTube account')}</Text><Text style={styles.body}>{t('Account security and linked identity settings are available on GilTube web.')}</Text><PressableScale onPress={open} style={styles.button}><Text style={styles.buttonText}>{t('Open account settings')}</Text><Ionicons name="open-outline" size={18} color={colors.onAccent} /></PressableScale></View></View>;
}

const useStyles = makeStyles(() => ({ screen: { flex: 1, backgroundColor: colors.screen }, header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }, back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, heading: { color: colors.text, fontSize: 22, fontWeight: '900', marginLeft: 5 }, content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, icon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,211,238,.12)' }, title: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 18 }, body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 }, button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, paddingHorizontal: 20, borderRadius: radii.pill, backgroundColor: colors.accent }, buttonText: { color: colors.onAccent, fontSize: 13, fontWeight: '900' } }));
