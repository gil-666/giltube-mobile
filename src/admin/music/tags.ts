import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { inferredTrackTitle } from './helpers';
import type { LocalMusicFile } from './types';

// Reads the same embedded tags the web quick upload reads (ID3v2 for MP3 and
// friends, Vorbis comments + PICTURE for FLAC) from the first 5 MB of a
// picked file. Embedded artwork is staged in the cache so it can be uploaded
// as the release cover.

export type ParsedAudioTags = {
  title: string;
  artist: string;
  album: string;
  date: string;
  trackNumber: number;
  discNumber: number;
  cover: LocalMusicFile | null;
};

const HEAD_BYTES = 5 * 1024 * 1024;

export const emptyTags = (): ParsedAudioTags => ({ title: '', artist: '', album: '', date: '', trackNumber: 0, discNumber: 1, cover: null });

function latin1(bytes: Uint8Array) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) result += String.fromCharCode(bytes[index] ?? 0);
  return result;
}

function utf8(bytes: Uint8Array) {
  let result = '';
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index] ?? 0;
    let code = first;
    let extra = 0;
    if (first >= 0xf0) { code = first & 0x07; extra = 3; } else if (first >= 0xe0) { code = first & 0x0f; extra = 2; } else if (first >= 0xc0) { code = first & 0x1f; extra = 1; }
    for (let step = 1; step <= extra; step += 1) code = (code << 6) | ((bytes[index + step] ?? 0) & 0x3f);
    index += 1 + extra;
    result += String.fromCodePoint(code);
  }
  return result;
}

function utf16(bytes: Uint8Array, defaultBigEndian: boolean) {
  let bigEndian = defaultBigEndian;
  let start = 0;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) { bigEndian = false; start = 2; } else if (bytes[0] === 0xfe && bytes[1] === 0xff) { bigEndian = true; start = 2; }
  const units: number[] = [];
  for (let index = start; index + 1 < bytes.length; index += 2) {
    units.push(bigEndian ? ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0) : (bytes[index] ?? 0) | ((bytes[index + 1] ?? 0) << 8));
  }
  let result = '';
  for (let index = 0; index < units.length; index += 4096) result += String.fromCharCode(...units.slice(index, index + 4096));
  return result;
}

const cleanTagText = (value: string) => value.replace(/\u0000/g, '').trim();
const parseTrackNumber = (value: string) => Number(cleanTagText(value).split('/')[0]) || 0;
const parseTagDate = (value: string) => cleanTagText(value).match(/\d{4}(?:-\d{2}(?:-\d{2})?)?/)?.[0] || '';

function decodeID3Text(data: Uint8Array) {
  const encoding = data[0] || 0;
  const body = data.slice(1);
  if (encoding === 1) return cleanTagText(utf16(body, false));
  if (encoding === 2) return cleanTagText(utf16(body, true));
  if (encoding === 3) return cleanTagText(utf8(body));
  return cleanTagText(latin1(body));
}

const syncSafeInt = (bytes: Uint8Array, offset: number) => ((bytes[offset] || 0) << 21) | ((bytes[offset + 1] || 0) << 14) | ((bytes[offset + 2] || 0) << 7) | (bytes[offset + 3] || 0);
const uint32BE = (bytes: Uint8Array, offset: number) => (((bytes[offset] || 0) << 24) >>> 0) + (((bytes[offset + 1] || 0) << 16) | ((bytes[offset + 2] || 0) << 8) | (bytes[offset + 3] || 0));
const uint32LE = (bytes: Uint8Array, offset: number) => ((bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8) | ((bytes[offset + 2] || 0) << 16)) + (((bytes[offset + 3] || 0) << 24) >>> 0);

function stageCover(bytes: Uint8Array, mime: string, fileName: string): LocalMusicFile | null {
  if (!bytes.length) return null;
  try {
    const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const directory = new Directory(Paths.cache, 'giltube-music-covers');
    directory.create({ intermediates: true, idempotent: true });
    const name = `${fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'cover'}-${Date.now()}-cover.${extension}`;
    const file = new File(directory, name);
    file.create({ overwrite: true });
    file.write(bytes);
    return { uri: file.uri, name, size: bytes.length };
  } catch {
    return null;
  }
}

function parseAPIC(data: Uint8Array, fileName: string) {
  let offset = 1;
  while (offset < data.length && data[offset] !== 0) offset += 1;
  const mime = latin1(data.slice(1, offset)) || 'image/jpeg';
  offset += 2; // mime terminator + picture type
  const terminatorSize = data[0] === 1 || data[0] === 2 ? 2 : 1;
  while (offset < data.length) {
    if (terminatorSize === 2 && data[offset] === 0 && data[offset + 1] === 0) { offset += 2; break; }
    if (terminatorSize === 1 && data[offset] === 0) { offset += 1; break; }
    offset += 1;
  }
  return stageCover(data.slice(offset), mime, fileName);
}

function parseID3(bytes: Uint8Array, fileName: string) {
  const tags = emptyTags();
  if (latin1(bytes.slice(0, 3)) !== 'ID3') return tags;
  const version = bytes[3] || 3;
  const tagSize = Math.min(syncSafeInt(bytes, 6), bytes.length - 10);
  const frameMap: Record<string, 'title' | 'artist' | 'album'> = { TIT2: 'title', TPE1: 'artist', TALB: 'album' };
  let offset = 10;
  while (offset + 10 <= tagSize + 10) {
    const frameID = latin1(bytes.slice(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(frameID)) break;
    const size = version === 4 ? syncSafeInt(bytes, offset + 4) : uint32BE(bytes, offset + 4);
    if (size <= 0 || offset + 10 + size > bytes.length) break;
    const data = bytes.slice(offset + 10, offset + 10 + size);
    const field = frameMap[frameID];
    if (field) tags[field] = decodeID3Text(data);
    if (frameID === 'TRCK') tags.trackNumber = parseTrackNumber(decodeID3Text(data));
    if (frameID === 'TPOS') tags.discNumber = parseTrackNumber(decodeID3Text(data)) || 1;
    if (frameID === 'TYER' || frameID === 'TDRC') tags.date = parseTagDate(decodeID3Text(data));
    if (frameID === 'APIC' && !tags.cover) tags.cover = parseAPIC(data, fileName);
    offset += 10 + size;
  }
  return tags;
}

function parseFLAC(bytes: Uint8Array, fileName: string) {
  const tags = emptyTags();
  if (latin1(bytes.slice(0, 4)) !== 'fLaC') return tags;
  let offset = 4;
  let last = false;
  while (!last && offset + 4 <= bytes.length) {
    const header = bytes[offset] || 0;
    last = Boolean(header & 0x80);
    const type = header & 0x7f;
    const length = ((bytes[offset + 1] || 0) << 16) | ((bytes[offset + 2] || 0) << 8) | (bytes[offset + 3] || 0);
    const blockStart = offset + 4;
    const block = bytes.slice(blockStart, blockStart + length);
    if (type === 4 && block.length) {
      let cursor = 4 + uint32LE(block, 0);
      const count = uint32LE(block, cursor);
      cursor += 4;
      for (let index = 0; index < count && cursor + 4 <= block.length; index += 1) {
        const commentLength = uint32LE(block, cursor);
        cursor += 4;
        const comment = utf8(block.slice(cursor, cursor + commentLength));
        cursor += commentLength;
        const [rawKey, ...rawValue] = comment.split('=');
        const key = (rawKey || '').toUpperCase();
        const value = rawValue.join('=');
        if (key === 'TITLE') tags.title = cleanTagText(value);
        if (key === 'ARTIST') tags.artist = cleanTagText(value);
        if (key === 'ALBUM') tags.album = cleanTagText(value);
        if (key === 'DATE') tags.date = parseTagDate(value);
        if (key === 'TRACKNUMBER') tags.trackNumber = parseTrackNumber(value);
        if (key === 'DISCNUMBER') tags.discNumber = parseTrackNumber(value) || 1;
      }
    }
    if (type === 6 && block.length > 32 && !tags.cover) {
      let cursor = 4;
      const mimeLength = uint32BE(block, cursor);
      cursor += 4;
      const mime = latin1(block.slice(cursor, cursor + mimeLength)) || 'image/jpeg';
      cursor += mimeLength;
      const descriptionLength = uint32BE(block, cursor);
      cursor += 4 + descriptionLength + 16;
      const dataLength = uint32BE(block, cursor);
      cursor += 4;
      tags.cover = stageCover(block.slice(cursor, cursor + dataLength), mime, fileName);
    }
    offset = blockStart + length;
  }
  return tags;
}

function readHead(uri: string) {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  try {
    const size = file.size || HEAD_BYTES;
    return handle.readBytes(Math.min(size, HEAD_BYTES));
  } finally {
    handle.close();
  }
}

/** Never throws: falls back to a title inferred from the file name. */
export function readAudioTags(input: LocalMusicFile): ParsedAudioTags {
  try {
    const bytes = readHead(input.uri);
    const extension = (input.name.split('.').pop() || '').toLowerCase();
    const tags = extension === 'flac' ? parseFLAC(bytes, input.name) : parseID3(bytes, input.name);
    tags.title ||= inferredTrackTitle(input.name);
    return tags;
  } catch {
    return { ...emptyTags(), title: inferredTrackTitle(input.name) };
  }
}
