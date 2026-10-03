import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { notificationIDFromData, openNotificationContext } from '@/notifications/navigation';
import { localNotificationContent } from '@/notifications/presentation';

const pushTokenKey = 'giltube.push.token.v1';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

export function NotificationProvider({ children }: React.PropsWithChildren) {
  const { account, status } = useAuth();
  const { t } = useI18n();
  const client = useQueryClient();
  const pendingReadID = useRef('');
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => {
    const handled = new Set<string>();
    const handleResponse = (event: Notifications.NotificationResponse) => {
      const requestID = event.notification.request.identifier;
      if (handled.has(requestID)) return;
      handled.add(requestID);
      const data = event.notification.request.content.data || {};
      const notificationID = notificationIDFromData(data);
      if (notificationID && statusRef.current === 'signedIn') {
        void giltubeAPI.markNotificationRead(notificationID).then(() => {
          void client.invalidateQueries({ queryKey: ['notifications'] });
          void client.invalidateQueries({ queryKey: ['notification-count'] });
        }).catch(() => undefined);
      } else {
        pendingReadID.current = notificationID;
      }
      openNotificationContext(data);
      void Notifications.clearLastNotificationResponseAsync();
    };
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      handleResponse(event);
    });
    void Notifications.getLastNotificationResponseAsync().then((event) => { if (event) handleResponse(event); });
    return () => response.remove();
  }, [client]);
  useEffect(() => {
    const notificationID = pendingReadID.current;
    if (status !== 'signedIn' || !notificationID) return;
    pendingReadID.current = '';
    void giltubeAPI.markNotificationRead(notificationID).then(() => {
      void client.invalidateQueries({ queryKey: ['notifications'] });
      void client.invalidateQueries({ queryKey: ['notification-count'] });
    }).catch(() => undefined);
  }, [client, status]);
  useEffect(() => {
    if (status !== 'signedIn' || !account) return;
    let active = true;
    let remotePushEnabled = false;
    const markerKey = `giltube.notifications.latest.${account.id}`;
    const setup = async () => {
      try {
        if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('giltube', { name: t('GilTube activity'), description: t('Uploads, watch parties, subscriptions, comments, likes, and live activity'), importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 180, 120, 180], lightColor: '#ef4444', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, showBadge: true, sound: 'default', enableLights: true, enableVibrate: true });
        const permissions = await Notifications.requestPermissionsAsync();
        if (Platform.OS === 'android' && permissions.granted) {
          const deviceToken = await Notifications.getDevicePushTokenAsync();
          if (typeof deviceToken.data === 'string' && deviceToken.data) {
            const registration = await giltubeAPI.registerMobilePushToken(deviceToken.data, 'android', 'GilTube Android');
            await SecureStore.setItemAsync(pushTokenKey, deviceToken.data);
            remotePushEnabled = registration.fcm_enabled;
          }
        }
      } catch {
        // Keep polling as a fallback while the backend or FCM is unavailable.
        remotePushEnabled = false;
      }
    };
    const poll = async () => {
      try {
        const result = await giltubeAPI.notifications(); if (!active || !result.items.length) return;
        const previous = await SecureStore.getItemAsync(markerKey); const latest = result.items[0].created_at;
        if (previous && !remotePushEnabled) {
          const fresh = result.items.filter((item) => !item.is_read && new Date(item.created_at) > new Date(previous)).reverse().slice(-4);
          for (const item of fresh) await Notifications.scheduleNotificationAsync({ content: localNotificationContent(item, t), trigger: null });
        }
        await SecureStore.setItemAsync(markerKey, latest);
        await Notifications.setBadgeCountAsync(result.items.filter((item) => !item.is_read).length);
      } catch { /* The in-app feed remains available if OS notifications are denied. */ }
    };
    void setup().then(poll); const timer = setInterval(poll, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [account, status, t]);
  return children;
}
