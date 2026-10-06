export interface Channel {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  avatar_url?: string;
  background_url?: string;
  verified?: boolean;
  is_default?: boolean;
  background_position_x?: number;
  background_position_y?: number;
  background_scale?: number;
  status?: string;
  custom_header_html?: string;
  custom_header_css?: string;
  custom_content_html?: string;
  custom_content_css?: string;
}

export interface Video {
  id: string;
  title: string;
  description?: string;
  status: string;
  views: number;
  likes?: number;
  comments_count?: number;
  created_at: string;
  hls_path: string;
  thumbnail_url: string;
  explicit?: boolean;
  channel_id: string;
  channel?: Channel;
  progress?: number;
  width?: number;
  hidden?: boolean;
  clip?: { id: string; original_video_id: string; start_seconds: number; end_seconds: number; clipped_by_username?: string; clipped_by_channel?: string };
}

export interface LiveStream {
  id?: string;
  channel_id: string;
  title: string;
  description: string;
  status: 'offline' | 'live';
  manual_status?: 'offline' | 'live';
  started_at: string | null;
  ended_at?: string | null;
	scheduled_for?: string | null;
  playback_url: string;
  playback_url_public?: string;
  thumbnail_url?: string;
	has_custom_thumbnail?: boolean;
  watching_now?: number;
	is_live?: boolean;
	waiting_for_publisher?: boolean;
	dvr_enabled?: boolean;
	adaptive_transcoding_enabled?: boolean;
	playback_url_fallback?: string;
  channel?: Channel;
}

export interface MyLiveStream extends LiveStream {
  stream_key: string;
  use_publisher_presence: boolean;
  publisher_detected_live?: boolean;
  ingest_url?: string;
  ingest_url_local?: string;
  ingest_url_lan?: string;
  stream_name?: string;
  whip_url?: string;
}

export interface LiveChatMessage {
  id: string;
  message: string;
  created_at: string;
  channel: Channel;
}

export interface LivePollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface LivePoll {
  id: string;
  question: string;
  status: 'active' | 'ended';
  total_votes: number;
  created_at: string;
  ended_at?: string | null;
  selected_option_id?: string;
  creator: Channel;
  options: LivePollOption[];
}

export interface HomeRecommendations {
  personalized: boolean;
  recommended: Video[];
  trending: Video[];
  trusted: Video[];
  fresh: Video[];
  browse: Video[];
}

export interface PublicWatchParty {
  id: string;
  video_id: string;
  title: string;
  video_title: string;
  thumbnail_url: string;
  channel_name: string;
  participant_count: number;
  created_at: string;
}

export interface WatchPartyActor {
  user_id: string;
  channel_id?: string;
  name: string;
  avatar_url?: string;
  verified?: boolean;
}

export interface WatchPartyParticipant extends WatchPartyActor {
  can_suggest: boolean;
  is_host: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface WatchPartyMessage {
  id: string;
  message: string;
  gif_url: string;
  reaction: string;
  created_at: string;
  actor: WatchPartyActor;
}

export interface WatchPartyQueueItem {
  id: string;
  video_id: string;
  position: number;
  title: string;
  thumbnail_url: string;
  added_by: string;
  created_at: string;
}

export interface WatchPartySnapshot {
  party: {
    id: string;
    video_id: string;
    creator_user_id: string;
    host_user_id: string;
    visibility: 'public' | 'private';
    title: string;
    status: 'active' | 'ended';
    sync_mode: 'host-only' | 'open';
    party_type: 'single' | 'queue';
    media_type: '' | 'movie' | 'series';
    media_id: string;
    current_time: number;
    playback_state: 'playing' | 'paused';
    playback_updated_at: string;
    created_at: string;
  };
  video: Video & { channel_name?: string; display_title?: string };
  host: WatchPartyActor;
  participants: WatchPartyParticipant[];
  messages: WatchPartyMessage[];
  queue: WatchPartyQueueItem[];
}

export type WatchPartyEvent =
  | { type: 'ready' }
  | { type: 'chat'; message: WatchPartyMessage }
  | { type: 'join' | 'leave' | 'ended'; actor: WatchPartyActor; at: string }
  | { type: 'host_changed'; user_id: string; at: string }
  | { type: 'permissions'; user_id: string; can_suggest: boolean; at: string }
  | { type: 'sync_mode'; mode: 'host-only' | 'open'; at: string }
  | { type: 'queue'; action: 'add' | 'remove' | 'reorder' | 'play'; item_id?: string; video_id?: string; at: string }
  | { type: 'playback'; action: 'play' | 'pause' | 'seek' | 'progress'; current_time: number; playback_state: 'playing' | 'paused'; actor: WatchPartyActor; at: string };

export interface Account {
  id: string;
  username: string;
  email: string;
  user_type: string;
  status: string;
  gilid_linked: boolean;
  gilid_email?: string;
  gilid_username?: string;
  music_quality?: string;
  audio_language?: string;
  caption_language?: string;
}

export interface WatchProgress {
  video_id: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
}

export interface PlaybackIntro {
  enabled: boolean;
  allow_skip: boolean;
  url: string;
  version: string;
  play?: boolean;
}

export interface ContinueWatchingItem {
  kind: 'video' | 'movie' | 'series';
  progress: WatchProgress;
  video: Video;
  movie?: Movie;
  series?: Series;
  episode?: SeriesEpisode;
}

export interface SearchResult {
  type: 'video' | 'channel' | 'movie' | 'series' | 'term';
  id: string;
  title: string;
  name?: string;
  description?: string;
  channel?: string;
  channel_id?: string;
  avatar?: string;
  thumbnail?: string;
  poster_url?: string;
  backdrop_url?: string;
  video_id?: string;
  views?: number;
  verified?: boolean;
  year?: number;
  seasons?: number;
  episodes?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  per_page: number;
}

export interface UserChannelsResponse {
  channels: Channel[];
  default_channel_id: string;
}

export interface SubscriptionState {
  subscribed: boolean;
  subscriber_count: number;
}

export interface SubscriptionsResponse {
  channels: Channel[];
}

export interface SubscriptionsFeedResponse {
  videos: Video[];
}

export interface Comment {
  id: string;
  text: string;
  created_at: string;
  likes_count?: number;
  liked?: boolean;
  liked_by_actor?: boolean;
  parent_comment_id?: string | null;
  channel: Channel;
  replies?: Comment[];
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  visibility: 'public' | 'private' | 'unlisted';
  video_count: number;
  thumbnail_url?: string;
  videos?: Video[];
}

export interface PlaylistsResponse {
  playlists: Playlist[];
  page: number;
}

export interface NotificationItem {
  id: string;
  type: 'comment_video' | 'reply_comment' | 'like_video' | 'like_comment' | 'live_started' | 'new_video' | 'video_ready' | 'watch_party_invite' | 'watch_party_host' | 'new_subscriber' | 'featured_content' | 'news';
  is_read: boolean;
  created_at: string;
  actor_channel: Channel;
  target_video: { id: string; title: string } | null;
  target_comment: { id: string; snippet: string } | null;
  url: string;
	metadata?: Record<string, unknown>;
}

export interface FeaturedContent {
  id: string;
  content_type: 'video' | 'live' | 'movie' | 'series';
  content_id: string;
  header: string;
  description: string;
  action_text: string;
  title: string;
  image_url: string;
  channel_id: string;
  channel_name: string;
  target_url: string;
  is_live: boolean;
  scheduled_for: string | null;
}

export interface MediaCapabilities {
  max_quality?: string;
  audio_languages?: string[];
  caption_languages?: string[];
  hdr?: boolean;
  surround?: boolean;
}

// US rating from TMDB (or set by an admin) plus content descriptor keys:
// violence, sex, nudity, language, drugs, fear, discrimination.
export interface ContentRating {
  rating: string;
  descriptors: string[];
  source?: string;
}

export interface RelatedMedia {
  kind: 'movie' | 'series';
  id: string;
  slug: string;
  title: string;
  genre: string;
  poster_url: string;
  backdrop_url: string;
  release_year?: number;
  seasons?: number;
  episode_count?: number;
  content_rating?: ContentRating;
}

export interface Movie {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  genres: string[];
  directors: string[];
  cast: string[];
  poster_url: string;
  backdrop_url: string;
  trailer_video_id: string;
  video_id: string;
  channel_id: string;
  is_featured: boolean;
  release_year: number;
  explicit?: boolean;
  content_warning?: boolean;
  video?: Video;
  media_capabilities?: MediaCapabilities;
  content_rating?: ContentRating;
}

export interface MovieCatalog {
  featured: Movie | null;
  genres: { genre: string; movies: Movie[] }[];
  movies: Movie[];
}

export interface SeriesEpisode {
  id: string;
  series_id: string;
  video_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  synopsis: string;
  intro_start_seconds: number;
  intro_end_seconds: number;
  content_warning?: boolean;
  video: Video;
}

export interface Series {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  genres: string[];
  seasons: number;
  directors: string[];
  cast: string[];
  poster_url: string;
  backdrop_url: string;
  trailer_video_id: string;
  featured_video_id: string;
  channel_id: string;
  is_featured: boolean;
  episode_count: number;
  explicit?: boolean;
  first_episode?: SeriesEpisode;
  media_capabilities?: MediaCapabilities;
  content_rating?: ContentRating;
}

export interface SeriesCatalog {
  featured: Series | null;
  genres: { genre: string; series: Series[] }[];
  series: Series[];
}

export interface SeriesDetail {
  series: Series;
  episodes: SeriesEpisode[];
}

export interface SeriesContext extends SeriesDetail {
  current_index: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export interface ChannelAnalytics {
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_videos: number;
  public_videos: number;
  unlisted_videos: number;
  watch_sessions: number;
  total_watch_hours: number;
  completion_rate_percent: number;
  engagement_to_view_rate: number;
}

export interface MusicArtist { id: string; name: string; slug: string; bio: string; avatar_url: string; banner_url: string; primary_channel_id: string; channel_name?: string; verified: boolean; created_at?: string }
export interface MusicRelease {
  id: string; artist_id: string; artist_name: string; artist_slug: string; artist_avatar_url?: string; title: string; slug: string;
  release_type: 'single' | 'ep' | 'album'; cover_url: string; release_date?: string; label: string;
  copyright_text?: string; phonogram_text?: string; territories?: string;
  has_lossless_audio: boolean; max_audio_bit_depth?: number; max_audio_sample_rate?: number;
  /** Counts every track, drafts included; the release's track list can be shorter. */
  track_count: number; created_at?: string;
}
/** A published track. Tracks have no artwork of their own: cover_url is the release cover. */
export interface MusicTrack {
  id: string; release_id: string; release_title: string; release_slug: string;
  release_label?: string; release_copyright_text?: string; release_phonogram_text?: string; release_territories?: string;
  cover_url: string; primary_artist_id: string; artist_name: string; artist_slug: string;
  title: string; slug: string; disc_number: number; track_number: number; duration_seconds: number;
  isrc?: string; explicit: boolean; language?: string;
  /** Original upload (often lossless): /music-assets/tracks/<id>/master.<ext> */
  audio_url: string; audio_codec?: string; audio_container?: string; audio_sample_rate?: number; audio_bit_depth?: number; audio_lossless: boolean;
  /** AAC 128 / 256 / 320 kbps .m4a renditions. */
  audio_low_url: string; audio_medium_url: string; audio_high_url: string;
  lyrics?: string;
  /** LRC text: "[mm:ss.xx] line" */
  synced_lyrics?: string;
  official_video_id?: string; official_video_title?: string; official_video_thumbnail?: string;
}
export interface ChannelMusic { artist: MusicArtist; releases: MusicRelease[] }

export interface AuthSession {
  session_token: string;
  user_id: string;
  user_type?: string;
  username?: string;
  email?: string;
}

export interface MobileAuthCallbackResponse {
  app_redirect_url?: string;
}
