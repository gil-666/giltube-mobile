import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import type { PickedAsset } from './files';
import { AdminButton, AdminButtons, AdminField, alertError, pickFile } from '@/admin/ui';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';

/** Artwork field: pick a new image file, or keep/paste an image URL. */
export function ImageField({ label, url, asset, onURL, onAsset, aspect }: { label: string; url: string; asset: PickedAsset | null; onURL: (value: string) => void; onAsset: (value: PickedAsset | null) => void; aspect: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const preview = asset?.uri || resolveMediaURL(url);
  const choose = async () => {
    try {
      const picked = await pickFile('image/*');
      if (picked) onAsset({ uri: picked.uri, name: picked.name, size: picked.size, mimeType: picked.mimeType });
    } catch (error) {
      alertError(t)(error);
    }
  };
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.row}>
      {preview ? <Image source={{ uri: preview }} style={[styles.preview, { aspectRatio: aspect }]} contentFit="cover" /> : <View style={[styles.preview, { aspectRatio: aspect }]} />}
      <View style={styles.side}>
        {asset ? <Text numberOfLines={2} style={styles.note}>{t('New file: {name}', { name: asset.name })}</Text> : <Text style={styles.note}>{url ? t('Using the current image URL.') : t('No image yet.')}</Text>}
        <AdminButtons>
          <AdminButton compact icon="image-outline" label={asset ? t('Change image') : t('Choose image')} onPress={() => void choose()} />
          {!!asset && <AdminButton compact label={t('Keep URL')} onPress={() => onAsset(null)} />}
        </AdminButtons>
      </View>
    </View>
    {!asset && <AdminField label={t('{label} URL', { label })} value={url} onChangeText={onURL} placeholder="https://" autoCapitalize="none" keyboardType="url" />}
  </View>;
}

const useStyles = makeStyles(() => ({
  wrap: { marginTop: 14 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  preview: { width: 110, borderRadius: radii.sm, backgroundColor: colors.surfaceStrong },
  side: { flex: 1, minWidth: 0 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
}));
