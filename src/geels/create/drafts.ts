import { Directory, File, Paths } from 'expo-file-system';

import type { GeelSound } from '@/api/geels';

export interface DraftClip { uri: string; duration: number; speed: number; facing: 'front' | 'back'; imported?: boolean }

export interface GeelDraft {
  clips: DraftClip[];
  sound: GeelSound | null;
  soundStartMS: number;
  soundVolume: number;
  originalVolume: number;
  maxSeconds: number;
  caption: string;
  savedAt: string;
}

// One draft, kept in app storage (recordings live in the cache, which the
// system may clear).
const draftDirectory = () => new Directory(Paths.document, 'geel-draft');
const draftFile = () => new File(draftDirectory(), 'draft.json');

export function loadDraft(): GeelDraft | null {
  try {
    const file = draftFile();
    if (!file.exists) return null;
    const draft = JSON.parse(file.textSync()) as GeelDraft;
    if (!draft.clips?.length || draft.clips.some((clip) => !new File(clip.uri).exists)) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function saveDraft(draft: Omit<GeelDraft, 'savedAt'>): Promise<GeelDraft> {
  const directory = draftDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const clips: DraftClip[] = [];
  for (const [index, clip] of draft.clips.entries()) {
    const target = new File(directory, `clip-${Date.now()}-${index}.mp4`);
    if (clip.uri.startsWith(directory.uri)) {
      clips.push(clip);
      continue;
    }
    await new File(clip.uri).copy(target, { overwrite: true });
    clips.push({ ...clip, uri: target.uri });
  }
  const saved: GeelDraft = { ...draft, clips, savedAt: new Date().toISOString() };
  // Drop clips the new draft no longer uses.
  const keep = new Set(clips.map((clip) => clip.uri));
  for (const entry of directory.list()) {
    if (entry instanceof File && entry.name.startsWith('clip-') && !keep.has(entry.uri)) entry.delete();
  }
  draftFile().write(JSON.stringify(saved));
  return saved;
}

export function deleteDraft() {
  try {
    const directory = draftDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Nothing to clean up.
  }
}
