import type { NotificationContentInput } from 'expo-notifications';

import type { NotificationItem } from '@/types/api';

export const notificationAction: Record<NotificationItem['type'], string> = {
  comment_video: 'Commented on your video',
  reply_comment: 'Replied to your comment',
  like_video: 'Liked your video',
  like_comment: 'Liked your comment',
  live_started: 'Is live now',
  new_video: 'Uploaded a new video',
  video_ready: 'Your video is ready',
  watch_party_invite: 'Invited you to a watch party',
  watch_party_host: 'Made you the watch party host',
  new_subscriber: 'Subscribed to your channel',
	featured_content: 'Featured on GilTube',
};

export function localNotificationContent(item: NotificationItem, t: (source: string) => string): NotificationContentInput {
	const featuredTitle = typeof item.metadata?.push_title === 'string' ? item.metadata.push_title : '';
	const featuredBody = typeof item.metadata?.push_body === 'string' ? item.metadata.push_body : '';
  const comment = item.target_comment?.snippet.trim();
  const video = item.target_video?.title.trim();
  let body = comment ? `“${comment}”` : video || t(notificationAction[item.type]);
  if (comment && video) body = `${body}\n${video}`;

  return {
	title: featuredTitle || item.actor_channel.name,
    subtitle: t(notificationAction[item.type]),
	body: featuredBody || body,
    data: {
      url: item.url,
      type: item.type,
      videoID: item.target_video?.id || '',
      commentID: item.target_comment?.id || '',
      notificationID: item.id,
    },
    sound: 'default',
    color: '#ef4444',
    priority: 'high',
    vibrate: [0, 180, 120, 180],
  };
}
