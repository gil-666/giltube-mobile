import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

import { useI18n } from '@/i18n';
import { getAppLinkApprovalState, openAppLinkSettings } from './androidAppLinks';

let promptedThisLaunch = false;

export function AppLinkVerificationPrompt() {
  const { t } = useI18n();
  useEffect(() => {
    if (Platform.OS !== 'android' || promptedThisLaunch) return;
    // Android verifies domains asynchronously after installation. Give the
    // system verifier time to finish before treating the domain as unapproved.
    const timer = setTimeout(() => {
      void getAppLinkApprovalState().then((state) => {
        if (state !== 'unapproved' || promptedThisLaunch) return;
        promptedThisLaunch = true;
        Alert.alert(
          t('Open GilTube links in the app'),
          t('Your phone has not enabled giltube.gilservers.com for GilTube, so links will open in the browser. Enable the web address on the next screen.'),
          [
            { text: t('Not now'), style: 'cancel' },
            { text: t('Open link settings'), onPress: () => void openAppLinkSettings().catch(() => undefined) },
          ],
        );
      }).catch(() => undefined);
    }, 25_000);
    return () => clearTimeout(timer);
  }, [t]);

  return null;
}
