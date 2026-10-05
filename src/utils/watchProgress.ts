import type { WatchProgress } from '@/types/api';

// A saved position worth resuming from. Matches the watch screen's resume rule:
// past the first few seconds and not in the final stretch (or finished).
export function isResumable(progress?: WatchProgress | null): progress is WatchProgress {
  if (!progress || progress.completed) return false;
  const position = Number(progress.position_seconds || 0);
  const duration = Number(progress.duration_seconds || 0);
  return position > 5 && (duration <= 0 || position < duration - 8);
}

export function formatPlaybackTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
