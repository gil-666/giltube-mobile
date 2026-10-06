import { useEvent } from 'expo';
import { File, Paths } from 'expo-file-system';
import { router, usePathname } from 'expo-router';
import { useVideoPlayer, type VideoSource } from 'expo-video';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMusicDownloads, type MusicDownload } from '@/music/MusicDownloadsProvider';
import { MusicMiniPlayer } from '@/music/player/MusicMiniPlayer';
import { fileQualityFor, musicImage, musicSource, normalizeMusicQuality, type MusicFileQuality } from '@/music/quality';
import { claimMediaFocus, currentMediaFocus, onMediaFocusChange, releaseMediaFocus } from '@/player/mediaFocus';
import type { MusicTrack } from '@/types/api';

// GilTube Music playback: one audio-only expo-video player (no VideoView) with
// background playback and the system now-playing notification. Mirrors the
// website's player (queue, shuffle, repeat, previous/next rules) and keeps the
// queue on the device so it comes back, paused, on the next launch.

export type MusicRepeat = 'off' | 'all' | 'one';
export interface MusicNowPlaying { quality: MusicFileQuality; lossless: boolean; offline: boolean }
export interface MusicPlayerContextValue {
  queue: MusicTrack[]; index: number; current: MusicTrack | null;
  playing: boolean; buffering: boolean; position: number; duration: number;
  shuffle: boolean; repeat: MusicRepeat;
  /** What's playing: file quality in use, whether it's lossless, whether it's a downloaded file. */
  nowPlaying: MusicNowPlaying | null;
  /** Replace the queue and start at startIndex (shuffle optionally turns shuffle on first). */
  playQueue: (tracks: MusicTrack[], startIndex?: number, options?: { shuffle?: boolean }) => void;
  togglePlay: () => void; pause: () => void; next: () => void; previous: () => void; seek: (seconds: number) => void;
  setShuffle: (on: boolean) => void; cycleRepeat: () => void;
  playNext: (track: MusicTrack) => void;          // insert after current (moves if queued)
  addToQueue: (track: MusicTrack) => boolean;     // false if already queued
  removeFromQueue: (index: number) => void; moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;                          // stop, hide mini player, forget queue
  openPlayer: (view?: 'player' | 'lyrics' | 'queue') => void; // navigates to /music/player
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

const stateFile = new File(Paths.document, 'giltube-music-player.json');
const LADDER: MusicFileQuality[] = ['master', 'high', 'medium', 'low'];
const SAVE_INTERVAL_MS = 10_000;

interface SavedState { queue: MusicTrack[]; index: number; position: number; shuffle: boolean; repeat: MusicRepeat }

function isTrack(value: unknown): value is MusicTrack {
  return !!value && typeof value === 'object' && typeof (value as MusicTrack).id === 'string';
}

function readSavedState(raw: string): SavedState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    const queue = Array.isArray(parsed.queue) ? parsed.queue.filter(isTrack) : [];
    if (queue.length === 0) return null;
    const index = typeof parsed.index === 'number' ? Math.min(Math.max(0, Math.floor(parsed.index)), queue.length - 1) : 0;
    return {
      queue,
      index,
      position: typeof parsed.position === 'number' && parsed.position > 0 ? parsed.position : 0,
      shuffle: parsed.shuffle === true,
      repeat: parsed.repeat === 'all' || parsed.repeat === 'one' ? parsed.repeat : 'off',
    };
  } catch {
    return null;
  }
}

function writeSavedState(state: SavedState | null) {
  try {
    if (!state || state.queue.length === 0) {
      if (stateFile.exists) stateFile.delete();
      return;
    }
    if (!stateFile.exists) stateFile.create({ intermediates: true });
    stateFile.write(JSON.stringify(state));
  } catch {
    // Persistence is best effort.
  }
}

/** The track's own file at exactly this quality (no fallback), if it has one. */
function exactSource(track: MusicTrack, quality: MusicFileQuality) {
  const source = musicSource(track, quality);
  return source && source.quality === quality ? source : null;
}

interface Loaded {
  trackID: string;
  uri: string;
  quality: MusicFileQuality;
  offline: boolean;
  /** Qualities already tried for this track (errors walk down the ladder). */
  tried: MusicFileQuality[];
}

export function MusicPlayerProvider({ children }: React.PropsWithChildren) {
  const { account } = useAuth();
  const { getDownload } = useMusicDownloads();

  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeat] = useState<MusicRepeat>('off');
  const [nowPlaying, setNowPlaying] = useState<MusicNowPlaying | null>(null);
  const [hidden, setHidden] = useState(false);

  const queueRef = useRef<MusicTrack[]>([]);
  const indexRef = useRef(0);
  const positionRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<MusicRepeat>('off');
  const historyRef = useRef<number[]>([]);
  const loadedRef = useRef<Loaded | null>(null);
  const operationRef = useRef(0);
  const replaceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSaveRef = useRef(0);
  const restoredRef = useRef(false);
  const preferenceRef = useRef<unknown>(account?.music_quality);
  const getDownloadRef = useRef<(trackID: string) => MusicDownload | undefined>(getDownload);
  /** Whether the user wants sound (survives a source swap during error fallback). */
  const wantPlayRef = useRef(false);
  const handleErrorRef = useRef<(failedURI: string) => void>(() => undefined);
  /** True while a source swap is in flight (its rejection reports the error). */
  const replacingRef = useRef(false);
  const nextRef = useRef<() => void>(() => undefined);

  useEffect(() => { preferenceRef.current = account?.music_quality; }, [account?.music_quality]);
  useEffect(() => { getDownloadRef.current = getDownload; }, [getDownload]);

  const player = useVideoPlayer(null, (instance) => {
    instance.staysActiveInBackground = true;
    instance.showNowPlayingNotification = true;
    instance.timeUpdateEventInterval = 0.3;
    instance.loop = false;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // ---------- state helpers (keep refs and state in step) ----------

  const commitQueue = useCallback((nextQueue: MusicTrack[], nextIndex: number) => {
    queueRef.current = nextQueue;
    indexRef.current = nextIndex;
    setQueue(nextQueue);
    setIndex(nextIndex);
  }, []);

  const commitPosition = useCallback((seconds: number) => {
    positionRef.current = seconds;
    setPosition(seconds);
  }, []);

  const save = useCallback(() => {
    lastSaveRef.current = Date.now();
    if (!restoredRef.current) return;
    writeSavedState(queueRef.current.length === 0 ? null : {
      queue: queueRef.current,
      index: indexRef.current,
      position: positionRef.current,
      shuffle: shuffleRef.current,
      repeat: repeatRef.current,
    });
  }, []);

  // ---------- loading ----------

  const replaceSource = useCallback((source: VideoSource) => {
    const task = replaceQueueRef.current.catch(() => undefined).then(() => player.replaceAsync(source));
    replaceQueueRef.current = task.catch(() => undefined);
    return task;
  }, [player]);

  const enableSession = useCallback(() => {
    player.staysActiveInBackground = true;
    player.showNowPlayingNotification = true;
  }, [player]);

  const startPlayback = useCallback(() => {
    if (currentMediaFocus() !== 'music') claimMediaFocus('music');
    enableSession();
    setHidden(false);
    wantPlayRef.current = true;
    player.play();
  }, [enableSession, player]);

  /**
   * Loads queue[trackIndex]. Prefers the downloaded file, else streams the
   * account's quality; `forceQuality` is used by the error fallback.
   */
  const loadTrack = useCallback(async (trackIndex: number, options: { autoplay: boolean; startAt?: number; forceQuality?: MusicFileQuality; tried?: MusicFileQuality[] }) => {
    const track = queueRef.current[trackIndex];
    if (!track) return;
    const operation = ++operationRef.current;
    wantPlayRef.current = options.autoplay;
    const download = options.forceQuality ? undefined : getDownloadRef.current(track.id);

    let uri = '';
    let quality: MusicFileQuality;
    let lossless = false;
    if (download) {
      uri = download.fileUri;
      quality = download.quality;
      lossless = download.lossless;
    } else {
      const source = options.forceQuality
        ? exactSource(track, options.forceQuality)
        : musicSource(track, fileQualityFor(normalizeMusicQuality(preferenceRef.current)));
      if (!source) {
        loadedRef.current = null;
        setNowPlaying(null);
        player.pause();
        return;
      }
      uri = source.url;
      quality = source.quality;
      lossless = source.lossless;
    }

    const startAt = Math.max(0, options.startAt ?? 0);
    loadedRef.current = { trackID: track.id, uri, quality, offline: !!download, tried: [...(options.tried ?? []), ...(download ? [] : [quality])] };
    setNowPlaying({ quality, lossless, offline: !!download });
    setDuration(track.duration_seconds || 0);
    commitPosition(startAt);

    replacingRef.current = true;
    try {
      await replaceSource({
        uri,
        contentType: 'progressive',
        metadata: { title: track.title, artist: track.artist_name, artwork: musicImage(track.cover_url, 'lg') || undefined },
      });
    } catch {
      if (operation === operationRef.current) {
        replacingRef.current = false;
        handleErrorRef.current(uri);
      }
      return;
    }
    if (operation !== operationRef.current) return;
    replacingRef.current = false;
    if (startAt > 0) player.currentTime = startAt;
    if (options.autoplay) startPlayback(); else player.pause();
  }, [commitPosition, player, replaceSource, startPlayback]);

  // Load/playback error: offline file → stream; stream → next quality down
  // the ladder, keeping the position. Gives up at the bottom.
  const handleError = useCallback((failedURI: string) => {
    const loaded = loadedRef.current;
    const track = queueRef.current[indexRef.current];
    if (!loaded || !track || loaded.trackID !== track.id || loaded.uri !== failedURI) return;
    const resumeAt = positionRef.current;
    let candidate: MusicFileQuality | undefined;
    if (loaded.offline) {
      const wanted = fileQualityFor(normalizeMusicQuality(preferenceRef.current));
      candidate = musicSource(track, wanted)?.quality;
    } else {
      const start = LADDER.indexOf(loaded.quality) + 1;
      candidate = LADDER.slice(start).find((quality) => !loaded.tried.includes(quality) && !!exactSource(track, quality));
    }
    if (!candidate) {
      loadedRef.current = null;
      player.pause();
      return;
    }
    void loadTrack(indexRef.current, { autoplay: wantPlayRef.current, startAt: resumeAt, forceQuality: candidate, tried: loaded.tried });
  }, [loadTrack, player]);
  useEffect(() => { handleErrorRef.current = handleError; }, [handleError]);

  // ---------- navigation within the queue ----------

  const playIndex = useCallback((nextIndex: number, autoplay = true) => {
    if (nextIndex < 0 || nextIndex >= queueRef.current.length) return;
    if (nextIndex !== indexRef.current) historyRef.current.push(indexRef.current);
    if (historyRef.current.length > 100) historyRef.current.shift();
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    void loadTrack(nextIndex, { autoplay });
  }, [loadTrack]);

  /** Index after the current one, or -1 at the end (repeat off). */
  const nextIndexFrom = useCallback((current: number) => {
    const length = queueRef.current.length;
    if (length === 0) return -1;
    if (shuffleRef.current) {
      if (length === 1) return repeatRef.current === 'all' ? 0 : -1;
      let pick = Math.floor(Math.random() * (length - 1));
      if (pick >= current) pick += 1;
      return pick;
    }
    if (current + 1 < length) return current + 1;
    return repeatRef.current === 'all' ? 0 : -1;
  }, []);

  const stopAtEnd = useCallback(() => {
    player.pause();
    player.currentTime = 0;
    commitPosition(0);
    save();
  }, [commitPosition, player, save]);

  const next = useCallback(() => {
    const target = nextIndexFrom(indexRef.current);
    if (target < 0) { stopAtEnd(); return; }
    if (target === indexRef.current) {
      player.currentTime = 0;
      commitPosition(0);
      startPlayback();
      return;
    }
    playIndex(target, true);
  }, [commitPosition, nextIndexFrom, playIndex, player, startPlayback, stopAtEnd]);

  const previous = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const restart = () => {
      commitPosition(0);
      if (loadedRef.current?.trackID === queueRef.current[indexRef.current]?.id) {
        player.currentTime = 0;
        startPlayback();
      } else {
        void loadTrack(indexRef.current, { autoplay: true });
      }
    };
    if (positionRef.current > 3) { restart(); return; }
    let target = -1;
    if (shuffleRef.current) {
      while (historyRef.current.length > 0 && target < 0) {
        const candidate = historyRef.current.pop()!;
        if (candidate < queueRef.current.length) target = candidate;
      }
    }
    if (target < 0) {
      target = indexRef.current - 1;
      if (target < 0) target = repeatRef.current === 'all' ? queueRef.current.length - 1 : 0;
    }
    if (target === indexRef.current) { restart(); return; }
    indexRef.current = target;
    setIndex(target);
    void loadTrack(target, { autoplay: true });
  }, [commitPosition, loadTrack, player, startPlayback]);

  // ---------- player events ----------

  useEffect(() => {
    const ended = player.addListener('playToEnd', () => {
      if (repeatRef.current === 'one') {
        player.currentTime = 0;
        commitPosition(0);
        player.play();
        return;
      }
      nextRef.current();
    });
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!loadedRef.current) return;
      positionRef.current = currentTime;
      setPosition(currentTime);
      if (player.duration > 0) setDuration(player.duration);
      if (player.playing && Date.now() - lastSaveRef.current > SAVE_INTERVAL_MS) save();
    });
    const loaded = player.addListener('sourceLoad', ({ duration: loadedDuration }) => {
      if (loadedDuration > 0) setDuration(loadedDuration);
    });
    const statusSubscription = player.addListener('statusChange', ({ status: nextStatus }) => {
      if (nextStatus === 'error' && !replacingRef.current && loadedRef.current) handleErrorRef.current(loadedRef.current.uri);
    });
    return () => { ended.remove(); time.remove(); loaded.remove(); statusSubscription.remove(); };
  }, [commitPosition, player, save]);

  useEffect(() => { nextRef.current = next; }, [next]);

  // Lock-screen/notification play also takes focus from a video; pausing saves.
  useEffect(() => {
    if (isPlaying) {
      if (currentMediaFocus() !== 'music') claimMediaFocus('music');
    } else {
      save();
    }
  }, [isPlaying, save]);

  // A video started: pause and hide the mini player, keep the queue.
  useEffect(() => onMediaFocusChange((owner) => {
    if (owner === 'music') return;
    player.pause();
    player.showNowPlayingNotification = false;
    player.staysActiveInBackground = false;
    setHidden(true);
    save();
  }), [player, save]);

  // ---------- persistence ----------

  useEffect(() => {
    if (!stateFile.exists) { restoredRef.current = true; return; }
    void stateFile.text().then((raw) => {
      restoredRef.current = true;
      const saved = readSavedState(raw);
      // Something was queued before the file loaded: keep that.
      if (saved && queueRef.current.length === 0) {
        commitQueue(saved.queue, saved.index);
        commitPosition(saved.position);
        shuffleRef.current = saved.shuffle;
        repeatRef.current = saved.repeat;
        setShuffleState(saved.shuffle);
        setRepeat(saved.repeat);
        setDuration(saved.queue[saved.index]?.duration_seconds || 0);
      }
    }).catch(() => undefined).finally(() => { restoredRef.current = true; });
  }, [commitPosition, commitQueue]);

  // Save on track / queue / mode changes.
  useEffect(() => { save(); }, [queue, index, shuffle, repeat, save]);

  // ---------- public actions ----------

  const playQueue = useCallback((tracks: MusicTrack[], startIndex?: number, options?: { shuffle?: boolean }) => {
    const list = tracks.filter(isTrack);
    if (list.length === 0) return;
    if (options?.shuffle) { shuffleRef.current = true; setShuffleState(true); }
    const start = startIndex === undefined && options?.shuffle
      ? Math.floor(Math.random() * list.length)
      : Math.min(Math.max(0, startIndex ?? 0), list.length - 1);
    historyRef.current = [];
    commitQueue(list, start);
    setHidden(false);
    void loadTrack(start, { autoplay: true });
  }, [commitQueue, loadTrack]);

  const togglePlay = useCallback(() => {
    if (queueRef.current.length === 0) return;
    if (player.playing) { wantPlayRef.current = false; player.pause(); return; }
    const track = queueRef.current[indexRef.current];
    if (!loadedRef.current || loadedRef.current.trackID !== track?.id) {
      setHidden(false);
      void loadTrack(indexRef.current, { autoplay: true, startAt: positionRef.current });
      return;
    }
    startPlayback();
  }, [loadTrack, player, startPlayback]);

  const pause = useCallback(() => { wantPlayRef.current = false; player.pause(); }, [player]);

  const seek = useCallback((seconds: number) => {
    const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    const target = Math.min(Math.max(0, seconds), max);
    if (loadedRef.current) player.currentTime = target;
    commitPosition(target);
  }, [commitPosition, duration, player]);

  const setShuffle = useCallback((on: boolean) => {
    shuffleRef.current = on;
    historyRef.current = [];
    setShuffleState(on);
  }, []);

  const cycleRepeat = useCallback(() => {
    const nextRepeat: MusicRepeat = repeatRef.current === 'off' ? 'all' : repeatRef.current === 'all' ? 'one' : 'off';
    repeatRef.current = nextRepeat;
    setRepeat(nextRepeat);
  }, []);

  const playNext = useCallback((track: MusicTrack) => {
    const current = queueRef.current;
    if (current.length === 0) {
      commitQueue([track], 0);
      setHidden(false);
      void loadTrack(0, { autoplay: true });
      return;
    }
    const currentTrack = current[indexRef.current];
    if (currentTrack?.id === track.id) return;
    const without = current.filter((item) => item.id !== track.id);
    const currentIndex = without.findIndex((item) => item.id === currentTrack?.id);
    const nextQueue = [...without.slice(0, currentIndex + 1), track, ...without.slice(currentIndex + 1)];
    historyRef.current = [];
    commitQueue(nextQueue, Math.max(0, currentIndex));
  }, [commitQueue, loadTrack]);

  const addToQueue = useCallback((track: MusicTrack) => {
    if (queueRef.current.some((item) => item.id === track.id)) return false;
    const wasEmpty = queueRef.current.length === 0;
    commitQueue([...queueRef.current, track], wasEmpty ? 0 : indexRef.current);
    if (wasEmpty) {
      commitPosition(0);
      setDuration(track.duration_seconds || 0);
      setHidden(false);
    }
    return true;
  }, [commitPosition, commitQueue]);

  const clearQueue = useCallback(() => {
    operationRef.current += 1;
    loadedRef.current = null;
    historyRef.current = [];
    player.pause();
    player.showNowPlayingNotification = false;
    player.staysActiveInBackground = false;
    void replaceSource(null).catch(() => undefined);
    releaseMediaFocus('music');
    commitQueue([], 0);
    commitPosition(0);
    setDuration(0);
    setNowPlaying(null);
    setHidden(true);
    writeSavedState(null);
  }, [commitPosition, commitQueue, player, replaceSource]);

  const removeFromQueue = useCallback((removeIndex: number) => {
    const current = queueRef.current;
    if (removeIndex < 0 || removeIndex >= current.length) return;
    if (current.length === 1) { clearQueue(); return; }
    const nextQueue = current.filter((_, itemIndex) => itemIndex !== removeIndex);
    historyRef.current = [];
    if (removeIndex < indexRef.current) {
      commitQueue(nextQueue, indexRef.current - 1);
    } else if (removeIndex > indexRef.current) {
      commitQueue(nextQueue, indexRef.current);
    } else {
      const wasPlaying = player.playing;
      const nextIndex = Math.min(removeIndex, nextQueue.length - 1);
      commitQueue(nextQueue, nextIndex);
      void loadTrack(nextIndex, { autoplay: wasPlaying });
    }
  }, [clearQueue, commitQueue, loadTrack, player]);

  const moveInQueue = useCallback((from: number, to: number) => {
    const current = [...queueRef.current];
    if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved!);
    let nextIndex = indexRef.current;
    if (from === nextIndex) nextIndex = to;
    else if (from < nextIndex && to >= nextIndex) nextIndex -= 1;
    else if (from > nextIndex && to <= nextIndex) nextIndex += 1;
    historyRef.current = [];
    commitQueue(current, nextIndex);
  }, [commitQueue]);

  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const openPlayer = useCallback((view?: 'player' | 'lyrics' | 'queue') => {
    if (queueRef.current.length === 0) return;
    const params = view && view !== 'player' ? { view } : {};
    if (pathnameRef.current === '/music/player') router.setParams({ view: view ?? 'player' });
    else router.push({ pathname: '/music/player', params });
  }, []);

  const current = queue[index] ?? null;
  const buffering = status === 'loading';

  const value = useMemo<MusicPlayerContextValue>(() => ({
    queue, index, current, playing: isPlaying, buffering, position, duration, shuffle, repeat, nowPlaying,
    playQueue, togglePlay, pause, next, previous, seek, setShuffle, cycleRepeat,
    playNext, addToQueue, removeFromQueue, moveInQueue, clearQueue, openPlayer,
  }), [queue, index, current, isPlaying, buffering, position, duration, shuffle, repeat, nowPlaying,
    playQueue, togglePlay, pause, next, previous, seek, setShuffle, cycleRepeat,
    playNext, addToQueue, removeFromQueue, moveInQueue, clearQueue, openPlayer]);

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <MusicMiniPlayer hidden={hidden || !current} />
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (!context) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return context;
}
