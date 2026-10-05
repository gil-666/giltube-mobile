import { Directory, File, Paths } from 'expo-file-system';

export interface QualityOption { label: string; height: number; url: string; hdr: boolean }

export async function loadHLSQualities(masterURL: string): Promise<QualityOption[]> {
  if (!masterURL || masterURL.startsWith('file:')) return [];
  const response = await fetch(masterURL);
  if (!response.ok) return [];
  const lines = (await response.text()).split(/\r?\n/);
  const found: QualityOption[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
	const resolution = lines[index].match(/RESOLUTION=(\d+)x(\d+)/);
	const height = resolution ? Math.min(Number(resolution[1]), Number(resolution[2])) : 0;
    const next = lines.slice(index + 1).find((line) => line.trim() && !line.startsWith('#'))?.trim();
    if (!height || !next) continue;
    const hdr = /VIDEO-RANGE=(PQ|HLG)/.test(lines[index]);
    found.push({ label: hdr ? `${height}p HDR` : `${height}p`, height, url: new URL(next, masterURL).toString(), hdr });
  }
  return [...new Map(found.map((option) => [option.height, option])).values()].sort((a, b) => b.height - a.height);
}

// HDR titles publish master-hdr.m3u8 next to master.m3u8 (see the backend's
// internal/hdrmaster). master.m3u8 itself always stays SDR.
export function hdrMasterURL(masterURL: string): string {
  const [path = '', query] = masterURL.split('?');
  if (!/\/master\.m3u8$/i.test(path)) return '';
  return path.replace(/master\.m3u8$/i, 'master-hdr.m3u8') + (query ? `?${query}` : '');
}

// Returns the HDR master URL and its transfer when the title has one.
export async function probeHDRMaster(masterURL: string): Promise<{ url: string; videoRange: 'PQ' | 'HLG' } | null> {
  const url = hdrMasterURL(masterURL);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const range = (await response.text()).match(/VIDEO-RANGE=(PQ|HLG)/)?.[1] as 'PQ' | 'HLG' | undefined;
    return range ? { url, videoRange: range } : null;
  } catch {
    return null;
  }
}

function absoluteURIAttribute(line: string, baseURL: string): string {
  return line.replace(/URI="([^"]*)"/, (_, uri: string) => `URI="${new URL(uri, baseURL).toString()}"`);
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

// Video variant playlists carry video only: audio and subtitles are separate
// renditions listed in the master. Pinning a quality by loading the bare
// variant URL therefore plays silently, so instead play a cached one-variant
// copy of the master with absolute URIs. Android's player reads the local
// playlist and fetches every segment over HTTPS as usual.
export async function pinnedQualityManifest(masterURL: string, variantURL: string): Promise<string> {
  const response = await fetch(masterURL);
  if (!response.ok) throw new Error('Could not load the playlist for this quality.');
  const lines = (await response.text()).split(/\r?\n/);
  const output: string[] = [];
  let matched = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      let next = index + 1;
      while (next < lines.length && (!lines[next].trim() || lines[next].trim().startsWith('#'))) next += 1;
      const uri = next < lines.length ? new URL(lines[next].trim(), masterURL).toString() : '';
      if (uri && uri === variantURL) {
        output.push(line, uri);
        matched = true;
      }
      index = next;
      continue;
    }
    if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) continue;
    if (line.startsWith('#EXT-X-MEDIA:')) output.push(absoluteURIAttribute(line, masterURL));
    else if (line.startsWith('#')) output.push(line);
  }
  if (!matched) throw new Error('This quality is no longer available.');

  const directory = new Directory(Paths.cache, 'hls-quality');
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${stableHash(`${masterURL}|${variantURL}`)}.m3u8`);
  file.write(`${output.join('\n')}\n`);
  return file.uri;
}

export function isLocalHLSManifest(uri: string): boolean {
  return uri.startsWith('file:') && /\.m3u8($|\?)/i.test(uri);
}
