import * as Crypto from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { DocumentPickerAsset } from 'expo-document-picker';

import { APIError, getAPISession } from './client';
import { environment } from '@/config/environment';

// Keep each native buffer modest so uploads remain stable on lower-memory phones.
const CHUNK_SIZE = 8 * 1024 * 1024;

type UploadInput = {
  video: DocumentPickerAsset;
  thumbnail?: DocumentPickerAsset;
  title: string;
  description: string;
  channelID: string;
  categoryID?: string;
  explicit: boolean;
  hidden: boolean;
  onProgress?: (value: number) => void;
  onStatus?: (status: UploadStatus) => void;
};

async function send(path: string, body: FormData) {
  const token = getAPISession();
  const response = await fetch(`${environment.apiURL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new APIError(payload?.error || `Upload failed (${response.status})`, response.status);
  }
  return payload;
}

export type ChunkUploadSource = { uri: string; name: string; size?: number | null };

export type UploadPhase = 'preparing' | 'checking' | 'uploading' | 'retrying' | 'finishing';

/** Detailed upload state for progress UIs. */
export type UploadStatus = {
  phase: UploadPhase;
  sentBytes: number;
  totalBytes: number;
  /** Parts done (including any the server already had) and the part count. */
  chunk: number;
  totalChunks: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  /** Bytes the server already had from an earlier, interrupted attempt. */
  resumedBytes: number;
  retry?: { attempt: number; inSeconds: number; reason: string };
};

type ChunkUploadOptions = {
  onStatus?: (status: UploadStatus) => void;
  /** Sessions already used by other files in the same batch (never resumed). */
  excludeUploadIds?: string[];
};

const RETRY_WINDOW_MS = 30 * 60 * 1000;
const CHUNK_TIMEOUT_MS = 3 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retryable = (error: unknown) => {
  if (error instanceof APIError) return error.status === 408 || error.status === 429 || error.status >= 500;
  return true; // network failure, timeout, connection reset
};

const retryReason = (error: unknown) => (error instanceof APIError ? 'Server error' : 'Connection lost');

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const token = getAPISession();
  const response = await fetch(`${environment.apiURL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new APIError(payload?.error || `Request failed (${response.status})`, response.status);
  return payload as T;
}

async function sendWithTimeout(path: string, body: FormData) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      send(path, body),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Upload timed out')), CHUNK_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

// Rolling transfer speed over the last ~15 s of finished parts.
function speedMeter() {
  const samples: { at: number; bytes: number }[] = [];
  return {
    add(bytes: number) {
      const now = Date.now();
      samples.push({ at: now, bytes });
      while (samples.length > 2 && now - samples[0]!.at > 15_000) samples.shift();
    },
    rate(startedAt: number) {
      if (!samples.length) return 0;
      const from = samples.length > 1 ? samples[0]!.at : startedAt;
      const bytes = samples.slice(samples.length > 1 ? 1 : 0).reduce((sum, sample) => sum + sample.bytes, 0);
      const seconds = (samples[samples.length - 1]!.at - from) / 1000;
      return seconds > 0 ? bytes / seconds : 0;
    },
  };
}

// True when parts can be read from the picked document at any offset (some
// providers only stream front to back; those get a local copy instead).
function canReadDirectly(file: File, size: number) {
  if (size <= 0) return false;
  try {
    const handle = file.open(FileMode.ReadOnly);
    try {
      handle.offset = Math.max(0, size - 1);
      return handle.readBytes(1).length === 1;
    } finally {
      handle.close();
    }
  } catch {
    return false;
  }
}

/**
 * Sends a picked file to /videos/upload-chunk in 8 MB parts and returns the
 * upload session id; the caller finalizes it with whichever endpoint owns the
 * upload (video, movie audio track, media ingest, ...).
 *
 * Parts are read straight from the picked file (no up-front copy) when
 * Android allows it. An interrupted upload of the same file resumes where the
 * server left off, and each part retries through outages for up to 30 min.
 */
export async function uploadFileChunks(input: ChunkUploadSource, onProgress?: (fraction: number) => void, options: ChunkUploadOptions = {}) {
  const tempDirectory = new Directory(Paths.cache, 'giltube-upload-chunks', `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  tempDirectory.create({ intermediates: true, idempotent: true });
  const startedAt = Date.now();
  const status: UploadStatus = { phase: 'preparing', sentBytes: 0, totalBytes: input.size || 0, chunk: 0, totalChunks: 0, bytesPerSecond: 0, etaSeconds: null, resumedBytes: 0 };
  const emit = (patch: Partial<UploadStatus>) => {
    Object.assign(status, patch);
    if (!patch.retry && patch.phase && patch.phase !== 'retrying') status.retry = undefined;
    options.onStatus?.({ ...status });
  };
  emit({ phase: 'preparing' });

  try {
    let source = new File(input.uri);
    // Read parts straight from the picked document when possible (no
    // multi-GB copy before the upload starts). Providers that can't be read
    // in place get a one-time local copy, as before.
    if (!input.uri.startsWith('file://') && !canReadDirectly(source, source.size || input.size || 0)) {
      const stagedSource = new File(tempDirectory, 'selected-file.bin');
      try {
        await source.copy(stagedSource, { overwrite: true });
      } catch {
        throw new Error('GilTube could not make a stable local copy of this file. Re-select it and keep enough free storage for the upload.');
      }
      source = stagedSource;
    }

    const fileSize = source.size || input.size || 0;
    if (!fileSize) throw new Error('The selected file is empty or cannot be read.');
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const readChunk = (index: number) => {
      const handle = source.open(FileMode.ReadOnly);
      try {
        handle.offset = index * CHUNK_SIZE;
        const bytes = handle.readBytes(Math.min(CHUNK_SIZE, fileSize - index * CHUNK_SIZE));
        if (!bytes.length) throw new Error('empty read');
        return bytes;
      } catch {
        throw new Error('The selected file could not be read. Re-select it and upload again; it will continue where it stopped.');
      } finally {
        handle.close();
      }
    };
    const chunkLength = (index: number) => Math.min(CHUNK_SIZE, fileSize - index * CHUNK_SIZE);
    emit({ totalBytes: fileSize, totalChunks });

    // Retries `task` through outages, reporting the wait in the status.
    const withRetry = async <T,>(task: () => Promise<T>, resumePhase: UploadPhase): Promise<T> => {
      const firstAttempt = Date.now();
      for (let attempt = 1; ; attempt += 1) {
        try {
          const result = await task();
          if (status.phase === 'retrying') emit({ phase: resumePhase });
          return result;
        } catch (error) {
          if (!retryable(error) || Date.now() - firstAttempt > RETRY_WINDOW_MS) throw error;
          const wait = Math.min(30, 2 * 2 ** Math.min(attempt - 1, 4));
          for (let left = wait; left > 0; left -= 1) {
            emit({ phase: 'retrying', retry: { attempt, inSeconds: left, reason: retryReason(error) } });
            await sleep(1000);
          }
        }
      }
    };

    // Ask the server for an unfinished upload of this same file.
    let sessionID = '';
    let received = new Set<number>();
    if (totalChunks > 1) {
      emit({ phase: 'checking' });
      const firstHash = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, readChunk(0)));
      const exclude = options.excludeUploadIds || [];
      const found = await withRetry(async () => {
        try {
          return await postJSON<{ upload_id?: string; received_chunks?: number[] }>('/videos/upload-resume', {
            file_name: input.name, file_size: fileSize, total_chunks: totalChunks, chunk_size: CHUNK_SIZE,
            first_chunk_sha256: firstHash, exclude_upload_ids: exclude,
          });
        } catch (error) {
          if (retryable(error)) throw error;
          return null; // older server: start fresh
        }
      }, 'checking');
      if (found?.upload_id && !exclude.includes(found.upload_id)) {
        sessionID = found.upload_id;
        received = new Set(found.received_chunks || []);
      }
    }
    if (!sessionID) sessionID = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    let sentBytes = 0;
    for (const index of received) sentBytes += chunkLength(index);
    const meter = speedMeter();
    emit({ phase: 'uploading', sentBytes, resumedBytes: sentBytes, chunk: received.size });

    for (let index = 0; index < totalChunks; index += 1) {
      if (received.has(index)) continue;
      const bytes = readChunk(index);
      const chunkFile = new File(tempDirectory, `chunk-${index}.part`);
      chunkFile.create({ overwrite: true });
      chunkFile.write(bytes);
      try {
        await withRetry(() => {
          const form = new FormData();
          // Expo's fetch implementation accepts Blob-compatible File objects, but
          // rejects React Native's legacy `{ uri, name, type }` FormData parts.
          form.append('chunk', chunkFile);
          form.append('chunkIndex', String(index));
          form.append('totalChunks', String(totalChunks));
          form.append('chunkSize', String(CHUNK_SIZE));
          form.append('fileSize', String(fileSize));
          form.append('uploadSessionId', sessionID);
          form.append('fileName', input.name);
          return sendWithTimeout('/videos/upload-chunk', form);
        }, 'uploading');
      } finally {
        if (chunkFile.exists) chunkFile.delete();
      }
      sentBytes += bytes.length;
      received.add(index);
      meter.add(bytes.length);
      const bytesPerSecond = meter.rate(startedAt);
      emit({
        phase: 'uploading', sentBytes, chunk: received.size, bytesPerSecond,
        etaSeconds: bytesPerSecond > 0 ? (fileSize - sentBytes) / bytesPerSecond : null,
      });
      onProgress?.(sentBytes / fileSize);
    }
    onProgress?.(1);
    emit({ etaSeconds: 0 });
    return { sessionID, fileName: input.name };
  } finally {
    if (tempDirectory.exists) tempDirectory.delete();
  }
}

export async function uploadVideo(input: UploadInput) {
  let last: UploadStatus | undefined;
  const { sessionID } = await uploadFileChunks(input.video, (fraction) => input.onProgress?.(Math.round(fraction * 100 * 0.95)), {
    onStatus: (status) => { last = status; input.onStatus?.(status); },
  });
  if (last) input.onStatus?.({ ...last, phase: 'finishing', retry: undefined });

  const finalize = new FormData();
  finalize.append('uploadSessionId', sessionID);
  finalize.append('fileName', input.video.name);
  finalize.append('title', input.title);
  finalize.append('description', input.description);
  finalize.append('channel_id', input.channelID);
  if (input.categoryID) finalize.append('category_ids[]', input.categoryID);
  if (input.explicit) finalize.append('explicit', 'true');
  if (input.hidden) finalize.append('hidden', 'true');
  if (input.thumbnail) {
    finalize.append('thumbnail', new File(input.thumbnail.uri));
  }

  const result = await send('/videos/finalize-upload', finalize);
  input.onProgress?.(100);
  return result;
}

/** Multipart POST to any API path with the session token (no JSON body). */
export function sendForm(path: string, body: FormData) {
  return send(path, body);
}
