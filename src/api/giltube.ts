import { File } from 'expo-file-system';

import { apiRequest } from './client';
import type {
  Account,
  AuthSession,
  Category,
  Channel,
  ChannelAnalytics,
  ChannelMusic,
  Comment,
  ContinueWatchingItem,
	FeaturedContent,
  HomeRecommendations,
  LiveChatMessage,
  LivePoll,
  LiveStream,
  MyLiveStream,
  Movie,
  MovieCatalog,
  NotificationItem,
  Playlist,
  PlaylistsResponse,
  SearchResponse,
  SearchResult,
  Series,
  SeriesCatalog,
  SeriesContext,
  SeriesDetail,
  SubscriptionState,
  SubscriptionsFeedResponse,
  SubscriptionsResponse,
  UserChannelsResponse,
  Video,
  PublicWatchParty,
  WatchPartySnapshot,
  WatchProgress,
} from '@/types/api';

export type MobileImage = { uri: string; name: string; mimeType?: string | null };
export type ChannelEditorInput = { name: string; description: string; avatar?: MobileImage; background?: MobileImage; removeAvatar?: boolean; removeBackground?: boolean; backgroundPositionX?: number; backgroundPositionY?: number; backgroundScale?: number; customHeaderHTML?: string; customHeaderCSS?: string; customContentHTML?: string; customContentCSS?: string };

function appendMobileFile(body: FormData, key: string, image?: MobileImage) {
  if (!image) return;
  // Expo's native fetch only accepts Blob-compatible File instances. The
  // legacy React Native `{ uri, name, type }` object throws an unsupported
  // FormDataPart implementation error on current Android builds.
  body.append(key, new File(image.uri));
}

function channelForm(input: ChannelEditorInput) {
  const body = new FormData(); body.append('name', input.name); body.append('description', input.description);
  appendMobileFile(body, 'avatar', input.avatar); appendMobileFile(body, 'background', input.background);
  if (input.removeAvatar) body.append('remove_avatar', 'true'); if (input.removeBackground) body.append('remove_background', 'true');
  if (input.backgroundPositionX !== undefined) body.append('background_position_x', String(input.backgroundPositionX)); if (input.backgroundPositionY !== undefined) body.append('background_position_y', String(input.backgroundPositionY)); if (input.backgroundScale !== undefined) body.append('background_scale', String(input.backgroundScale));
  body.append('custom_header_html', input.customHeaderHTML || ''); body.append('custom_header_css', input.customHeaderCSS || ''); body.append('custom_content_html', input.customContentHTML || ''); body.append('custom_content_css', input.customContentCSS || '');
  return body;
}

export interface DownloadPreparation {
  status: 'processing' | 'ready' | 'not_found';
  message: string;
  selected_quality: string;
  file_url?: string;
}

export const giltubeAPI = {
  account: () => apiRequest<Account>('/account/me'),
  home: () => apiRequest<HomeRecommendations>('/recommendations/home?limit=72'),
	featuredContent: () => apiRequest<{ items: FeaturedContent[] }>('/featured'),
  activeLiveStreams: () => apiRequest<LiveStream[]>('/live/active'),
  liveStream: (channelID: string) => apiRequest<LiveStream>(`/live/channels/${encodeURIComponent(channelID)}`),
  myLiveStream: (channelID: string) => apiRequest<MyLiveStream>(`/live/me?channel_id=${encodeURIComponent(channelID)}`),
  saveMyLiveStreamSettings: (channelID: string, title: string, description: string, dvrEnabled: boolean, adaptiveTranscodingEnabled: boolean) =>
		apiRequest<{ message: string; title: string; description: string; dvr_enabled: boolean; adaptive_transcoding_enabled: boolean }>('/live/me/settings', { method: 'PUT', body: JSON.stringify({ channel_id: channelID, title, description, dvr_enabled: dvrEnabled, adaptive_transcoding_enabled: adaptiveTranscodingEnabled }) }),
	uploadMyLiveStreamThumbnail: (channelID: string, image: MobileImage) => {
		const body = new FormData(); body.append('channel_id', channelID); appendMobileFile(body, 'thumbnail', image);
		return apiRequest<{ thumbnail_url: string; has_custom_thumbnail: boolean }>('/live/me/thumbnail', { method: 'POST', body });
	},
	deleteMyLiveStreamThumbnail: (channelID: string) => apiRequest<void>(`/live/me/thumbnail?channel_id=${encodeURIComponent(channelID)}`, { method: 'DELETE' }),
  setMyPublisherPresence: (channelID: string, enabled: boolean) =>
    apiRequest<{ message: string; use_publisher_presence: boolean }>('/live/me/publisher-presence', { method: 'POST', body: JSON.stringify({ channel_id: channelID, enabled }) }),
  startMyLiveStream: (channelID: string, title: string, description: string, dvrEnabled: boolean, adaptiveTranscodingEnabled: boolean) =>
    apiRequest<{ message: string }>('/live/me/start', { method: 'POST', body: JSON.stringify({ channel_id: channelID, title, description, dvr_enabled: dvrEnabled, adaptive_transcoding_enabled: adaptiveTranscodingEnabled }) }),
  stopMyLiveStream: (channelID: string) =>
    apiRequest<{ message: string }>('/live/me/stop', { method: 'POST', body: JSON.stringify({ channel_id: channelID }) }),
  liveChatMessages: (channelID: string, limit = 100) => apiRequest<LiveChatMessage[]>(`/live/channels/${encodeURIComponent(channelID)}/chat?limit=${limit}`),
  postLiveChatMessage: (channelID: string, actorChannelID: string, message: string) => apiRequest<{ message: string; id: string }>(`/live/channels/${encodeURIComponent(channelID)}/chat`, { method: 'POST', body: JSON.stringify({ channel_id: actorChannelID, message }) }),
  livePoll: (channelID: string, actorChannelID = '') => apiRequest<LivePoll | null>(`/live/channels/${encodeURIComponent(channelID)}/poll${actorChannelID ? `?channel_id=${encodeURIComponent(actorChannelID)}` : ''}`),
  createLivePoll: (channelID: string, question: string, options: string[]) => apiRequest<{ id: string; message: string }>(`/live/channels/${encodeURIComponent(channelID)}/polls`, { method: 'POST', body: JSON.stringify({ channel_id: channelID, question, options }) }),
  voteLivePoll: (channelID: string, pollID: string, actorChannelID: string, optionID: string) => apiRequest<{ message: string }>(`/live/channels/${encodeURIComponent(channelID)}/polls/${encodeURIComponent(pollID)}/vote`, { method: 'POST', body: JSON.stringify({ channel_id: actorChannelID, option_id: optionID }) }),
  endLivePoll: (channelID: string, pollID: string) => apiRequest<{ message: string }>(`/live/channels/${encodeURIComponent(channelID)}/polls/${encodeURIComponent(pollID)}/end`, { method: 'POST', body: JSON.stringify({ channel_id: channelID }) }),
  joinLivePresence: (streamID: string, input: { viewerID: string; name?: string; avatarURL?: string; anonymous: boolean }) => apiRequest<{ status: string }>(`/live/${encodeURIComponent(streamID)}/presence`, { method: 'POST', body: JSON.stringify({ viewer_id: input.viewerID, name: input.name || '', avatar_url: input.avatarURL || '', anonymous: input.anonymous }) }),
  leaveLivePresence: (streamID: string, viewerID: string) => apiRequest<{ status: string }>(`/live/${encodeURIComponent(streamID)}/presence?viewer_id=${encodeURIComponent(viewerID)}`, { method: 'DELETE' }),
  video: (id: string) => apiRequest<Video>(`/videos/${encodeURIComponent(id)}`),
  videos: (channelID: string) => apiRequest<Video[]>(`/my-videos?channel_id=${encodeURIComponent(channelID)}`),
  deleteVideo: (id: string) => apiRequest(`/videos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  categories: () => apiRequest<Category[]>('/categories/all'),
  movies: () => apiRequest<MovieCatalog>('/movies'),
  movie: (id: string) => apiRequest<{ movie: Movie }>(`/movies/${encodeURIComponent(id)}`),
  movieContext: (videoID: string) => apiRequest<{ movie: Movie }>(`/movie-videos/${encodeURIComponent(videoID)}`),
  movieTrailerContext: (videoID: string) => apiRequest<{ movie: Movie }>(`/movie-trailers/${encodeURIComponent(videoID)}`),
  series: () => apiRequest<SeriesCatalog>('/series'),
  seriesDetail: (id: string) => apiRequest<SeriesDetail>(`/series/${encodeURIComponent(id)}`),
  seriesContext: (videoID: string) => apiRequest<SeriesContext>(`/series-episodes/${encodeURIComponent(videoID)}`),
  seriesTrailerContext: (videoID: string) => apiRequest<{ series: Series }>(`/series-trailers/${encodeURIComponent(videoID)}`),
  channelAnalytics: (channelID: string) => apiRequest<ChannelAnalytics>(`/channels/${encodeURIComponent(channelID)}/analytics`),
  prepareDownload: (id: string, quality = 'best') =>
    apiRequest<DownloadPreparation>(`/videos/${encodeURIComponent(id)}/download?quality=${encodeURIComponent(quality)}`),
  downloadStatus: (id: string, quality: string) =>
    apiRequest<DownloadPreparation>(`/videos/${encodeURIComponent(id)}/download-status?quality=${encodeURIComponent(quality)}`),
  search: (query: string, page = 1) => apiRequest<SearchResponse>(`/search?q=${encodeURIComponent(query)}&page=${page}`),
  searchSuggestions: (query: string, limit = 10) =>
    apiRequest<{ suggestions: SearchResult[] }>(`/search/suggest?q=${encodeURIComponent(query)}&limit=${limit}`),
  relatedVideos: (id: string, limit = 10) => apiRequest<Video[]>(`/videos/${encodeURIComponent(id)}/related?limit=${limit}`),
  publicWatchParties: () => apiRequest<PublicWatchParty[]>('/watch-parties/public'),
  activeWatchParty: () => apiRequest<{ party: WatchPartySnapshot | null }>('/watch-parties/active'),
  watchParty: (id: string) => apiRequest<WatchPartySnapshot>(`/watch-parties/${encodeURIComponent(id)}`),
  createWatchParty: (input: { videoID: string; visibility: 'public' | 'private'; title?: string; channelID?: string; partyType?: 'single' | 'queue'; queueVideoIDs?: string[]; startTimeSeconds?: number }) =>
    apiRequest<{ id: string }>('/watch-parties', { method: 'POST', body: JSON.stringify({
      video_id: input.videoID, visibility: input.visibility, title: input.title || '', channel_id: input.channelID || '',
      party_type: input.partyType || 'queue', queue_video_ids: input.queueVideoIDs || [], start_time_seconds: input.startTimeSeconds || 0,
    }) }),
  joinWatchParty: (id: string, channelID = '') => apiRequest<{ status: string }>(`/watch-parties/${encodeURIComponent(id)}/join`, { method: 'POST', body: JSON.stringify({ channel_id: channelID }) }),
  inviteToWatchParty: (id: string, channelID: string, actorChannelID = '') => apiRequest<{ status: 'invited' | 'already_invited' }>(`/watch-parties/${encodeURIComponent(id)}/invite`, { method: 'POST', body: JSON.stringify({ channel_id: channelID, actor_channel_id: actorChannelID }) }),
  leaveWatchParty: (id: string) => apiRequest<{ status: string }>(`/watch-parties/${encodeURIComponent(id)}/leave`, { method: 'POST' }),
  watchPartyChat: (id: string, input: { message?: string; gifURL?: string; reaction?: string; channelID?: string }) =>
    apiRequest(`/watch-parties/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify({ message: input.message || '', gif_url: input.gifURL || '', reaction: input.reaction || '', channel_id: input.channelID || '' }) }),
  watchPartyPlayback: (id: string, action: 'play' | 'pause' | 'seek' | 'progress', currentTime: number, channelID = '') =>
    apiRequest(`/watch-parties/${encodeURIComponent(id)}/playback`, { method: 'POST', body: JSON.stringify({ action, current_time: currentTime, channel_id: channelID }) }),
  setWatchPartySyncMode: (id: string, mode: 'host-only' | 'open') => apiRequest(`/watch-parties/${encodeURIComponent(id)}/sync-mode`, { method: 'PUT', body: JSON.stringify({ mode }) }),
  transferWatchPartyHost: (id: string, userID: string) => apiRequest(`/watch-parties/${encodeURIComponent(id)}/transfer-host`, { method: 'POST', body: JSON.stringify({ user_id: userID }) }),
  setWatchPartySuggestPermission: (id: string, userID: string, canSuggest: boolean) => apiRequest(`/watch-parties/${encodeURIComponent(id)}/suggest-permission`, { method: 'PUT', body: JSON.stringify({ user_id: userID, can_suggest: canSuggest }) }),
  addWatchPartyQueueItem: (id: string, videoID: string) => apiRequest<{ id: string }>(`/watch-parties/${encodeURIComponent(id)}/queue`, { method: 'POST', body: JSON.stringify({ video_id: videoID }) }),
  playWatchPartyQueueItem: (id: string, itemID: string) => apiRequest(`/watch-parties/${encodeURIComponent(id)}/queue/${encodeURIComponent(itemID)}/play`, { method: 'POST' }),
  removeWatchPartyQueueItem: (id: string, itemID: string) => apiRequest(`/watch-parties/${encodeURIComponent(id)}/queue/${encodeURIComponent(itemID)}`, { method: 'DELETE' }),
  reorderWatchPartyQueue: (id: string, itemIDs: string[]) => apiRequest(`/watch-parties/${encodeURIComponent(id)}/queue/reorder`, { method: 'PUT', body: JSON.stringify({ item_ids: itemIDs }) }),
  incrementView: (id: string) => apiRequest<{ views?: number }>(`/videos/${encodeURIComponent(id)}/view`, { method: 'POST' }),
  userChannels: (userID: string) => apiRequest<UserChannelsResponse>(`/users/${encodeURIComponent(userID)}/channels`),
  createChannel: (input: ChannelEditorInput) => apiRequest<Channel>('/channels', { method: 'POST', body: channelForm(input) }),
  updateChannel: (channelID: string, input: ChannelEditorInput) => apiRequest<Channel>(`/channels/${encodeURIComponent(channelID)}`, { method: 'PUT', body: channelForm(input) }),
  deleteChannel: (channelID: string) => apiRequest<{ message: string }>(`/channels/${encodeURIComponent(channelID)}`, { method: 'DELETE' }),
  setDefaultChannel: (channelID: string) =>
    apiRequest<{ default_channel_id: string; channel_id: string; channel_name: string }>('/account/default-channel', {
      method: 'PUT', body: JSON.stringify({ channel_id: channelID }),
    }),
  updatePlaybackLanguages: (audioLanguage: string, captionLanguage: string) =>
    apiRequest<{ audio_language: string; caption_language: string }>('/account/playback-languages', {
      method: 'PUT', body: JSON.stringify({ audio_language: audioLanguage, caption_language: captionLanguage }),
    }),
  watchProgress: (videoID: string) =>
    apiRequest<{ progress: WatchProgress | null }>(`/videos/${encodeURIComponent(videoID)}/progress`),
  saveWatchProgress: (videoID: string, positionSeconds: number, durationSeconds: number) =>
    apiRequest<{ progress: WatchProgress }>(`/videos/${encodeURIComponent(videoID)}/progress`, {
      method: 'PUT', body: JSON.stringify({ position_seconds: positionSeconds, duration_seconds: durationSeconds }),
    }),
  watchProgressMap: (videoIDs: string[]) =>
    apiRequest<{ progress: Record<string, WatchProgress> }>(`/watch-progress/videos?ids=${encodeURIComponent([...new Set(videoIDs)].slice(0, 100).join(','))}`),
  recentWatchProgress: (limit = 12) =>
    apiRequest<{ items: ContinueWatchingItem[] }>(`/watch-progress/recent?limit=${limit}`),
  channel: async (channelID: string) => {
    const response = await apiRequest<{ channel: Channel; owner_username: string }>(`/channels/${encodeURIComponent(channelID)}/info`);
    return response.channel;
  },
  channelVideos: (channelID: string) => apiRequest<Video[]>(`/channels/${encodeURIComponent(channelID)}/videos`),
  channelClips: (channelID: string) => apiRequest<Video[]>(`/channels/${encodeURIComponent(channelID)}/clips`),
  channelMusic: (channelID: string) => apiRequest<ChannelMusic>(`/channels/${encodeURIComponent(channelID)}/music`),
  subscription: (channelID: string, actorChannelID = '') =>
    apiRequest<SubscriptionState>(`/channels/${encodeURIComponent(channelID)}/subscription${actorChannelID ? `?subscriber_channel_id=${encodeURIComponent(actorChannelID)}` : ''}`),
  subscribe: (channelID: string, actorChannelID = '') =>
    apiRequest<SubscriptionState>(`/channels/${encodeURIComponent(channelID)}/subscription`, {
      method: 'POST',
      body: JSON.stringify({ subscriber_channel_id: actorChannelID }),
    }),
  unsubscribe: (channelID: string, actorChannelID = '') =>
    apiRequest<SubscriptionState>(`/channels/${encodeURIComponent(channelID)}/subscription${actorChannelID ? `?subscriber_channel_id=${encodeURIComponent(actorChannelID)}` : ''}`, { method: 'DELETE' }),
  channelBlock: (channelID: string, blockerChannelID: string) =>
    apiRequest<{ blocked: boolean }>(`/channels/${encodeURIComponent(channelID)}/block?blocker_channel_id=${encodeURIComponent(blockerChannelID)}`),
  blockChannel: (channelID: string, blockerChannelID: string) =>
    apiRequest<{ blocked: boolean }>(`/channels/${encodeURIComponent(channelID)}/block`, { method: 'POST', body: JSON.stringify({ blocker_channel_id: blockerChannelID }) }),
  unblockChannel: (channelID: string, blockerChannelID: string) =>
    apiRequest<{ blocked: boolean }>(`/channels/${encodeURIComponent(channelID)}/block?blocker_channel_id=${encodeURIComponent(blockerChannelID)}`, { method: 'DELETE' }),
  subscribedChannels: (actorChannelID = '') =>
    apiRequest<SubscriptionsResponse>(`/subscriptions${actorChannelID ? `?subscriber_channel_id=${encodeURIComponent(actorChannelID)}` : ''}`),
  subscriptionsFeed: (actorChannelID = '') =>
    apiRequest<SubscriptionsFeedResponse>(`/subscriptions/feed?limit=20${actorChannelID ? `&subscriber_channel_id=${encodeURIComponent(actorChannelID)}` : ''}`),
  liked: (videoID: string, channelID: string) =>
    apiRequest<{ liked: boolean }>(`/videos/${encodeURIComponent(videoID)}/liked?channel_id=${encodeURIComponent(channelID)}`),
  like: (videoID: string, channelID: string) =>
    apiRequest<{ liked?: boolean; likes?: number }>(`/videos/${encodeURIComponent(videoID)}/like?channel_id=${encodeURIComponent(channelID)}`, { method: 'POST' }),
  unlike: (videoID: string, channelID: string) =>
    apiRequest<{ liked?: boolean; likes?: number }>(`/videos/${encodeURIComponent(videoID)}/like?channel_id=${encodeURIComponent(channelID)}`, { method: 'DELETE' }),
  comments: (videoID: string, channelID = '') =>
    apiRequest<Comment[]>(`/videos/${encodeURIComponent(videoID)}/comments${channelID ? `?channel_id=${encodeURIComponent(channelID)}` : ''}`),
  comment: (videoID: string, channelID: string, commentText: string, parentCommentID?: string) => {
    const body = new FormData();
    body.append('channel_id', channelID);
    body.append('text', commentText);
    if (parentCommentID) body.append('parent_comment_id', parentCommentID);
    return apiRequest<{ id: string }>(`/videos/${encodeURIComponent(videoID)}/comments`, { method: 'POST', body });
  },
  deleteComment: (commentID: string) => apiRequest(`/comments/${encodeURIComponent(commentID)}`, { method: 'DELETE' }),
  likeComment: (commentID: string, channelID: string) => apiRequest<{ likes: number; liked: boolean }>(`/comments/${encodeURIComponent(commentID)}/like?channel_id=${encodeURIComponent(channelID)}`, { method: 'POST' }),
  unlikeComment: (commentID: string, channelID: string) => apiRequest<{ likes: number; liked: boolean }>(`/comments/${encodeURIComponent(commentID)}/like?channel_id=${encodeURIComponent(channelID)}`, { method: 'DELETE' }),
  playlists: async (userID: string) => {
    const response = await apiRequest<PlaylistsResponse>(`/playlists?user_id=${encodeURIComponent(userID)}`);
    return { ...response, playlists: Array.isArray(response.playlists) ? response.playlists : [] };
  },
  playlist: async (playlistID: string) => {
    const response = await apiRequest<{ playlist: Playlist; videos: Video[] | null }>(`/playlists/${encodeURIComponent(playlistID)}`);
    return { ...response, videos: Array.isArray(response.videos) ? response.videos : [] };
  },
  createPlaylist: (input: { title: string; description?: string; visibility?: Playlist['visibility']; channelID?: string }) =>
    apiRequest<Playlist>('/playlists', { method: 'POST', body: JSON.stringify({ title: input.title, description: input.description || '', visibility: input.visibility || 'private', channel_id: input.channelID || '' }) }),
  addToPlaylist: (playlistID: string, videoID: string) =>
    apiRequest<{ message?: string }>(`/playlists/${encodeURIComponent(playlistID)}/videos`, { method: 'POST', body: JSON.stringify({ video_id: videoID }) }),
  notifications: () => apiRequest<{ items: NotificationItem[] }>('/notifications?limit=50'),
  notificationPreferences: () => apiRequest<{ preferences: Record<NotificationItem['type'], boolean> }>('/notifications/preferences'),
  setNotificationPreference: (type: NotificationItem['type'], enabled: boolean) => apiRequest<{ type: NotificationItem['type']; enabled: boolean }>('/notifications/preferences', { method: 'PUT', body: JSON.stringify({ type, enabled }) }),
  unreadNotifications: () => apiRequest<{ unread_count: number }>('/notifications/unread-count'),
  markNotificationRead: (notificationID: string) => apiRequest(`/notifications/${encodeURIComponent(notificationID)}/read`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) }),
  markAllNotificationsRead: () => apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
  registerMobilePushToken: (token: string, platform: 'android' | 'ios', deviceName = '') =>
    apiRequest<{ message: string; fcm_enabled: boolean }>('/notifications/mobile/register', {
      method: 'POST', body: JSON.stringify({ token, platform, device_name: deviceName }),
    }),
  unregisterMobilePushToken: (token: string) =>
    apiRequest<{ message: string }>('/notifications/mobile/unregister', {
      method: 'DELETE', body: JSON.stringify({ token }),
    }),
  beginMobileAuth: (codeChallenge: string) =>
    apiRequest<{ authorize_url: string }>('/oauth/gilid/start', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'login',
        client: 'mobile',
        app_redirect_uri: 'giltube://auth/callback',
        code_challenge: codeChallenge,
      }),
    }),
  finishMobileAuthCallback: (code: string, state: string) =>
    apiRequest<import('@/types/api').MobileAuthCallbackResponse>('/oauth/gilid/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    }),
  exchangeMobileAuth: (code: string, codeVerifier: string) =>
    apiRequest<AuthSession>('/oauth/gilid/mobile/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    }),
  logout: () => apiRequest<{ message: string }>('/auth/token', { method: 'DELETE' }),
};
