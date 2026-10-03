import { fetch as expoFetch } from 'expo/fetch';

import { getAPISession } from '@/api/client';
import { environment } from '@/config/environment';
import type { WatchPartyEvent } from '@/types/api';

const reconnectDelay = 1_500;

export function subscribeToWatchParty(partyID: string, userID: string, onEvent: (event: WatchPartyEvent) => void) {
  let closed = false;
  let controller: AbortController | null = null;

  const connect = async () => {
    while (!closed) {
      controller = new AbortController();
      try {
        const token = getAPISession();
        const response = await expoFetch(`${environment.apiURL}/watch-parties/${encodeURIComponent(partyID)}/events?user_id=${encodeURIComponent(userID)}`, {
          headers: token ? { Accept: 'text/event-stream', Authorization: `Bearer ${token}` } : { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Watch party stream failed (${response.status})`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
            if (data) {
              try { onEvent(JSON.parse(data) as WatchPartyEvent); } catch { /* Ignore malformed events and keep the room connected. */ }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch {
        // Mobile networks routinely interrupt long-lived requests. Reconnect below.
      }
      if (!closed) await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
    }
  };

  void connect();
  return () => {
    closed = true;
    controller?.abort();
  };
}
