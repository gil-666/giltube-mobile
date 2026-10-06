const nativeStaticPaths = new Set([
  '/',
  '/account-settings',
  '/channels',
  '/create-channel',
  '/dashboard',
  '/go-live',
  '/login',
  '/movies',
  '/music',
  '/music/downloads',
  '/music/search',
  '/my-channels',
  '/notification-settings',
  '/notifications',
  '/playback-settings',
  '/playlists',
  '/search',
  '/series',
  '/settings',
  '/subscriptions',
  '/themes',
  '/upload',
  '/watch-parties',
]);

const nativeDynamicPaths = [
  /^\/category\/[^/]+$/,
  /^\/channel\/[^/]+$/,
  /^\/live\/[^/]+$/,
  /^\/movies\/[^/]+$/,
  /^\/music\/artists\/[^/]+$/,
  /^\/music\/releases\/[^/]+$/,
  /^\/music\/tracks\/[^/]+$/,
  /^\/news\/[^/]+$/,
  /^\/playlist\/[^/]+$/,
  /^\/playlists\/[^/]+$/,
  /^\/series\/[^/]+$/,
  /^\/themes\/[^/]+$/,
  /^\/video\/[^/]+$/,
  /^\/watch-party\/[^/]+$/,
];

function nativePathFor(normalized: string): string | null {
  const liveChatMatch = normalized.match(/^\/(?:live-chat|live\/([^/]+)\/chat)(?:\/([^/]+))?$/);
  if (liveChatMatch) {
    const channelID = liveChatMatch[1] || liveChatMatch[2];
    return channelID ? `/live/${channelID}` : null;
  }

  // The web music library is the queue; the app's equivalent is the Music tab.
  if (normalized === '/music/library') return '/music';

  if (nativeStaticPaths.has(normalized) || nativeDynamicPaths.some((pattern) => pattern.test(normalized))) {
    return normalized;
  }
  return null;
}

function trimTrailingSlash(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/** Convert a localized GilTube website pathname to an existing native route. */
export function nativeRouteForLocalizedWebPath(pathname: string): string | null {
  const localeMatch = pathname.match(/^\/(?:es|es-mx)(?=\/|$)/i);
  if (!localeMatch) return null;
  return nativePathFor(trimTrailingSlash(pathname.slice(localeMatch[0].length) || '/'));
}

/**
 * Convert any GilTube website path (with or without a locale prefix, with an
 * optional ?query and #hash) to a native route, or null when the app has no
 * screen for it. The query string is kept for the native route; the hash is
 * dropped.
 */
export function nativeRouteForWebPath(path: string): string | null {
  const match = path.trim().match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  let pathname = match?.[1] || '/';
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return null;
  const query = match?.[2] && match[2].length > 1 ? match[2] : '';
  const localeMatch = pathname.match(/^\/(?:es|es-mx|en|en-us)(?=\/|$)/i);
  if (localeMatch) pathname = pathname.slice(localeMatch[0].length) || '/';
  const native = nativePathFor(trimTrailingSlash(pathname));
  return native ? `${native}${query}` : null;
}
