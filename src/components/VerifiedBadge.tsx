import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';
import { useI18n } from '@/i18n';

export function VerifiedBadge({ verified, size = 14 }: { verified?: boolean; size?: number }) {
  const { t } = useI18n();
  if (!verified) return null;
  return <Ionicons accessibilityLabel={t('Verified channel')} name="checkmark-circle" color={colors.white} size={size} />;
}
