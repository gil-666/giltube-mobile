import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n';

import { GeelFeed } from '@/geels/GeelFeed';
import { tabBarBottomInset, tabBarHeight } from '@/player/miniPlayerLayout';

export default function GeelsTab() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { status } = useAuth();
  return <View style={{ flex: 1 }}>
    <GeelFeed bottomInset={tabBarHeight(tabBarBottomInset(insets.bottom))} />
    <Pressable
      accessibilityLabel={t('Create a Geel')}
      onPress={() => router.push(status === 'signedIn' ? '/geels/create' : '/login')}
      style={{ position: 'absolute', top: insets.top + 8, left: 14, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}
      hitSlop={8}
    >
      <Ionicons name="camera-outline" size={22} color="#fff" />
    </Pressable>
  </View>;
}
