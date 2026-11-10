import type { Promotion, PromotionText } from '@/types/api';

/** The language key ("en", "es") for an app locale ("en-US", "es-MX"). */
export function languageKey(locale: string) {
  return String(locale || '').toLowerCase().split('-')[0];
}

/** A movie's or series' TMDB title logo for a locale, else the English one. */
export function titleLogoURL(logos: Record<string, string> | null | undefined, locale: string) {
  if (!logos) return '';
  return logos[languageKey(locale)] || logos.en || '';
}

const promotionTextFields: (keyof PromotionText)[] = ['label', 'title', 'tagline', 'badge', 'cta_label', 'partner_caption'];

/** A promotion with its text in the locale, keeping untranslated fields. */
export function localizePromotion(promo: Promotion, locale: string): Promotion {
  const text = promo.translations?.[languageKey(locale)];
  if (!text) return promo;
  const localized = { ...promo };
  for (const field of promotionTextFields) {
    const value = text[field]?.trim();
    if (value) localized[field] = value;
  }
  return localized;
}
