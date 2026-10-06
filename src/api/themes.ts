import { apiRequest } from './client';
import type { ThemeStyle } from '@/theme/themeMath';

export interface ThemeRecord {
  id: string;
  share_code: string;
  name: string;
  primary_color: string;
  accent_color: string;
  background_color: string;
  background_image: string;
  style: ThemeStyle;
  version: number;
  owner_user_id: string;
  owner_username: string;
  is_owner: boolean;
  is_retired: boolean;
  is_builtin: boolean;
  install_count: number;
  created_at: string;
  updated_at: string;
}

export interface ThemeLibrary {
  active_theme_id: string | null;
  themes: ThemeRecord[];
}

const encode = encodeURIComponent;

export const themesAPI = {
  library: async (): Promise<ThemeLibrary> => {
    const data = await apiRequest<ThemeLibrary>('/themes');
    return { active_theme_id: data?.active_theme_id || null, themes: data?.themes || [] };
  },
  active: async () => (await apiRequest<{ theme: ThemeRecord | null }>('/themes/active'))?.theme ?? null,
  setActive: async (themeID: string | null) =>
    (await apiRequest<{ theme: ThemeRecord | null }>('/themes/active', { method: 'PUT', body: JSON.stringify({ theme_id: themeID }) }))?.theme ?? null,
  shared: (code: string) => apiRequest<{ theme: ThemeRecord, installed: boolean }>(`/themes/shared/${encode(code)}`),
  install: async (code: string, activate: boolean) =>
    (await apiRequest<{ theme: ThemeRecord }>(`/themes/shared/${encode(code)}/install`, { method: 'POST', body: JSON.stringify({ activate }) })).theme,
  uninstall: (themeID: string) => apiRequest<{ removed: boolean }>(`/themes/${encode(themeID)}/install`, { method: 'DELETE' }),
  remove: (themeID: string) => apiRequest<{ deleted: boolean, retired: boolean }>(`/themes/${encode(themeID)}`, { method: 'DELETE' }),
};
