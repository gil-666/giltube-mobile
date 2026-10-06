// Shapes returned by the /admin/media-ingests and /admin/transcode-jobs routes.

export type IngestMediaType = 'movie' | 'series';

export type MediaIngest = {
  id: string;
  media_type: IngestMediaType;
  title: string;
  year: number;
  season_count: number;
  source_url: string;
  status: string;
  qbittorrent_hash: string;
  qbittorrent_name: string;
  save_path: string;
  content_path: string;
  progress: number;
  download_speed: number;
  eta: number;
  attached_video_id: string;
  error_message: string;
  video_status: string;
  video_progress: number;
  created_at: string;
  updated_at: string;
};

export type SeriesPreviewFile = {
  file_path: string;
  file_name: string;
  relative_path: string;
  size: number;
  season_number: number;
  episode_number: number;
  title: string;
};

export type AudioStream = {
  index: number;
  codec_name: string;
  channels: number;
  sample_rate: string;
  duration: string;
  tags?: Record<string, string>;
};

export type SubtitleStream = {
  index: number;
  codec_name: string;
  tags?: Record<string, string>;
  disposition?: { default?: number; forced?: number };
};

export type TrackSource<S> = {
  file_path: string;
  relative_path: string;
  size: number;
  streams: S[];
};

export type AudioSource = TrackSource<AudioStream>;
export type SubtitleSource = TrackSource<SubtitleStream>;

export type TrackTargetType = 'movie' | 'episode';

export type TrackImportRequest = {
  target_type: TrackTargetType;
  target_id: string;
  file_path: string;
  stream_index: number;
  label?: string;
  language?: string;
  default?: boolean;
  delay_ms?: number;
  trim_start_ms?: number;
};

export type TrackImportResult = { target_title?: string; video_id?: string };

export type AudioJob = { job_id: string; status: 'queued' | 'processing' | 'completed' | 'failed' | string; error?: string; result?: TrackImportResult };

export type TranscodeJob = {
  video_id: string;
  title: string;
  file_path: string;
  status: string;
  progress: number;
  error_message: string;
  attempts: number;
  worker_id: string;
  video_status: string;
  video_progress: number;
  hls_path: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
};

export type TranscodeAction = 'start' | 'restart' | 'pause' | 'cancel';

// Picker data (only the fields these screens read).
export type PickerChannel = { id: string; name: string; username?: string };
export type PickerSeries = { id: string; title: string; seasons: number; episode_count: number };
export type PickerMovie = { id: string; title: string; video_id: string };
export type PickerEpisode = { id: string; title: string; season_number: number; episode_number: number };
