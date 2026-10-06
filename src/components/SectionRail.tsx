import { FlatList, Text, View } from 'react-native';
import { RelatedMediaCard, VideoCard } from './VideoCard';
import { colors, makeStyles } from '@/theme/tokens';
import type { RelatedMedia, Video } from '@/types/api';

type RailItem = { key: string; video?: Video; media?: RelatedMedia };

// Movies and whole series can be woven into a video rail: every third slot,
// starting at the front when mediaFirst is set.
function railItems(videos: Video[], media: RelatedMedia[] = [], mediaFirst = false): RailItem[] {
  const items: RailItem[] = videos.map((video) => ({ key: video.id, video }));
  const start = mediaFirst ? 0 : 1;
  media.forEach((item, index) => items.splice(Math.min(start + index * 3, items.length), 0, { key: `${item.kind}:${item.id}`, media: item }));
  return items;
}

export function SectionRail({ title, subtitle, videos, media, mediaFirst, progressByVideoID }: { title: string; subtitle?: string; videos: Video[]; media?: RelatedMedia[]; mediaFirst?: boolean; progressByVideoID?: Record<string, number> }) {
  const styles = useStyles();
  if (!videos?.length && !media?.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <FlatList
        horizontal
        data={railItems(videos || [], media, mediaFirst)}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index }) => item.media ? <RelatedMediaCard media={item.media} index={index} /> : <VideoCard video={item.video!} index={index} progress={progressByVideoID?.[item.video!.id]} />}
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

const useStyles = makeStyles(() => ({
  section: { marginTop: 30 },
  heading: { paddingHorizontal: 18, marginBottom: 13 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  list: { paddingHorizontal: 18 },
  separator: { width: 14 },
}));
