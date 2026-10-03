import { router } from 'expo-router';

import type { NotificationItem } from '@/types/api';

type NotificationData = Record<string, unknown>;

function stringValue(data: NotificationData, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function contextFromURL(url: string) {
	const categoryMovieMatch = url.match(/^\/category\/movies\?[^#]*movie_id=([^&#]+)/);
	if (categoryMovieMatch) return { movieID: decodeURIComponent(categoryMovieMatch[1]), seriesID: '', partyID: '', videoID: '', commentID: '', channelID: '' };
	const categorySeriesMatch = url.match(/^\/category\/series\?[^#]*series_id=([^&#]+)/);
	if (categorySeriesMatch) return { seriesID: decodeURIComponent(categorySeriesMatch[1]), movieID: '', partyID: '', videoID: '', commentID: '', channelID: '' };
	const movieMatch = url.match(/^\/movies\/([^/?#]+)/);
	if (movieMatch) return { movieID: decodeURIComponent(movieMatch[1]), seriesID: '', partyID: '', videoID: '', commentID: '', channelID: '' };
	const seriesMatch = url.match(/^\/series\/([^/?#]+)/);
	if (seriesMatch) return { seriesID: decodeURIComponent(seriesMatch[1]), movieID: '', partyID: '', videoID: '', commentID: '', channelID: '' };
  const partyMatch = url.match(/^\/watch-party\/([^/?#]+)/);
  if (partyMatch) {
    return { partyID: decodeURIComponent(partyMatch[1]), movieID: '', seriesID: '', videoID: '', commentID: '', channelID: '' };
  }
  const videoMatch = url.match(/^\/video\/([^/?#]+)/);
  if (videoMatch) {
    const commentMatch = url.match(/[?&]comment=([^&#]+)/);
    return {
      videoID: decodeURIComponent(videoMatch[1]),
      commentID: commentMatch ? decodeURIComponent(commentMatch[1]) : '',
      channelID: '',
      partyID: '',
	  movieID: '', seriesID: '',
    };
  }
  const liveMatch = url.match(/^\/live\/([^/?#]+)/);
  return {
    partyID: '',
	movieID: '', seriesID: '',
    videoID: '',
    commentID: '',
    channelID: liveMatch ? decodeURIComponent(liveMatch[1]) : '',
  };
}

export function notificationData(item: NotificationItem): NotificationData {
  return {
    url: item.url,
    type: item.type,
    notificationID: item.id,
    videoID: item.target_video?.id || '',
    commentID: item.target_comment?.id || '',
  };
}

export function notificationIDFromData(data: NotificationData) {
  return stringValue(data, 'notificationID', 'notification_id');
}

export function openNotificationContext(data: NotificationData) {
  const urlContext = contextFromURL(stringValue(data, 'url'));
	if (urlContext.movieID) { router.push({ pathname: '/movies/[id]', params: { id: urlContext.movieID } }); return; }
	if (urlContext.seriesID) { router.push({ pathname: '/series/[id]', params: { id: urlContext.seriesID } }); return; }
  const partyID = stringValue(data, 'partyID', 'party_id') || urlContext.partyID;
  if (partyID) {
    router.push({ pathname: '/watch-party/[id]', params: { id: partyID } });
    return;
  }
  const videoID = stringValue(data, 'videoID', 'video_id') || urlContext.videoID;
  const commentID = stringValue(data, 'commentID', 'comment_id') || urlContext.commentID;
  if (videoID) {
    router.push({
      pathname: '/video/[id]',
      params: commentID ? { id: videoID, comment: commentID } : { id: videoID },
    });
    return;
  }

  const channelID = stringValue(data, 'channelID', 'channel_id') || urlContext.channelID;
  if (channelID) {
    router.push({ pathname: '/live/[channelId]', params: { channelId: channelID } });
    return;
  }

  router.push('/notifications');
}
