const nativeStaticPaths = new Set([
  '/',
  '/account-settings',
  '/channels',
  '/create-channel',
  '/dashboard',
  '/go-live',
  '/login',
  '/movies',
  '/my-channels',
  '/notification-settings',
  '/notifications',
  '/playback-settings',
  '/playlists',
  '/search',
  '/series',
  '/settings',
  '/subscriptions',
  '/upload',
  '/watch-parties',
]);

const nativeDynamicPaths = [
  /^\/category\/[^/]+$/,
  /^\/channel\/[^/]+$/,
  /^\/live\/[^/]+$/,
  /^\/movies\/[^/]+$/,
  /^\/playlist\/[^/]+$/,
  /^\/playlists\/[^/]+$/,
  /^\/series\/[^/]+$/,
  /^\/video\/[^/]+$/,
  /^\/watch-party\/[^/]+$/,
];

/** Convert a localized GilTube website pathname to an existing native route. */
export function nativeRouteForLocalizedWebPath(pathname: string): string | null {
  const localeMatch = pathname.match(/^\/(?:es|es-mx)(?=\/|$)/i);
  if (!localeMatch) return null;

  let normalized = pathname.slice(localeMatch[0].length) || '/';
  normalized = normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;

  const liveChatMatch = normalized.match(/^\/(?:live-chat|live\/([^/]+)\/chat)(?:\/([^/]+))?$/);
  if (liveChatMatch) {
    const channelID = liveChatMatch[1] || liveChatMatch[2];
    return channelID ? `/live/${channelID}` : null;
  }

  if (nativeStaticPaths.has(normalized) || nativeDynamicPaths.some((pattern) => pattern.test(normalized))) {
    return normalized;
  }
  return null;
}
