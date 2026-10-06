import { File } from 'expo-file-system';

import { adminJSON, adminRequest, apiJSON } from '@/admin/api';
import { apiRequest } from '@/api/client';

export type ModerationStatus = 'active' | 'suspended' | 'banned';
export type ModerationAction = 'suspend' | 'unsuspend' | 'ban' | 'unban';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  user_type: string;
  status: string;
  created_at: string;
  channel_count: number;
  video_count: number;
  total_views: number;
}

export interface AdminChannel {
  id: string;
  name: string;
  user_id: string;
  username: string;
  user_type: string;
  created_at: string;
  status: string;
  video_count: number;
  total_views: number;
}

export interface AdminVideo {
  id: string;
  title: string;
  description: string;
  status: string;
  views: number;
  likes: number;
  comments_count: number;
  thumbnail_url: string;
  has_custom_thumbnail: boolean;
  explicit: boolean;
  hidden: boolean;
  width: number;
  created_at: string;
  channel_id: string;
  // Only present on the global /admin/videos listing.
  channel_name?: string;
  owner_user_id?: string;
  owner_username?: string;
}

export interface EditableVideo {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  views: number;
  likes: number;
  thumbnail_url: string;
  has_custom_thumbnail: boolean;
  explicit: boolean;
  width: number;
  created_at: string;
  channel_id: string;
  categories?: { id: string; name: string; slug: string }[] | null;
  channel?: { id: string; user_id: string; name: string; avatar_url?: string; verified?: boolean };
}

export interface VideoCategory { id: string; name: string; slug: string }

export type VideoUpdate = {
  title: string;
  description: string;
  explicit: boolean;
  categoryID: string;
  revertThumbnail: boolean;
  thumbnailURI?: string;
};

const id = (value: string) => encodeURIComponent(value);

export const peopleKeys = {
  users: ['admin', 'people', 'users'] as const,
  channels: ['admin', 'people', 'channels'] as const,
  channelVideos: (channelID: string) => ['admin', 'people', 'channel-videos', channelID] as const,
  videos: (query: string, limit: number) => ['admin', 'people', 'videos', query, limit] as const,
  allVideos: ['admin', 'people', 'videos'] as const,
  video: (videoID: string) => ['admin', 'people', 'video', videoID] as const,
  categories: ['admin', 'people', 'categories'] as const,
};

// The list endpoints return JSON null when empty.
export const peopleAPI = {
  users: async () => (await adminRequest<AdminUser[] | null>('/users')) ?? [],
  toggleAdmin: (userID: string) => adminJSON<{ user_id: string; user_type: string }>('POST', `/users/${id(userID)}/toggle-admin`),
  deleteUser: (userID: string) => adminJSON<{ message: string }>('DELETE', `/users/${id(userID)}`),
  moderateUser: (userID: string, action: ModerationAction) => adminJSON<{ status: string }>('POST', `/users/${id(userID)}/${action}`),

  channels: async () => (await adminRequest<AdminChannel[] | null>('/channels')) ?? [],
  channelVideos: async (channelID: string) => (await adminRequest<AdminVideo[] | null>(`/channels/${id(channelID)}/videos`)) ?? [],
  moderateChannel: (channelID: string, action: ModerationAction) => adminJSON<{ status: string }>('POST', `/channels/${id(channelID)}/${action}`),

  videos: async (query: string, limit: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (query.trim()) params.set('q', query.trim());
    return (await adminRequest<AdminVideo[] | null>(`/videos?${params.toString()}`)) ?? [];
  },
  verifyVideo: (videoID: string) => adminJSON<{ message: string }>('PUT', `/videos/${id(videoID)}/verify`),

  video: (videoID: string) => apiRequest<EditableVideo>(`/videos/${id(videoID)}`),
  categories: async () => (await apiRequest<VideoCategory[] | null>('/categories/all')) ?? [],
  deleteVideo: (videoID: string) => apiJSON<{ message: string }>('DELETE', `/videos/${id(videoID)}`),

  /** Mirrors the web editor: multipart when a new thumbnail is attached, JSON otherwise. */
  updateVideo: (videoID: string, input: VideoUpdate) => {
    if (input.thumbnailURI) {
      const form = new FormData();
      form.append('title', input.title);
      form.append('description', input.description);
      form.append('explicit', String(input.explicit));
      if (input.categoryID) form.append('category_ids', input.categoryID);
      form.append('thumbnail', new File(input.thumbnailURI));
      return apiRequest<{ message: string }>(`/videos/${id(videoID)}`, { method: 'PUT', body: form });
    }
    return apiJSON<{ message: string }>('PUT', `/videos/${id(videoID)}`, {
      title: input.title,
      description: input.description,
      explicit: input.explicit,
      ...(input.categoryID ? { category_ids: input.categoryID } : {}),
      ...(input.revertThumbnail ? { revert_to_auto_thumbnail: true } : {}),
    });
  },
};
