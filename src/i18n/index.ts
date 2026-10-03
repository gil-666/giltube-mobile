import { useCallback, useMemo } from 'react';

import { useAppSettings } from '@/settings/AppSettingsProvider';

import { esMX } from './es-MX';

export type SupportedLocale = 'en-US' | 'es-MX';
type Values = Record<string, string | number>;

export function formatRelativeTime(value: string | number | Date, locale: SupportedLocale, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(1, Math.floor((now - timestamp) / 1000));
  const spanish = locale === 'es-MX';
  if (seconds < 60) return spanish ? 'justo ahora' : 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return spanish ? `hace ${minutes} min` : `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return spanish ? `hace ${hours} h` : `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) {
    if (days === 1) return spanish ? 'ayer' : 'yesterday';
    return spanish ? `hace ${days} días` : `${days} days ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return spanish ? 'hace 1 sem' : '1 wk ago';
  return spanish ? `hace ${weeks} sem` : `${weeks} wks ago`;
}

export function systemLocale(): SupportedLocale {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('es') ? 'es-MX' : 'en-US';
  } catch {
    return 'en-US';
  }
}

export function useI18n() {
  const { settings } = useAppSettings();
  const locale = useMemo<SupportedLocale>(() => settings.language === 'system' ? systemLocale() : settings.language, [settings.language]);
  const t = useCallback((source: string, values?: Values) => {
    let result = locale === 'es-MX' ? esMX[source] || source : source;
    if (values) Object.entries(values).forEach(([key, value]) => { result = result.replaceAll(`{${key}}`, String(value)); });
    return result;
  }, [locale]);
  const compactNumber = useCallback((value = 0) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value), [locale]);
  const number = useCallback((value = 0) => new Intl.NumberFormat(locale).format(value), [locale]);
  const dateTime = useCallback((value: string | number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) => new Intl.DateTimeFormat(locale, options).format(new Date(value)), [locale]);
  const relative = useCallback((value: string | number | Date) => formatRelativeTime(value, locale), [locale]);
  return { t, locale, compactNumber, number, dateTime, relative };
}
