import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { AppLinkVerificationPrompt } from '@/app-links/AppLinkVerificationPrompt';
import { ChannelProvider } from '@/channels/ChannelProvider';
import { DownloadProvider } from '@/downloads/DownloadProvider';
import { NotificationProvider } from '@/notifications/NotificationProvider';
import { PlayerProvider } from '@/player/PlayerProvider';
import { AppSettingsProvider } from '@/settings/AppSettingsProvider';
import { colors } from '@/theme/tokens';
import { PlayStoreUpdatePrompt } from '@/updates/PlayStoreUpdatePrompt';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function RootLayout() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppSettingsProvider><ChannelProvider><NotificationProvider><DownloadProvider>
              <PlayerProvider>
                <AppLinkVerificationPrompt />
                <PlayStoreUpdatePrompt />
                <StatusBar style="light" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.canvas },
                    animation: 'fade_from_bottom',
                    animationDuration: 260,
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="login" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="video/[id]" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="live/[channelId]" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="channel/[id]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="movies/index" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="movies/[id]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="series/index" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="series/[id]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="upload" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="go-live" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="dashboard" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="notification-settings" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="watch-parties/index" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="watch-party/[id]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="playback-settings" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="channels/manage" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="playlist/[id]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
                </Stack>
              </PlayerProvider>
            </DownloadProvider></NotificationProvider></ChannelProvider></AppSettingsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
