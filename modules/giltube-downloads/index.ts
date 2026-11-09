import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Download progress notifications (Android). Optional: without the native
// module (older builds, iOS) every call is a no-op.

interface NativeDownloads {
  progress(key: string, title: string, text: string, percent: number, indeterminate: boolean, link: string): boolean;
  finish(key: string, title: string, text: string, failed: boolean, link: string): boolean;
  cancel(key: string): void;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeDownloads>('GiltubeDownloads') : null;

const call = (run: (module: NativeDownloads) => void) => {
  try { if (native) run(native); } catch { /* notifications are best effort */ }
};

export const downloadNotifications = {
  progress: (key: string, title: string, text: string, percent: number | null, link: string) =>
    call((module) => module.progress(key, title, text, Math.round(percent ?? 0), percent === null, link)),
  finish: (key: string, title: string, text: string, failed: boolean, link: string) =>
    call((module) => module.finish(key, title, text, failed, link)),
  cancel: (key: string) => call((module) => module.cancel(key)),
};

/** "12.4 MB" */
export function formatMB(bytes: number): string {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
