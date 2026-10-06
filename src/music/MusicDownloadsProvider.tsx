import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { fileQualityFor, musicSource, normalizeMusicQuality, type MusicFileQuality } from '@/music/quality';
import type { MusicTrack } from '@/types/api';

// Offline GilTube Music: tracks download in the account's music quality (the
// same file the player would stream), one at a time, into
// Paths.document/giltube-music/<trackId>.<ext>. Metadata keeps the full track
// so downloads play with no connection.

export interface MusicDownload { track: MusicTrack; fileUri: string; quality: MusicFileQuality; lossless: boolean; bytes: number; downloadedAt: string }
export interface MusicDownloadActivity { status: 'queued' | 'downloading' | 'failed'; progress: number }
export interface MusicDownloadsContextValue {
  downloads: MusicDownload[];                       // newest first
  activity: Record<string, MusicDownloadActivity>;  // by track id
  /** Download tracks in the account's music quality; already-downloaded ones are skipped. */
  downloadTracks: (tracks: MusicTrack[]) => Promise<void>;
  remove: (trackID: string) => Promise<void>;
  removeRelease: (releaseID: string) => Promise<void>;
  getDownload: (trackID: string) => MusicDownload | undefined;
  /** Total bytes used by music downloads. */
  totalBytes: number;
}

const MusicDownloadsContext = createContext<MusicDownloadsContextValue | null>(null);
const musicDirectory = new Directory(Paths.document, 'giltube-music');
const metadataFile = new File(Paths.document, 'giltube-music.json');

function ensureStorage() {
  musicDirectory.create({ intermediates: true, idempotent: true });
}

function saveMetadata(downloads: MusicDownload[]) {
  try {
    if (!metadataFile.exists) metadataFile.create({ intermediates: true });
    metadataFile.write(JSON.stringify(downloads));
  } catch {
    // Storage full or unavailable: the in-memory list still works this session.
  }
}

function isMusicDownload(value: unknown): value is MusicDownload {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<MusicDownload>;
  return typeof entry.fileUri === 'string'
    && typeof entry.quality === 'string'
    && typeof entry.bytes === 'number'
    && !!entry.track
    && typeof entry.track.id === 'string';
}

function deleteFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

export function MusicDownloadsProvider({ children }: React.PropsWithChildren) {
  const { account } = useAuth();
  const [downloads, setDownloads] = useState<MusicDownload[]>([]);
  const [activity, setActivity] = useState<Record<string, MusicDownloadActivity>>({});
  const downloadsRef = useRef<MusicDownload[]>([]);
  const queueRef = useRef<MusicTrack[]>([]);
  const activeRef = useRef<{ track: MusicTrack; abort: AbortController } | null>(null);
  const pumpRef = useRef<Promise<void> | null>(null);
  const musicQualityRef = useRef<unknown>(account?.music_quality);

  useEffect(() => { musicQualityRef.current = account?.music_quality; }, [account?.music_quality]);

  useEffect(() => {
    try { ensureStorage(); } catch { /* created on first download */ }
    if (!metadataFile.exists) return;
    void metadataFile.text().then((raw) => {
      try {
        const parsed: unknown = JSON.parse(raw);
        const saved = Array.isArray(parsed) ? parsed.filter(isMusicDownload) : [];
        const available = saved.filter((entry) => new File(entry.fileUri).exists);
        // Downloads finished before the metadata loaded stay on top.
        const merged = [...downloadsRef.current, ...available.filter((entry) => !downloadsRef.current.some((item) => item.track.id === entry.track.id))];
        downloadsRef.current = merged;
        setDownloads(merged);
        if (available.length !== saved.length || merged.length !== available.length) saveMetadata(merged);
      } catch {
        saveMetadata(downloadsRef.current);
      }
    }).catch(() => undefined);
  }, []);

  const updateActivity = useCallback((trackID: string, value?: MusicDownloadActivity) => {
    setActivity((current) => {
      const next = { ...current };
      if (value) next[trackID] = value;
      else delete next[trackID];
      return next;
    });
  }, []);

  const commit = useCallback((next: MusicDownload[]) => {
    downloadsRef.current = next;
    saveMetadata(next);
    setDownloads(next);
  }, []);

  const downloadOne = useCallback(async (track: MusicTrack) => {
    const source = musicSource(track, fileQualityFor(normalizeMusicQuality(musicQualityRef.current)));
    if (!source) throw new Error('This track has no audio file.');
    ensureStorage();
    const destination = new File(musicDirectory, `${track.id}.${source.extension}`);
    if (destination.exists) destination.delete();

    const abort = new AbortController();
    activeRef.current = { track, abort };
    updateActivity(track.id, { status: 'downloading', progress: 0 });
    let lastProgress = 0;
    try {
      const task = File.createDownloadTask(source.url, destination, {
        sessionType: 'background',
        signal: abort.signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (abort.signal.aborted) return;
          const progress = totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 0;
          if (progress - lastProgress < 0.01 && progress < 1) return;
          lastProgress = progress;
          updateActivity(track.id, { status: 'downloading', progress });
        },
      });
      const file = await task.downloadAsync();
      if (abort.signal.aborted) { deleteFile(destination.uri); return; }
      if (!file || !file.exists || file.size <= 0) throw new Error('The downloaded file is empty.');

      const entry: MusicDownload = {
        track,
        fileUri: file.uri,
        quality: source.quality,
        lossless: source.lossless,
        bytes: file.size,
        downloadedAt: new Date().toISOString(),
      };
      commit([entry, ...downloadsRef.current.filter((item) => item.track.id !== track.id)]);
      updateActivity(track.id);
    } catch (error) {
      deleteFile(destination.uri);
      if (abort.signal.aborted) return;
      throw error;
    } finally {
      if (activeRef.current?.abort === abort) activeRef.current = null;
    }
  }, [commit, updateActivity]);

  const pump = useCallback(() => {
    if (pumpRef.current) return pumpRef.current;
    const run = async () => {
      for (let track = queueRef.current.shift(); track; track = queueRef.current.shift()) {
        try {
          await downloadOne(track);
        } catch {
          updateActivity(track.id, { status: 'failed', progress: 0 });
        }
      }
    };
    const task = run().finally(() => { pumpRef.current = null; });
    pumpRef.current = task;
    return task;
  }, [downloadOne, updateActivity]);

  const downloadTracks = useCallback(async (tracks: MusicTrack[]) => {
    const added: MusicTrack[] = [];
    for (const track of tracks) {
      if (!track?.id) continue;
      if (downloadsRef.current.some((entry) => entry.track.id === track.id)) continue;
      if (activeRef.current?.track.id === track.id) continue;
      if (queueRef.current.some((item) => item.id === track.id)) continue;
      if (added.some((item) => item.id === track.id)) continue;
      added.push(track);
    }
    if (added.length === 0) return;
    queueRef.current.push(...added);
    setActivity((current) => {
      const next = { ...current };
      added.forEach((track) => { next[track.id] = { status: 'queued', progress: 0 }; });
      return next;
    });
    await pump();
  }, [pump]);

  const cancel = useCallback((matches: (track: MusicTrack) => boolean, ids: Set<string>) => {
    queueRef.current = queueRef.current.filter((track) => {
      if (!matches(track)) return true;
      ids.add(track.id);
      return false;
    });
    const active = activeRef.current;
    if (active && matches(active.track)) {
      ids.add(active.track.id);
      active.abort.abort();
    }
  }, []);

  const remove = useCallback(async (trackID: string) => {
    const ids = new Set([trackID]);
    cancel((track) => track.id === trackID, ids);
    const match = downloadsRef.current.find((entry) => entry.track.id === trackID);
    if (match) {
      deleteFile(match.fileUri);
      commit(downloadsRef.current.filter((entry) => entry.track.id !== trackID));
    }
    updateActivity(trackID);
  }, [cancel, commit, updateActivity]);

  const removeRelease = useCallback(async (releaseID: string) => {
    const ids = new Set<string>();
    cancel((track) => track.release_id === releaseID, ids);
    const removed = downloadsRef.current.filter((entry) => entry.track.release_id === releaseID);
    removed.forEach((entry) => { deleteFile(entry.fileUri); ids.add(entry.track.id); });
    if (removed.length > 0) commit(downloadsRef.current.filter((entry) => entry.track.release_id !== releaseID));
    setActivity((current) => {
      const next = { ...current };
      ids.forEach((id) => { delete next[id]; });
      return next;
    });
  }, [cancel, commit]);

  const getDownload = useCallback(
    (trackID: string) => downloads.find((entry) => entry.track.id === trackID),
    [downloads],
  );

  const totalBytes = useMemo(() => downloads.reduce((sum, entry) => sum + (entry.bytes || 0), 0), [downloads]);

  const value = useMemo<MusicDownloadsContextValue>(
    () => ({ downloads, activity, downloadTracks, remove, removeRelease, getDownload, totalBytes }),
    [downloads, activity, downloadTracks, remove, removeRelease, getDownload, totalBytes],
  );
  return <MusicDownloadsContext.Provider value={value}>{children}</MusicDownloadsContext.Provider>;
}

export function useMusicDownloads() {
  const context = useContext(MusicDownloadsContext);
  if (!context) throw new Error('useMusicDownloads must be used within MusicDownloadsProvider');
  return context;
}
