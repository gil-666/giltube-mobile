import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { giltubeAPI } from '@/api/giltube';
import type { Video } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';

export interface OfflineDownload {
  video: Video;
  fileUri: string;
  quality: string;
  bytes: number;
  downloadedAt: string;
}

export interface DownloadActivity {
  status: 'preparing' | 'downloading' | 'failed';
  progress: number;
  message: string;
  bytesWritten: number;
  totalBytes: number;
  quality: string;
}

interface DownloadContextValue {
  downloads: OfflineDownload[];
  activity: Record<string, DownloadActivity>;
  download: (video: Video, quality: string) => Promise<void>;
  remove: (videoID: string) => Promise<void>;
  getDownload: (videoID: string) => OfflineDownload | undefined;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);
const downloadDirectory = new Directory(Paths.document, 'giltube-downloads');
const metadataFile = new File(Paths.document, 'giltube-downloads.json');

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function ensureStorage() {
  downloadDirectory.create({ intermediates: true, idempotent: true });
}

function saveMetadata(downloads: OfflineDownload[]) {
  if (!metadataFile.exists) metadataFile.create({ intermediates: true });
  metadataFile.write(JSON.stringify(downloads));
}

function isOfflineDownload(value: unknown): value is OfflineDownload {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<OfflineDownload>;
  return typeof entry.fileUri === 'string'
    && typeof entry.quality === 'string'
    && typeof entry.bytes === 'number'
    && !!entry.video
    && typeof entry.video.id === 'string';
}

export function DownloadProvider({ children }: React.PropsWithChildren) {
  const [downloads, setDownloads] = useState<OfflineDownload[]>([]);
  const [activity, setActivity] = useState<Record<string, DownloadActivity>>({});
  const activeIDs = useRef(new Set<string>());
  const downloadsRef = useRef<OfflineDownload[]>([]);

  useEffect(() => {
    ensureStorage();
    if (!metadataFile.exists) return;
    void metadataFile.text().then((raw) => {
      try {
        const parsed: unknown = JSON.parse(raw);
        const saved = Array.isArray(parsed) ? parsed.filter(isOfflineDownload) : [];
        const available = saved.filter((entry) => new File(entry.fileUri).exists);
        downloadsRef.current = available;
        setDownloads(available);
        if (available.length !== saved.length) saveMetadata(available);
      } catch {
        saveMetadata([]);
      }
    });
  }, []);

  const updateActivity = useCallback((videoID: string, value?: DownloadActivity) => {
    setActivity((current) => {
      const next = { ...current };
      if (value) next[videoID] = value;
      else delete next[videoID];
      return next;
    });
  }, []);

  const download = useCallback(async (video: Video, requestedQuality: string) => {
    if (activeIDs.current.has(video.id) || downloadsRef.current.some((entry) => entry.video.id === video.id)) return;
    activeIDs.current.add(video.id);
    updateActivity(video.id, { status: 'preparing', progress: 0, message: 'Preparing offline video…', bytesWritten: 0, totalBytes: 0, quality: requestedQuality });

    try {
      let preparation = await giltubeAPI.prepareDownload(video.id, requestedQuality);
      const startedAt = Date.now();
      while (preparation.status !== 'ready' || !preparation.file_url) {
        if (Date.now() - startedAt > 5 * 60_000) throw new Error('The server took too long to prepare this video.');
        await wait(2_000);
        preparation = await giltubeAPI.downloadStatus(video.id, preparation.selected_quality);
        updateActivity(video.id, { status: 'preparing', progress: 0, message: preparation.message || 'Preparing offline video…', bytesWritten: 0, totalBytes: 0, quality: preparation.selected_quality });
      }

      ensureStorage();
      const destination = new File(downloadDirectory, `${video.id}.mp4`);
      if (destination.exists) destination.delete();
      updateActivity(video.id, { status: 'downloading', progress: 0, message: 'Downloading…', bytesWritten: 0, totalBytes: 0, quality: preparation.selected_quality });

      const task = File.createDownloadTask(resolveMediaURL(preparation.file_url), destination, {
        sessionType: 'background',
        onProgress: ({ bytesWritten, totalBytes }) => {
          const progress = totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 0;
          updateActivity(video.id, {
            status: 'downloading',
            progress,
            message: totalBytes > 0 ? `Downloading ${Math.round(progress * 100)}%` : 'Downloading…',
            bytesWritten,
            totalBytes,
            quality: preparation.selected_quality,
          });
        },
      });
      const file = await task.downloadAsync();
      if (!file || !file.exists || file.size <= 0) throw new Error('The downloaded video is empty.');

      const entry: OfflineDownload = {
        video,
        fileUri: file.uri,
        quality: preparation.selected_quality,
        bytes: file.size,
        downloadedAt: new Date().toISOString(),
      };
      const next = [entry, ...downloadsRef.current.filter((item) => item.video.id !== video.id)];
      downloadsRef.current = next;
      saveMetadata(next);
      setDownloads(next);
      updateActivity(video.id);
    } catch (error) {
      updateActivity(video.id, {
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'Download failed.',
        bytesWritten: 0,
        totalBytes: 0,
        quality: requestedQuality,
      });
      throw error;
    } finally {
      activeIDs.current.delete(video.id);
    }
  }, [updateActivity]);

  const remove = useCallback(async (videoID: string) => {
    const match = downloadsRef.current.find((entry) => entry.video.id === videoID);
    if (match) {
      const file = new File(match.fileUri);
      if (file.exists) file.delete();
    }
    const next = downloadsRef.current.filter((entry) => entry.video.id !== videoID);
    downloadsRef.current = next;
    saveMetadata(next);
    setDownloads(next);
    updateActivity(videoID);
  }, [updateActivity]);

  const getDownload = useCallback(
    (videoID: string) => downloads.find((entry) => entry.video.id === videoID),
    [downloads],
  );

  const value = useMemo(
    () => ({ downloads, activity, download, remove, getDownload }),
    [downloads, activity, download, remove, getDownload],
  );
  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownloads() {
  const context = useContext(DownloadContext);
  if (!context) throw new Error('useDownloads must be used within DownloadProvider');
  return context;
}
