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

export async function uploadVideo(input: UploadInput) {
  const sessionID = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const tempDirectory = new Directory(Paths.cache, 'giltube-upload-chunks', sessionID);
  tempDirectory.create({ intermediates: true, idempotent: true });

  try {
    let source = new File(input.video.uri);
    // Android document providers return content:// handles whose descriptors may
    // be reclaimed while a long upload waits on the network. Stage legacy or
    // provider-backed selections into app-owned storage before reading chunks.
    if (!input.video.uri.startsWith('file://')) {
      const stagedSource = new File(tempDirectory, 'selected-video.bin');
      try {
        await source.copy(stagedSource, { overwrite: true });
      } catch {
        throw new Error('GilTube could not make a stable local copy of this video. Re-select it and keep enough free storage for the upload.');
      }
      source = stagedSource;
    }

    const fileSize = source.size || input.video.size || 0;
    if (!fileSize) throw new Error('The selected video is empty or cannot be read.');
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    for (let index = 0; index < totalChunks; index += 1) {
      const remaining = fileSize - index * CHUNK_SIZE;
      const sourceHandle = source.open(FileMode.ReadOnly);
      let bytes: Uint8Array;
      try {
        sourceHandle.offset = index * CHUNK_SIZE;
        bytes = sourceHandle.readBytes(Math.min(CHUNK_SIZE, remaining));
      } finally {
        sourceHandle.close();
      }
      if (!bytes.length) throw new Error('The selected video could not be fully read.');

      const chunkFile = new File(tempDirectory, `chunk-${index}.part`);
      chunkFile.create({ overwrite: true });
      chunkFile.write(bytes);

      try {
        const form = new FormData();
        // Expo's fetch implementation accepts Blob-compatible File objects, but
        // rejects React Native's legacy `{ uri, name, type }` FormData parts.
        form.append('chunk', chunkFile);
        form.append('chunkIndex', String(index));
        form.append('totalChunks', String(totalChunks));
        form.append('uploadSessionId', sessionID);
        form.append('fileName', input.video.name);
        await send('/videos/upload-chunk', form);
      } finally {
        if (chunkFile.exists) chunkFile.delete();
      }

      input.onProgress?.(Math.round(((index + 1) / (totalChunks + 1)) * 100));
    }

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
  } finally {
    if (tempDirectory.exists) tempDirectory.delete();
  }
}
