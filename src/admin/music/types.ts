// Shapes returned by the /admin/music endpoints (internal/api/music.go).

export type MusicReleaseType = 'single' | 'ep' | 'album';
export type MusicStatus = 'draft' | 'published';

export interface AdminMusicArtist {
  id: string;
  name: string;
  slug: string;
  bio: string;
  avatar_url: string;
  banner_url: string;
  primary_channel_id: string;
  channel_name: string;
  verified: boolean;
  created_at: string;
}

export interface AdminMusicRelease {
  id: string;
  artist_id: string;
  artist_name: string;
  artist_slug: string;
  artist_avatar_url: string;
  title: string;
  slug: string;
  release_type: MusicReleaseType;
  cover_url: string;
  release_date?: string;
  label: string;
  copyright_text: string;
  phonogram_text: string;
  territories: string;
  rights_confirmed: boolean;
  has_lossless_audio: boolean;
  max_audio_bit_depth: number;
  max_audio_sample_rate: number;
  status: MusicStatus;
  track_count: number;
  created_at: string;
}

export interface AdminMusicTrack {
  id: string;
  release_id: string;
  release_title: string;
  release_slug: string;
  cover_url: string;
  primary_artist_id: string;
  artist_name: string;
  artist_slug: string;
  title: string;
  slug: string;
  disc_number: number;
  track_number: number;
  duration_seconds: number;
  isrc: string;
  explicit: boolean;
  language: string;
  audio_url: string;
  audio_original_name: string;
  audio_codec: string;
  audio_container: string;
  audio_sample_rate: number;
  audio_bit_depth: number;
  audio_lossless: boolean;
  audio_low_url: string;
  audio_medium_url: string;
  audio_high_url: string;
  lyrics?: string;
  synced_lyrics?: string;
  lyrics_source?: string;
  lyrics_synced_at?: string;
  status: MusicStatus;
  official_video_id: string;
  official_video_title: string;
  official_video_thumbnail: string;
  published_at?: string;
  created_at: string;
}

export interface AdminMusicOverview {
  artists: number;
  releases: number;
  tracks: number;
  published: number;
  blocked: number;
}

export interface AdminMusicChannel {
  id: string;
  name: string;
  username: string;
  status: string;
}

/** Row from GET /admin/videos, used by the official video picker. */
export interface AdminMusicVideoOption {
  id: string;
  title: string;
  thumbnail_url: string;
  channel_name: string;
}

export interface MusicArtistInput {
  name: string;
  bio: string;
  primary_channel_id: string;
  verified: boolean;
}

export interface MusicReleaseInput {
  artist_id: string;
  title: string;
  release_type: MusicReleaseType;
  release_date: string;
  label: string;
  copyright_text: string;
  phonogram_text: string;
  territories: string;
  rights_confirmed: boolean;
}

export interface MusicTrackInput {
  release_id: string;
  title: string;
  disc_number: number;
  track_number: number;
  duration_seconds: number;
  isrc: string;
  explicit: boolean;
  language: string;
}

/** A picked local file (document picker asset or a staged cache file). */
export interface LocalMusicFile {
  uri: string;
  name: string;
  size?: number | null;
}
