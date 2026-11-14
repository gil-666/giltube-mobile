import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

// OTA updates apply silently. The app checks on every cold start (app.json
// "updates") and when it returns to the foreground after 30 minutes,
// downloading in the background. A downloaded update loads on the next cold
// start, or right away when the app comes back after a long absence, since
// nobody is mid-video at that point. There is never a prompt.
const foregroundCheckInterval = 30 * 60 * 1000;
const silentReloadAfterBackground = 30 * 60 * 1000;

export function SilentOTAUpdates() {
  const { isUpdatePending } = Updates.useUpdates();
  const lastCheckAt = useRef(0);
  const backgroundedAt = useRef(0);
  const pending = useRef(false);

  useEffect(() => { pending.current = isUpdatePending; }, [isUpdatePending]);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    // The native startup check just ran.
    lastCheckAt.current = Date.now();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = 0;
      if (pending.current && away >= silentReloadAfterBackground) {
        void Updates.reloadAsync().catch(() => undefined);
        return;
      }
      if (Date.now() - lastCheckAt.current < foregroundCheckInterval) return;
      lastCheckAt.current = Date.now();
      void (async () => {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      })().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
