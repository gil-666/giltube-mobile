import * as WebBrowser from 'expo-web-browser';
import { router, type Href } from 'expo-router';
import { Linking } from 'react-native';

import type { NewsItem } from '@/api/news';
import { nativeRouteForWebPath } from '@/app-links/nativeWebRoute';
import { mediaOrigin } from '@/config/environment';

/** Opens an external http(s) URL in the system browser. */
export async function openExternalURL(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    await Linking.openURL(url);
  } catch {
    await WebBrowser.openBrowserAsync(url);
  }
}

/**
 * Opens a GilTube website path: in-app when a native screen exists for it,
 * otherwise on the website in the in-app browser.
 */
export async function openGilTubePath(path: string) {
  const target = path.trim();
  if (!target.startsWith('/') || target.startsWith('//')) return;
  const native = nativeRouteForWebPath(target);
  if (native) {
    router.push(native as Href);
    return;
  }
  await WebBrowser.openBrowserAsync(`${mediaOrigin}${target}`);
}

/** Follows a Markdown link or CTA target. */
export function openNewsLink(href: string, external: boolean) {
  const run = external ? openExternalURL(href) : openGilTubePath(href);
  void run.catch(() => undefined);
}

export function hasNewsCTA(item: Pick<NewsItem, 'cta_kind' | 'cta_target'>) {
  return item.cta_kind !== 'none' && !!item.cta_target.trim();
}

export function openNewsCTA(item: Pick<NewsItem, 'cta_kind' | 'cta_target'>) {
  if (!hasNewsCTA(item)) return;
  openNewsLink(item.cta_target.trim(), item.cta_kind === 'external');
}
