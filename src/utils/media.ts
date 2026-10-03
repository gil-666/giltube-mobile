import { mediaOrigin } from '@/config/environment';

export function resolveMediaURL(value?: string | null): string {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${mediaOrigin}${value.startsWith('/') ? '' : '/'}${value}`;
}

export function compactNumber(value = 0): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
