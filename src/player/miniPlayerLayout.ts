import { usePathname, useSegments } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Where mini players (video and music) sit: just above the bottom tab bar on
// tab screens, and at the bottom edge on every other screen so they never
// float over empty space. Both mini players use this, and only one of them is
// ever visible (see mediaFocus.ts).

/** Height of the bottom tab bar for a given bottom inset; shared with app/(tabs)/_layout.tsx. */
export function tabBarHeight(bottomInset: number) {
  return (Platform.OS === 'ios' ? 52 : 60) + bottomInset;
}

/** The bottom inset the tab bar uses. */
export function tabBarBottomInset(safeAreaBottom: number) {
  return Math.max(safeAreaBottom, Platform.OS === 'ios' ? 20 : 8);
}

export const MINI_PLAYER_HEIGHT = 64;
const GAP = 8;

// Screens where no mini player should show at all.
const HIDDEN_PATHS = [/^\/login$/, /^\/auth\//, /^\/go-live$/, /^\/upload$/];

export interface MiniPlayerLayout {
  /** Whether a mini player may show on the current screen. */
  visible: boolean;
  /** Distance from the bottom of the screen to the mini player's bottom edge. */
  bottom: number;
  /** Extra bottom padding a scrolling screen needs so its last item clears the mini player. */
  contentInset: number;
  /** True when the tab bar is showing under the mini player. */
  aboveTabBar: boolean;
}

export function useMiniPlayerLayout(): MiniPlayerLayout {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const pathname = usePathname();
  const aboveTabBar = segments[0] === '(tabs)';
  const visible = !HIDDEN_PATHS.some((pattern) => pattern.test(pathname));
  const bottom = aboveTabBar
    ? tabBarHeight(tabBarBottomInset(insets.bottom)) + GAP
    : Math.max(insets.bottom, 8) + GAP;
  return { visible, bottom, contentInset: bottom + MINI_PLAYER_HEIGHT + GAP, aboveTabBar };
}
