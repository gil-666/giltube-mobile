import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import type { LiveStream } from '@/types/api';
import { resolveMediaURL } from '@/utils/media';
import { openLive } from '@/player/navigation';

export function LiveStreamRail({ streams }: { streams: LiveStream[] }) {
  const styles = useStyles();
  const { t } = useI18n();
  if (!streams.length) return null;
  return <View style={styles.section}>
    <View style={styles.heading}><View><Text style={styles.title}>{t('Live now')}</Text><Text style={styles.subtitle}>{t('Join the stream and live chat')}</Text></View><View style={styles.livePill}><View style={styles.dot} /><Text style={styles.livePillText}>{t('LIVE')}</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{streams.map((stream) => <LiveStreamCard key={stream.channel_id} stream={stream} />)}</ScrollView>
  </View>;
}

export function LiveStreamCard({ stream }: { stream: LiveStream }) {
  const styles = useStyles();
  const { t } = useI18n();
  return <PressableScale accessibilityRole="button" accessibilityLabel={`${t('Watch')} ${stream.title} ${t('live')}`} onPress={() => openLive(stream.channel_id)} style={styles.card}>
    <View style={styles.imageWrap}>
      <Image source={resolveMediaURL(stream.thumbnail_url || stream.channel?.avatar_url)} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
      <View style={styles.badge}><Ionicons name="radio" size={11} color={colors.onAccent} /><Text style={styles.badgeText}>{t('LIVE')}</Text></View>
    </View>
    <View style={styles.copy}><Image source={resolveMediaURL(stream.channel?.avatar_url)} style={styles.avatar} contentFit="cover" /><View style={styles.text}><Text numberOfLines={2} style={styles.streamTitle}>{stream.title || t('Live stream')}</Text><View style={styles.channelRow}><Text numberOfLines={1} style={styles.channel}>{stream.channel?.name || 'GilTube'}</Text><VerifiedBadge verified={stream.channel?.verified} size={12} /></View></View></View>
  </PressableScale>;
}

const useStyles = makeStyles(() => ({
  section: { marginTop: 28 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 13 }, title: { color: colors.text, fontSize: 21, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 10, marginTop: 3 }, livePill: { height: 25, paddingHorizontal: 9, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: withAlpha(colors.accentDark, .38), borderWidth: 1, borderColor: withAlpha(colors.accentBright, .4) }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentBright }, livePillText: { color: colors.accentBright, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  rail: { paddingHorizontal: 18, gap: 13 }, card: { width: 254 }, imageWrap: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: withAlpha(colors.accentBright, .36) }, badge: { position: 'absolute', left: 8, bottom: 8, height: 24, paddingHorizontal: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent }, badgeText: { color: colors.onAccent, fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  copy: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceStrong }, text: { flex: 1, minWidth: 0, marginLeft: 9 }, streamTitle: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '800' }, channelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, channel: { color: colors.textMuted, fontSize: 11, maxWidth: 170 },
}));
