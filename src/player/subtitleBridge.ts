import { useEvent } from 'expo';
import { useEffect, useState } from 'react';

import type { useVideoPlayer } from 'expo-video';

// When a subtitle track is turned on mid-playback, ExoPlayer loads it from
// the playhead and drops every cue that started earlier, including the line
// being spoken right now. Subtitles then only appear at the next cue, seconds
// later. This fills that gap: it reads the track's WebVTT and returns the
// cues that were already on screen at the switch, until each one ends.

export interface Cue {
  start: number;
  end: number;
  text: string;
}

type Player = ReturnType<typeof useVideoPlayer>;
type Track = NonNullable<Player['subtitleTrack']>;

// Cues starting this close before the switch may still reach the native
// renderer, so they are left to it rather than drawn twice.
const nativeMargin = 0.3;

const cueCache = new Map<string, Promise<Cue[]>>();

function attributes(line: string) {
  const values: Record<string, string> = {};
  for (const match of line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) values[match[1]] = match[2].replace(/^"|"$/g, '');
  return values;
}

function timestamp(value: string) {
  const parts = value.trim().split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lrm: '', rlm: '' };

function cueText(lines: string[]) {
  return lines.join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (match, name: string) => name.startsWith('#') ? String.fromCharCode(Number(name.slice(1))) : entities[name.toLowerCase()] ?? match)
    .trim();
}

export function parseWebVTT(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing < 0) continue;
    const [from, rest = ''] = lines[timing].split('-->');
    const start = timestamp(from);
    const end = timestamp(rest.trim().split(/\s+/)[0] ?? '');
    const body = cueText(lines.slice(timing + 1));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && body) cues.push({ start, end, text: body });
  }
  return cues;
}

// The subtitle renditions a master playlist lists, with absolute URIs.
export function masterSubtitles(master: string, masterURL: string) {
  return master.split('\n')
    .filter((line) => line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=SUBTITLES'))
    .map((line) => attributes(line.slice('#EXT-X-MEDIA:'.length)))
    .filter((values) => values.URI)
    .map((values) => ({ name: values.NAME ?? '', language: values.LANGUAGE ?? '', uri: new URL(values.URI, masterURL).toString() }));
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function loadPlaylistCues(playlistURL: string) {
  const playlist = await fetchText(playlistURL);
  const segments = playlist.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const texts = await Promise.all(segments.map((segment) => fetchText(new URL(segment, playlistURL).toString())));
  return texts.flatMap(parseWebVTT);
}

async function loadTrackCues(masterURL: string, track: Track) {
  const renditions = masterSubtitles(await fetchText(masterURL), masterURL);
  const rendition = renditions.find((item) => item.name === track.name && item.language === track.language)
    ?? renditions.find((item) => item.name === (track.name || track.label))
    ?? renditions.find((item) => item.language === track.language);
  if (!rendition) return [];
  let cues = cueCache.get(rendition.uri);
  if (!cues) {
    cues = loadPlaylistCues(rendition.uri);
    cueCache.set(rendition.uri, cues);
    cues.catch(() => cueCache.delete(rendition.uri));
  }
  return cues;
}

// Returns the lines to draw over the video at currentTime (empty when the
// native renderer has them covered).
export function useSubtitleBridge(player: Player, masterURL: string, currentTime: number, enabled: boolean) {
  const change = useEvent(player, 'subtitleTrackChange', { subtitleTrack: player.subtitleTrack, previousSubtitleTrack: null });
  const track = change?.subtitleTrack ?? null;
  const [bridge, setBridge] = useState<{ trackID: string; at: number; cues: Cue[] } | null>(null);
  const trackID = enabled && track && /^https?:/.test(masterURL) ? track.id : '';
  useEffect(() => {
    if (!trackID || !track) return;
    const at = player.currentTime;
    let cancelled = false;
    loadTrackCues(masterURL, track)
      .then((cues) => {
        const active = cues.filter((cue) => cue.start < at - nativeMargin && cue.end > at);
        if (!cancelled) setBridge({ trackID, at, cues: active });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // A track object is re-sent on unrelated selection changes; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterURL, player, trackID]);
  if (!bridge || bridge.trackID !== trackID || currentTime < bridge.at - 1) return [];
  return bridge.cues.filter((cue) => currentTime < cue.end).map((cue) => cue.text);
}
