import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { themesAPI, type ThemeLibrary, type ThemeRecord } from '@/api/themes';
import { useAuth } from '@/auth/AuthProvider';

import { DEFAULT_SITE_THEME, normalizeHex, normalizeThemeStyle, safeBackgroundImage, themeAppearanceOf, themeHasBackdrop, themeScheme, type SiteTheme, type ThemeAppearance } from './themeMath';
import { applyThemeTokens, ThemeVersionContext } from './tokens';

// The active theme comes from the account (same as the website). It is cached
// on the device so the app opens in it straight away, then re-synced on sign
// in, when the app returns to the foreground and every couple of minutes -
// which is how a creator's edits reach everyone using their theme.

const CACHE_KEY = 'giltube.theme.active';
const RESYNC_INTERVAL_MS = 2 * 60 * 1000;

export const recordToSiteTheme = (record: ThemeRecord | null): SiteTheme =>
  record ? { id: record.id, name: record.name, version: record.version, ...themeAppearanceOf(record) } : DEFAULT_SITE_THEME;

function parseCached(raw: string | null): SiteTheme {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (!value?.id) return DEFAULT_SITE_THEME;
    const primary = normalizeHex(value.primary);
    const accent = normalizeHex(value.accent);
    const background = normalizeHex(value.background);
    if (!primary || !accent || !background) return DEFAULT_SITE_THEME;
    return {
      id: String(value.id),
      name: String(value.name || ''),
      version: Number(value.version) || 0,
      primary,
      accent,
      background,
      style: normalizeThemeStyle(value.style),
      backgroundImage: safeBackgroundImage(value.backgroundImage),
    };
  } catch {
    return DEFAULT_SITE_THEME;
  }
}

interface ThemeContextValue {
  /** The theme saved on the account (or the default). */
  active: SiteTheme;
  /** What the app shows right now: a preview if one is set, else `active`. */
  appearance: ThemeAppearance;
  scheme: 'light' | 'dark';
  library: ThemeLibrary | null;
  loadLibrary: () => Promise<ThemeLibrary>;
  apply: (record: ThemeRecord | null) => Promise<void>;
  install: (shareCode: string, activate: boolean) => Promise<ThemeRecord>;
  remove: (record: ThemeRecord) => Promise<void>;
  setPreview: (look: ThemeAppearance | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { status, account } = useAuth();
  const [ready, setReady] = useState(false);
  const [active, setActiveState] = useState<SiteTheme>(DEFAULT_SITE_THEME);
  const [preview, setPreviewState] = useState<ThemeAppearance | null>(null);
  const [library, setLibrary] = useState<ThemeLibrary | null>(null);
  const lastSync = useRef({ userID: '', at: 0, inFlight: false });

  const appearance = preview || active;

  // The live tokens are rewritten here, during the provider's render and
  // before any child renders. The serialized look doubles as the version that
  // makeStyles hooks compare, so they rebuild exactly when the theme changes.
  const appearanceKey = JSON.stringify(appearance);
  const version = useMemo(() => {
    applyThemeTokens(appearance, themeHasBackdrop(appearance));
    return appearanceKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appearanceKey captures appearance
  }, [appearanceKey]);

  const setActive = useCallback((theme: SiteTheme) => {
    setActiveState(theme);
    void (theme.id ? SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(theme)) : SecureStore.deleteItemAsync(CACHE_KEY)).catch(() => {});
  }, []);

  useEffect(() => {
    void SecureStore.getItemAsync(CACHE_KEY).then((raw) => {
      setActiveState(parseCached(raw));
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const sync = useCallback(async (force = false) => {
    const userID = status === 'signedIn' ? account?.id || '' : '';
    const state = lastSync.current;
    if (userID) {
      const fresh = state.userID === userID && Date.now() - state.at < RESYNC_INTERVAL_MS;
      if (state.inFlight || (!force && fresh)) return;
      state.inFlight = true;
    }
    try {
      // Signed out means the default look; signed in asks the account.
      const record = userID ? await themesAPI.active() : await Promise.resolve(null);
      if (!userID) setLibrary(null);
      setActive(recordToSiteTheme(record));
      lastSync.current = { userID, at: userID ? Date.now() : 0, inFlight: false };
    } catch {
      // Offline or the API is unreachable: keep the cached theme.
      state.inFlight = false;
    }
  }, [account?.id, setActive, status]);

  // Sign in/out: load the account's theme (or fall back to the default).
  useEffect(() => {
    if (!ready || status === 'loading') return;
    let cancelled = false;
    const userID = status === 'signedIn' ? account?.id || '' : '';
    (userID ? themesAPI.active() : Promise.resolve(null))
      .then((record) => {
        if (cancelled) return;
        if (!userID) setLibrary(null);
        setActive(recordToSiteTheme(record));
        lastSync.current = { userID, at: userID ? Date.now() : 0, inFlight: false };
      })
      .catch(() => { /* offline: keep the cached theme */ });
    return () => { cancelled = true; };
  }, [account?.id, ready, setActive, status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    return () => subscription.remove();
  }, [sync]);

  const loadLibrary = useCallback(async () => {
    const result = await themesAPI.library();
    setLibrary(result);
    setActive(recordToSiteTheme(result.themes.find((theme) => theme.id === result.active_theme_id) || null));
    return result;
  }, [setActive]);

  // Applies immediately and rolls back if the account could not be updated.
  const apply = useCallback(async (record: ThemeRecord | null) => {
    const previous = active;
    setActive(recordToSiteTheme(record));
    setLibrary((current) => current && { ...current, active_theme_id: record?.id ?? null });
    try {
      setActive(recordToSiteTheme(await themesAPI.setActive(record?.id ?? null)));
    } catch (error) {
      setActive(previous);
      setLibrary((current) => current && { ...current, active_theme_id: previous.id });
      throw error;
    }
  }, [active, setActive]);

  const install = useCallback(async (shareCode: string, activate: boolean) => {
    const record = await themesAPI.install(shareCode, activate);
    setLibrary((current) => current && {
      active_theme_id: activate ? record.id : current.active_theme_id,
      themes: current.themes.some((theme) => theme.id === record.id) ? current.themes : [...current.themes, record],
    });
    if (activate) setActive(recordToSiteTheme(record));
    return record;
  }, [setActive]);

  const remove = useCallback(async (record: ThemeRecord) => {
    if (record.is_owner) await themesAPI.remove(record.id);
    else await themesAPI.uninstall(record.id);
    setLibrary((current) => current && {
      active_theme_id: current.active_theme_id === record.id ? null : current.active_theme_id,
      themes: current.themes.filter((theme) => theme.id !== record.id),
    });
    if (active.id === record.id) setActive(DEFAULT_SITE_THEME);
  }, [active.id, setActive]);

  const value = useMemo<ThemeContextValue>(() => ({
    active,
    appearance,
    scheme: themeScheme(appearance.background),
    library,
    loadLibrary,
    apply,
    install,
    remove,
    setPreview: setPreviewState,
  }), [active, appearance, apply, install, library, loadLibrary, remove]);

  // Hold the first frame until the cached theme is in place, so the app never
  // flashes the default look.
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={value}>
      <ThemeVersionContext.Provider value={version}>{children}</ThemeVersionContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useSiteTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useSiteTheme must be used within ThemeProvider');
  return context;
}
