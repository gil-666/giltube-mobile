import DeviceInfo from 'react-native-device-info';
import SpInAppUpdates, { IAUInstallStatus, IAUUpdateKind, type StatusUpdateEvent } from 'sp-react-native-in-app-updates';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { useI18n } from '@/i18n';

const updateClient = Platform.OS === 'android' ? new SpInAppUpdates(false) : null;
const foregroundCheckInterval = 6 * 60 * 60 * 1000;

export function PlayStoreUpdatePrompt() {
  const { t } = useI18n();
  const checking = useRef(false);
  const lastCheckAt = useRef(0);
  const promptedBuild = useRef('');
  const readyAlertVisible = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!updateClient || checking.current || Date.now() - lastCheckAt.current < foregroundCheckInterval) return;
    checking.current = true;
    lastCheckAt.current = Date.now();
    try {
      const result = await updateClient.checkNeedsUpdate({ curVersion: DeviceInfo.getBuildNumber() });
      const availableBuild = String(result.storeVersion || 'new');
      if (!result.shouldUpdate || promptedBuild.current === availableBuild) return;
      promptedBuild.current = availableBuild;
      Alert.alert(
        t('GilTube update available'),
        t('A new closed-testing release is ready on Google Play. You can download it without leaving GilTube.'),
        [
          { text: t('Later'), style: 'cancel' },
          { text: t('Update'), onPress: () => void updateClient.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE }).catch(() => undefined) },
        ],
      );
    } catch {
      // Play Core returns an error for sideloaded builds and accounts that are
      // not enrolled in the testing track. Neither case should interrupt use.
    } finally {
      checking.current = false;
    }
  }, [t]);

  useEffect(() => {
    if (!updateClient) return;
    const onStatus = (event: StatusUpdateEvent) => {
      if (event.status !== IAUInstallStatus.DOWNLOADED || readyAlertVisible.current) return;
      readyAlertVisible.current = true;
      Alert.alert(t('Update ready'), t('The new GilTube release has finished downloading.'), [
        { text: t('Later'), style: 'cancel', onPress: () => { readyAlertVisible.current = false; } },
        { text: t('Restart and install'), onPress: () => updateClient.installUpdate() },
      ]);
    };
    updateClient.addStatusUpdateListener(onStatus);
    const initial = setTimeout(() => void checkForUpdate(), 1800);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void checkForUpdate(); });
    return () => {
      clearTimeout(initial);
      appState.remove();
      updateClient.removeStatusUpdateListener(onStatus);
    };
  }, [checkForUpdate, t]);

  return null;
}
