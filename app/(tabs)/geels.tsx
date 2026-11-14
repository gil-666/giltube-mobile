import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeelFeed } from '@/geels/GeelFeed';
import { tabBarBottomInset, tabBarHeight } from '@/player/miniPlayerLayout';

export default function GeelsTab() {
  const insets = useSafeAreaInsets();
  return <GeelFeed bottomInset={tabBarHeight(tabBarBottomInset(insets.bottom))} />;
}
