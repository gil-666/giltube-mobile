import { Directory, File, Paths } from 'expo-file-system';

export type PickedAsset = { uri: string; name: string; size?: number | null; mimeType?: string | null };

function extensionOf(name: string) {
  const match = /\.[a-z0-9]+$/i.exec(name.trim());
  return match ? match[0].toLowerCase() : '';
}

/**
 * Returns a Blob-compatible file for a multipart part whose name keeps the
 * picked file's original extension. Document pickers may hand back cache
 * copies or content:// handles with generic names, and several endpoints
 * (subtitles especially) reject uploads by extension, so the file is staged
 * under its real name when needed. Always call `cleanup` when done.
 */
export async function namedUploadFile(asset: PickedAsset): Promise<{ file: File; cleanup: () => void }> {
  const source = new File(asset.uri);
  const wanted = extensionOf(asset.name);
  if (asset.uri.startsWith('file://') && (!wanted || source.name.toLowerCase().endsWith(wanted))) {
    return { file: source, cleanup: () => undefined };
  }
  const directory = new Directory(Paths.cache, 'giltube-admin-uploads', `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  directory.create({ intermediates: true, idempotent: true });
  const safeName = asset.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || `upload${wanted}`;
  const staged = new File(directory, safeName);
  const cleanup = () => {
    try {
      if (directory.exists) directory.delete();
    } catch {
      // Cache cleanup is best effort.
    }
  };
  try {
    await source.copy(staged, { overwrite: true });
  } catch (error) {
    cleanup();
    throw error;
  }
  return { file: staged, cleanup };
}

/** Appends a picked file to a form under its original name, runs `send`, then removes any staged copy. */
export async function withUploadFile<T>(asset: PickedAsset, send: (file: File) => Promise<T>) {
  const { file, cleanup } = await namedUploadFile(asset);
  try {
    return await send(file);
  } finally {
    cleanup();
  }
}
