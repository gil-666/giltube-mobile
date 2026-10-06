import { apiRequest } from './client';

export type NewsNotifyMode = 'none' | 'silent' | 'loud';
export type NewsCTAKind = 'none' | 'internal' | 'external';

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  show_panel: boolean;
  notify_mode: NewsNotifyMode;
  cta_kind: NewsCTAKind;
  cta_label: string;
  cta_target: string;
  enabled: boolean;
  starts_at: string;
  ends_at: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
  /** Admin list only. */
  dismiss_count?: number;
}

export interface NewsPayload {
  title: string;
  body: string;
  show_panel: boolean;
  notify_mode: NewsNotifyMode;
  cta_kind: NewsCTAKind;
  cta_label: string;
  cta_target: string;
  enabled?: boolean;
  starts_at?: string;
  ends_at?: string | null;
}

const encode = encodeURIComponent;

export const newsAPI = {
  panels: async () => (await apiRequest<{ items: NewsItem[] }>('/news/panels'))?.items || [],
  item: async (id: string) => (await apiRequest<{ item: NewsItem }>(`/news/${encode(id)}`)).item,
  dismiss: (id: string) => apiRequest<{ dismissed: boolean }>(`/news/${encode(id)}/dismiss`, { method: 'POST' }),

  adminList: async () => (await apiRequest<{ items: NewsItem[] }>('/admin/news'))?.items || [],
  adminCreate: async (payload: NewsPayload) =>
    (await apiRequest<{ item: NewsItem }>('/admin/news', { method: 'POST', body: JSON.stringify(payload) })).item,
  adminUpdate: async (id: string, payload: NewsPayload) =>
    (await apiRequest<{ item: NewsItem }>(`/admin/news/${encode(id)}`, { method: 'PUT', body: JSON.stringify(payload) })).item,
  adminDelete: (id: string) => apiRequest<{ deleted: boolean }>(`/admin/news/${encode(id)}`, { method: 'DELETE' }),
};
