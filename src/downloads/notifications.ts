import * as Notifications from 'expo-notifications';

import { downloadNotifications, formatMB } from '../../modules/giltube-downloads';

export { downloadNotifications, formatMB };

/** "4.2 MB / 9.8 MB · 43%", or the downloaded size while the total is unknown. */
export function progressText(bytesWritten: number, totalBytes: number): string {
  if (totalBytes <= 0) return formatMB(bytesWritten);
  const percent = Math.min(100, Math.floor(bytesWritten / totalBytes * 100));
  return `${formatMB(bytesWritten)} / ${formatMB(totalBytes)} · ${percent}%`;
}

/** Asks once for notification permission so download progress can show. */
export async function ensureNotificationPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    // Downloads work without notifications.
  }
}

/**
 * Drops progress updates that would not change the notification, so Android
 * does not rate-limit them: at most one per percent and per 600ms.
 */
export function progressThrottle() {
  let lastPercent = -1;
  let lastAt = 0;
  return (percent: number) => {
    const now = Date.now();
    if (percent === lastPercent || (now - lastAt < 600 && percent < 100)) return false;
    lastPercent = percent;
    lastAt = now;
    return true;
  };
}
