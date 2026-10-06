import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import type { MusicRelease } from '@/types/api';

import { MusicCover } from './Artwork';
import { releaseMeta } from './format';

export const RELEASE_TILE_WIDTH = 148;

/**
 * Cover, title, artist and "type · N tracks", with a play button on the cover.
 * Tapping the tile opens the release; the play button calls onPlay.
 */
export function ReleaseTile({ release, onPlay, busy = false, playing = false, width = RELEASE_TILE_WIDTH, showArtist = true }: {
  release: MusicRelease;
  onPlay?: (release: MusicRelease) => void;
  busy?: boolean;
  /** This release is the current queue and is playing. */
  playing?: boolean;
  width?: number | `${number}%`;
  showArtist?: boolean;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  return <PressableScale accessibilityRole="button" accessibilityLabel={`${release.title}, ${release.artist_name}`} onPress={() => router.push(`/music/releases/${release.slug}`)} style={{ width }}>
    <View>
      <MusicCover url={release.cover_url} size="md" rounded={radii.md} />
      {!!onPlay && <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Play {title}', { title: release.title })}
        disabled={busy}
        hitSlop={6}
        onPress={() => onPlay(release)}
        style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
      >
        {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Ionicons name={playing ? 'pause' : 'play'} size={18} color={colors.onAccent} style={playing ? undefined : styles.playIcon} />}
      </Pressable>}
    </View>
    <Text numberOfLines={1} style={styles.title}>{release.title}</Text>
    {showArtist && <Text numberOfLines={1} style={styles.artist}>{release.artist_name}</Text>}
    <Text numberOfLines={1} style={styles.meta}>{releaseMeta(release, t)}</Text>
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  play: { position: 'absolute', right: 8, bottom: 8, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright, shadowColor: colors.black, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  playPressed: { backgroundColor: colors.accent, transform: [{ scale: 0.94 }] },
  playIcon: { marginLeft: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 9 },
  artist: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
}));
