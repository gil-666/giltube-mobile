import * as SecureStore from 'expo-secure-store';

// News panels a guest has dismissed, kept on the device. SecureStore values
// should stay under ~2 KB, so only the most recent ids are kept (each is a
// 36-character UUID).
const KEY = 'giltube.news.dismissed';
const MAX_IDS = 40;

export async function readGuestDismissedNews(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export async function addGuestDismissedNews(id: string) {
  const current = await readGuestDismissedNews();
  const next = [...current.filter((value) => value !== id), id].slice(-MAX_IDS);
  await SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
}
