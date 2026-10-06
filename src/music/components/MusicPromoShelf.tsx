import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { musicAPI } from '@/api/music';
import { useI18n } from '@/i18n';
import { colors, makeStyles } from '@/theme/tokens';

import { musicKeys, useReleaseTilePlayback } from './hooks';
import { ReleaseTile } from './ReleaseTile';
import { Shelf } from './Shelf';

/** Compact "GilTube Music" shelf of the newest releases for non-music screens. Hidden while loading or empty. */
export function MusicPromoShelf({ limit = 10 }: { limit?: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const home = useQuery({ queryKey: musicKeys.home, queryFn: musicAPI.home });
  const tiles = useReleaseTilePlayback();
  const releases = home.data?.releases.slice(0, limit) || [];
  if (!releases.length) return null;
  return <Shelf
    title={t('GilTube Music')}
    subtitle={t('New releases to play now')}
    leading={<View style={styles.icon}><Ionicons name="musical-notes" size={18} color={colors.onAccent} /></View>}
    onTitlePress={() => router.push('/music')}
    onSeeAll={() => router.push('/music')}
  >
    {releases.map((release) => <ReleaseTile key={release.id} release={release} width={136} onPlay={tiles.onPlay} busy={tiles.busyID === release.id} playing={tiles.isPlaying(release)} />)}
  </Shelf>;
}

const useStyles = makeStyles(() => ({
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright },
}));
