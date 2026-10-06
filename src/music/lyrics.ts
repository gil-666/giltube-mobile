import type { MusicTrack } from '@/types/api';

// LRC parsing, matching the website's music player.

export interface LyricLine {
  /** Seconds; -1 for plain (untimed) lyrics. */
  time: number;
  text: string;
}

export interface ParsedLyrics {
  /** True when the lines carry timestamps (karaoke-style display). */
  synced: boolean;
  lines: LyricLine[];
}

const TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
// [ar:Artist], [ti:Title], [offset:+100] … (tags with a non-numeric key)
const METADATA_TAG = /^\[[a-z#][a-z0-9_ -]*:[^\]]*\]$/i;

/** Parses LRC text into timed lines (sorted); untimed text becomes plain lines. */
export function parseLyricsText(text: string | undefined | null): ParsedLyrics | null {
  const raw = (text || '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return null;

  const timed: LyricLine[] = [];
  const plain: LyricLine[] = [];
  for (const sourceLine of raw.split('\n')) {
    const line = sourceLine.trim();
    if (!line || METADATA_TAG.test(line)) continue;
    const stamps = [...line.matchAll(TIMESTAMP)];
    const content = line.replace(TIMESTAMP, '').trim();
    if (stamps.length === 0) {
      plain.push({ time: -1, text: line });
      continue;
    }
    if (!content) continue;
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fraction = stamp[3] ? Number(stamp[3].padEnd(3, '0')) / 1000 : 0;
      timed.push({ time: minutes * 60 + seconds + fraction, text: content });
    }
  }

  if (timed.length > 0) {
    timed.sort((a, b) => a.time - b.time);
    return { synced: true, lines: timed };
  }
  return plain.length > 0 ? { synced: false, lines: plain } : null;
}

/** A track's lyrics: synced LRC when present, else plain lyrics. */
export function parseTrackLyrics(track: MusicTrack | null | undefined): ParsedLyrics | null {
  if (!track) return null;
  return parseLyricsText(track.synced_lyrics || track.lyrics);
}

export function trackHasLyrics(track: MusicTrack | null | undefined) {
  return !!(track?.synced_lyrics?.trim() || track?.lyrics?.trim());
}

/** Index of the active synced line (last line with time <= position + 0.15), or -1. */
export function activeLyricIndex(lines: LyricLine[], position: number): number {
  const target = position + 0.15;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle]!.time <= target) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return found;
}
