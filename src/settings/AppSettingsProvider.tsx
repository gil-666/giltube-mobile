import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface AppSettings {
  language: 'system' | 'en-US' | 'es-MX';
  pipEnabled: boolean;
  backgroundPlayback: boolean;
  resumePlayback: boolean;
  doubleTapSeconds: 5 | 10 | 15;
  // Play the HDR ladder when the title and device support it.
  hdrEnabled: boolean;
}

const defaults: AppSettings = { language: 'system', pipEnabled: true, backgroundPlayback: true, resumePlayback: true, doubleTapSeconds: 10, hdrEnabled: true };
const storageKey = 'giltube.app-settings.v1';
const Context = createContext<{ settings: AppSettings; ready: boolean; update: (values: Partial<AppSettings>) => Promise<void>; reset: () => Promise<void> } | null>(null);

export function AppSettingsProvider({ children }: React.PropsWithChildren) {
  const [settings, setSettings] = useState(defaults); const [ready, setReady] = useState(false);
  useEffect(() => { void SecureStore.getItemAsync(storageKey).then((raw) => { if (raw) setSettings({ ...defaults, ...JSON.parse(raw) }); }).catch(() => undefined).finally(() => setReady(true)); }, []);
  const update = useCallback(async (values: Partial<AppSettings>) => { const next = { ...settings, ...values }; setSettings(next); await SecureStore.setItemAsync(storageKey, JSON.stringify(next)); }, [settings]);
  const reset = useCallback(async () => { setSettings(defaults); await SecureStore.deleteItemAsync(storageKey); }, []);
  const value = useMemo(() => ({ settings, ready, update, reset }), [ready, reset, settings, update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppSettings() { const value = useContext(Context); if (!value) throw new Error('useAppSettings must be used inside AppSettingsProvider'); return value; }
