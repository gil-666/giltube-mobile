import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeelFeed } from '@/geels/GeelFeed';
import { useI18n } from '@/i18n';

// A shared or linked Geel: the feed starts there. Opened from a channel or a
// sound, it keeps scrolling within it.
export default function GeelScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; channel?: string; sound?: string }>();
  return <View style={styles.screen}>
    <GeelFeed startId={params.id} channel={params.channel} sound={params.sound} bottomInset={insets.bottom} />
    <Pressable accessibilityLabel={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/geels'))} style={[styles.back, { top: insets.top + 8 }]} hitSlop={8}>
      <Ionicons name="chevron-back" size={26} color="#fff" />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  back: { position: 'absolute', left: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
});
