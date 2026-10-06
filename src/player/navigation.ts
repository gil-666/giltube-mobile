import { router } from 'expo-router';

import type { Video } from '@/types/api';

// One watch screen at a time. Opening a video or live stream from a watch
// screen replaces it; from anywhere else it pushes one. Back from a watch
// screen therefore always lands on a non-watch screen, and the shared player
// is never claimed by two screens. `enforceSingleWatchScreen` (run by the
// PlayerProvider on every navigation change) removes any older watch screen
// that slipped in some other way (deep links, a watch screen left under a
// channel page, ...).

const WATCH_ROUTES = new Set(['video/[id]', 'live/[channelId]']);

interface RouteLike { key: string; name: string; state?: StateLike }
interface StateLike { key: string; index: number; routes: RouteLike[]; routeNames?: string[]; stale?: boolean }
interface NavigationRefLike {
  isReady: () => boolean;
  getRootState: () => unknown;
  dispatch: (action: { type: string; payload?: object; target?: string }) => void;
}

let navigationRef: NavigationRefLike | null = null;

/** Called once by the PlayerProvider with expo-router's navigation container ref. */
export function setPlayerNavigationRef(ref: NavigationRefLike | null) {
  navigationRef = ref;
}

/** The navigator state that holds the watch screens (the root Stack). */
function watchStack(): StateLike | null {
  if (!navigationRef?.isReady()) return null;
  const find = (state: StateLike | undefined): StateLike | null => {
    if (!state?.routes) return null;
    if (state.routeNames?.some((name) => WATCH_ROUTES.has(name))) return state;
    for (const route of state.routes) {
      const found = find(route.state);
      if (found) return found;
    }
    return null;
  };
  return find(navigationRef.getRootState() as StateLike | undefined);
}

export function isWatchPath(pathname: string) {
  return pathname.startsWith('/video/') || pathname.startsWith('/live/');
}

function topIsWatchScreen() {
  const stack = watchStack();
  const top = stack?.routes[stack.index];
  return !!top && WATCH_ROUTES.has(top.name);
}

/** Removes every watch screen except the topmost one from the stack. */
export function enforceSingleWatchScreen() {
  const stack = watchStack();
  if (!stack || !navigationRef) return;
  const watchIndexes = stack.routes.flatMap((route, index) => WATCH_ROUTES.has(route.name) ? [index] : []);
  if (watchIndexes.length < 2) return;
  const keep = watchIndexes[watchIndexes.length - 1];
  const routes = stack.routes.filter((route, index) => !WATCH_ROUTES.has(route.name) || index === keep);
  const focused = stack.routes[stack.index];
  navigationRef.dispatch({
    type: 'RESET',
    target: stack.key,
    payload: { ...stack, routes, index: Math.max(0, routes.indexOf(focused)) },
  });
}

// What the last openVideo call handed over, so the watch screen can show the
// video immediately (and offline) and play the given file.
let lastOpen: { id: string; video?: Video; sourceUri?: string } | null = null;

/** The Video object / source file passed to the last openVideo call for this id. */
export function peekOpenedVideo(id: string) {
  return lastOpen?.id === id ? lastOpen : null;
}

export interface OpenVideoOptions {
  /** A downloaded file to play instead of the stream. */
  sourceUri?: string;
  /** Ignore the saved position and the playback intro rules for resuming. */
  startOver?: boolean;
  /** Skip the playback intro (e.g. "next episode"). */
  skipIntro?: boolean;
  /** Scroll to and highlight this comment. */
  commentID?: string;
  /** Open as part of this watch party. */
  partyID?: string;
}

export function openVideo(video: Video | string, options: OpenVideoOptions = {}): void {
  const id = typeof video === 'string' ? video : video.id;
  if (!id) return;
  lastOpen = { id, video: typeof video === 'string' ? undefined : video, sourceUri: options.sourceUri };
  const params: Record<string, string> = { id };
  if (options.startOver) params.startOver = '1';
  if (options.skipIntro) params.skipIntro = '1';
  if (options.commentID) params.comment = options.commentID;
  if (options.partyID) params.party = options.partyID;
  const href = { pathname: '/video/[id]' as const, params: params as { id: string } };
  if (topIsWatchScreen()) router.replace(href);
  else router.push(href);
}

export function openLive(channelID: string): void {
  if (!channelID) return;
  const href = { pathname: '/live/[channelId]' as const, params: { channelId: channelID } };
  if (topIsWatchScreen()) router.replace(href);
  else router.push(href);
}
