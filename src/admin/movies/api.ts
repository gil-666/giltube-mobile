import type { QueryClient } from '@tanstack/react-query';

import { appendContentRating, type ContentRatingInput } from '@/admin/ContentRatingEditor';
import { adminForm, adminJSON, adminRequest } from '@/admin/api';
import { namedUploadFile, type PickedAsset } from './files';
import { apiRequest } from '@/api/client';
import type { Movie, MovieCatalog } from '@/types/api';

// Channel the web admin files movie and trailer uploads under; the backend
// uses the same id as its default.
export const MOVIES_CHANNEL_ID = 'f765b137-9614-4b99-9f6d-6221abeb75cd';

export type MetadataResult = {
  source: string;
  source_id: string;
  title: string;
  synopsis: string;
  genre: string;
  genres: string[] | null;
  directors: string[] | null;
  cast: string[] | null;
  release_year: number;
  poster_url: string;
  backdrop_url: string;
};

export type AdminVideo = {
  id: string;
  title: string;
  description: string;
  status: string;
  thumbnail_url: string;
  hidden: boolean;
  created_at: string;
  channel_name: string;
  owner_username: string;
};

export type MovieFormState = {
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  genres: string;
  directors: string;
  cast: string;
  releaseYear: number;
  isFeatured: boolean;
  explicit: boolean;
  contentWarning: boolean;
  posterURL: string;
  backdropURL: string;
  poster: PickedAsset | null;
  backdrop: PickedAsset | null;
};

export const emptyMovieForm = (): MovieFormState => ({
  title: '', slug: '', synopsis: '', genre: 'Drama', genres: '', directors: '', cast: '', releaseYear: 0,
  isFeatured: false, explicit: false, contentWarning: false, posterURL: '', backdropURL: '', poster: null, backdrop: null,
});

const listText = (value?: string[] | null) => Array.isArray(value) ? value.join(', ') : '';

export function movieFormFrom(movie: Movie): MovieFormState {
  return {
    title: movie.title || '',
    slug: movie.slug || '',
    synopsis: movie.synopsis || '',
    genre: movie.genre || 'Drama',
    genres: listText(movie.genres),
    directors: listText(movie.directors),
    cast: listText(movie.cast),
    releaseYear: movie.release_year || 0,
    isFeatured: !!movie.is_featured,
    explicit: !!movie.explicit,
    contentWarning: !!movie.content_warning,
    posterURL: movie.poster_url || '',
    backdropURL: movie.backdrop_url || '',
    poster: null,
    backdrop: null,
  };
}

export function applyMetadata(form: MovieFormState, result: MetadataResult): MovieFormState {
  return {
    ...form,
    title: result.title || form.title,
    synopsis: result.synopsis || form.synopsis,
    genre: result.genre || form.genre,
    genres: listText(result.genres),
    directors: listText(result.directors),
    cast: listText(result.cast),
    releaseYear: result.release_year || form.releaseYear,
    posterURL: result.poster_url || form.posterURL,
    backdropURL: result.backdrop_url || form.backdropURL,
    poster: null,
    backdrop: null,
  };
}

export const moviesAPI = {
  list: () => apiRequest<MovieCatalog>('/movies'),
  get: (id: string) => apiRequest<{ movie: Movie }>(`/movies/${encodeURIComponent(id)}`),
  searchMetadata: (query: string) => adminRequest<{ results: MetadataResult[] | null }>(`/metadata/search?type=movie&query=${encodeURIComponent(query)}`),
  videos: (query: string) => adminRequest<AdminVideo[] | null>(`/videos?limit=60${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`),
  setVideo: (id: string, videoID: string) => adminJSON<{ message: string }>('POST', `/movies/${encodeURIComponent(id)}/video`, { video_id: videoID }),
  setTrailer: (id: string, videoID: string) => adminJSON<{ message: string }>('POST', `/movies/${encodeURIComponent(id)}/trailer`, { video_id: videoID }),
  remove: (id: string, deleteVideos: boolean) => adminRequest<{ message: string; deleted_videos: number }>(`/movies/${encodeURIComponent(id)}?delete_videos=${deleteVideos ? 'true' : 'false'}`, { method: 'DELETE' }),
};

type SaveResult = { id: string; slug: string; poster_url: string; backdrop_url: string };

/**
 * Creates (no id) or updates a movie with every field the web panel sends.
 * explicit/content_warning go out on every save, like the web does.
 */
export async function saveMovie(id: string | null, form: MovieFormState, rating: ContentRatingInput, options: { channelID?: string; videoID?: string; includeImages?: boolean } = {}) {
  const body = new FormData();
  body.append('title', form.title.trim());
  if (form.slug.trim()) body.append('slug', form.slug.trim());
  body.append('synopsis', form.synopsis);
  body.append('genre', form.genre.trim() || 'Drama');
  body.append('genres', form.genres);
  body.append('directors', form.directors);
  body.append('cast', form.cast);
  if (form.releaseYear > 0) body.append('release_year', String(form.releaseYear));
  body.append('channel_id', options.channelID || MOVIES_CHANNEL_ID);
  body.append('is_featured', form.isFeatured ? 'true' : 'false');
  body.append('explicit', form.explicit ? 'true' : 'false');
  body.append('content_warning', form.contentWarning ? 'true' : 'false');
  if (form.posterURL.trim()) body.append('poster_url', form.posterURL.trim());
  if (form.backdropURL.trim()) body.append('backdrop_url', form.backdropURL.trim());
  if (id && options.videoID) body.append('video_id', options.videoID);
  appendContentRating(body, rating);

  const cleanups: (() => void)[] = [];
  try {
    if (options.includeImages !== false) {
      for (const [field, asset] of [['poster', form.poster], ['backdrop', form.backdrop]] as const) {
        if (!asset) continue;
        const staged = await namedUploadFile(asset);
        cleanups.push(staged.cleanup);
        body.append(field, staged.file);
      }
    }
    return id
      ? await adminForm<SaveResult>('PUT', `/movies/${encodeURIComponent(id)}`, body)
      : await adminForm<SaveResult>('POST', '/movies', body);
  } finally {
    cleanups.forEach((cleanup) => cleanup());
  }
}

/** Refreshes admin and public movie caches after a change. */
export function invalidateMovies(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'movies'] });
  void queryClient.invalidateQueries({ queryKey: ['movies'] });
  void queryClient.invalidateQueries({ queryKey: ['movie'] });
  void queryClient.invalidateQueries({ queryKey: ['movie-context'] });
  void queryClient.invalidateQueries({ queryKey: ['movie-trailer-context'] });
}
