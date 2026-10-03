import { FlatList, StyleSheet, Text, View } from 'react-native';
import { VideoCard } from './VideoCard';
import { colors } from '@/theme/tokens';
import type { Video } from '@/types/api';

export function SectionRail({ title, subtitle, videos, progressByVideoID }: { title: string; subtitle?: string; videos: Video[]; progressByVideoID?: Record<string, number> }) {
  if (!videos?.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <FlatList
        horizontal
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <VideoCard video={item} index={index} progress={progressByVideoID?.[item.id]} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={4}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 30 },
  heading: { paddingHorizontal: 18, marginBottom: 13 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  list: { paddingHorizontal: 18 },
  separator: { width: 14 },
});
