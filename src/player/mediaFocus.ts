// Only one thing plays at a time: a video (or live stream) or GilTube Music.
// Whichever starts claims focus; the other is told to stop and release its
// player, so there is never more than one active player or media
// notification.

export type MediaOwner = 'video' | 'music';

type Listener = (owner: MediaOwner) => void;

const listeners = new Set<Listener>();
let current: MediaOwner | null = null;

/** Claim playback. Every other owner's listener runs synchronously. */
export function claimMediaFocus(owner: MediaOwner) {
  current = owner;
  listeners.forEach((listener) => listener(owner));
}

/** Give focus up (e.g. after dismissing the player). */
export function releaseMediaFocus(owner: MediaOwner) {
  if (current === owner) current = null;
}

export function currentMediaFocus() {
  return current;
}

/**
 * Subscribe to focus changes; the callback receives the new owner. Each owner
 * should stop itself when another owner claims focus.
 */
export function onMediaFocusChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
