import { StyleSheet, Text, View } from 'react-native';

import { AdminChips, AdminField } from './ui';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, radii } from '@/theme/tokens';
import { contentDescriptorText } from '@/utils/contentRating';

// Admin model of a movie/series content rating. Ratings resolve from TMDB on
// their own ("auto"); "manual" pins what the admin typed.
export const CONTENT_DESCRIPTOR_KEYS = ['violence', 'sex', 'nudity', 'language', 'drugs', 'fear', 'discrimination'] as const;

export interface ContentRatingInput {
  mode: 'auto' | 'manual';
  rating: string;
  descriptors: string[];
  // TMDB id picked in the metadata search; lets the resolver skip guessing.
  tmdbId: number;
  // Only a changed mode or manual value is sent, so saving unrelated fields
  // never resets a resolved rating.
  dirty: boolean;
}

export const emptyContentRatingInput = (): ContentRatingInput => ({ mode: 'auto', rating: '', descriptors: [], tmdbId: 0, dirty: false });

export function contentRatingInputFrom(item: { content_rating?: { rating?: string; descriptors?: string[]; source?: string; tmdb_id?: number } } | null | undefined): ContentRatingInput {
  const rating = item?.content_rating;
  return { mode: rating?.source === 'manual' ? 'manual' : 'auto', rating: rating?.rating || '', descriptors: [...(rating?.descriptors || [])], tmdbId: Number(rating?.tmdb_id || 0), dirty: false };
}

/** Adds the rating fields the movie/series create and update endpoints accept. */
export function appendContentRating(form: FormData, input?: ContentRatingInput | null) {
  if (!input) return;
  if (input.tmdbId > 0) form.append('tmdb_id', String(input.tmdbId));
  if (!input.dirty) return;
  form.append('content_rating_mode', input.mode);
  if (input.mode === 'manual') {
    form.append('content_rating', input.rating.trim());
    form.append('content_descriptors', input.descriptors.join(','));
  }
}

const DESCRIPTOR_LABELS: Record<string, string> = { violence: 'Violence', sex: 'Sex', nudity: 'Nudity', language: 'Strong language', drugs: 'Drugs', fear: 'Frightening scenes', discrimination: 'Discrimination' };

export function ContentRatingEditor({ value, onChange }: { value: ContentRatingInput; onChange: (value: ContentRatingInput) => void }) {
  const { t } = useI18n();
  const update = (patch: Partial<ContentRatingInput>) => onChange({ ...value, ...patch, dirty: true });
  const toggle = (key: string) => {
    const next = value.descriptors.includes(key) ? value.descriptors.filter((item) => item !== key) : [...value.descriptors, key];
    update({ descriptors: CONTENT_DESCRIPTOR_KEYS.filter((item) => next.includes(item)) });
  };
  const summary = value.rating ? [value.rating, contentDescriptorText({ rating: value.rating, descriptors: value.descriptors }, t)].filter(Boolean).join(' · ') : t('Looked up from TMDB after saving');
  return <View>
    <AdminChips label={t('Content rating')} options={[{ value: 'auto', label: t('From TMDB') }, { value: 'manual', label: t('Manual') }]} value={value.mode} onChange={(mode) => update({ mode })} />
    {value.mode === 'auto'
      ? <Text style={styles.summary}>{summary}</Text>
      : <>
        <AdminField label={t('Rating')} value={value.rating} onChangeText={(rating) => update({ rating: rating.toUpperCase() })} placeholder="TV-MA" autoCapitalize="characters" />
        <Text style={styles.label}>{t('Contains')}</Text>
        <View style={styles.chips}>{CONTENT_DESCRIPTOR_KEYS.map((key) => {
          const active = value.descriptors.includes(key);
          return <PressableScale key={key} onPress={() => toggle(key)} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{t(DESCRIPTOR_LABELS[key])}</Text></PressableScale>;
        })}</View>
      </>}
  </View>;
}

const styles = StyleSheet.create({
  summary: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 32, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.white },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.black },
});
