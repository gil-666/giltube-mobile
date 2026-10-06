import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native';

import type { NewsItem } from '@/api/news';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';

import { hasNewsCTA } from './navigation';

/** The news item's call-to-action button, or nothing when it has none. */
export function NewsCTAButton({ item, onPress }: { item: Pick<NewsItem, 'cta_kind' | 'cta_label' | 'cta_target'>; onPress: () => void }) {
  const styles = useStyles();
  const { t } = useI18n();
  if (!hasNewsCTA(item)) return null;
  const external = item.cta_kind === 'external';
  return <PressableScale accessibilityRole={external ? 'link' : 'button'} onPress={onPress} style={styles.button}>
    <Text numberOfLines={1} style={styles.text}>{item.cta_label.trim() || t('Learn more')}</Text>
    <Ionicons name={external ? 'open-outline' : 'arrow-forward'} size={17} color={colors.onAccent} />
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, borderRadius: radii.pill, backgroundColor: colors.accent },
  text: { flexShrink: 1, color: colors.onAccent, fontSize: 14, fontWeight: '900' },
}));
