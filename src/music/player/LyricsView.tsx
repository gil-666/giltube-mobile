import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { useI18n } from '@/i18n';
import { activeLyricIndex, parseTrackLyrics } from '@/music/lyrics';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { colors, makeStyles, withAlpha } from '@/theme/tokens';

/** Karaoke-style synced lyrics (tap a line to seek), or plain lyrics as text. */
export function LyricsView({ bottomInset }: { bottomInset: number }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { current, position, seek, playing, togglePlay } = useMusicPlayer();
  const lyrics = useMemo(() => parseTrackLyrics(current), [current]);
  const active = lyrics?.synced ? activeLyricIndex(lyrics.lines, position) : -1;

  const scrollRef = useRef<ScrollView>(null);
  const linesY = useRef<{ y: number; height: number }[]>([]);
  const userScrollUntil = useRef(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    if (!lyrics?.synced || active < 0 || viewport <= 0) return;
    if (Date.now() < userScrollUntil.current) return;
    const line = linesY.current[active];
    if (!line) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, line.y + line.height / 2 - viewport / 2), animated: true });
  }, [active, lyrics, viewport]);

  if (!lyrics) {
    return <View style={styles.empty}><Text style={styles.emptyText}>{t('No lyrics for this track.')}</Text></View>;
  }

  if (!lyrics.synced) {
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]} showsVerticalScrollIndicator={false}>
        {lyrics.lines.map((line, lineIndex) => <Text key={lineIndex} style={styles.plain}>{line.text}</Text>)}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.height)}
      onScrollBeginDrag={() => { userScrollUntil.current = Date.now() + 4_000; }}
      onMomentumScrollEnd={() => { userScrollUntil.current = Date.now() + 2_500; }}
      contentContainerStyle={[styles.content, { paddingTop: viewport * 0.3, paddingBottom: Math.max(viewport * 0.45, bottomInset + 24) }]}
      showsVerticalScrollIndicator={false}
    >
      {lyrics.lines.map((line, lineIndex) => {
        const state = lineIndex === active ? styles.active : lineIndex < active ? styles.passed : styles.upcoming;
        return (
          <Pressable
            key={`${line.time}-${lineIndex}`}
            onLayout={(event: LayoutChangeEvent) => { linesY.current[lineIndex] = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }; }}
            onPress={() => {
              userScrollUntil.current = 0;
              seek(line.time);
              if (!playing) togglePlay();
            }}
            style={styles.lineButton}
          >
            <Text style={[styles.line, state]}>{line.text}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { paddingHorizontal: 24 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  plain: { color: colors.text, fontSize: 18, lineHeight: 28, fontWeight: '600', marginBottom: 6 },
  lineButton: { paddingVertical: 7 },
  line: { fontSize: 24, lineHeight: 31, fontWeight: '800' },
  passed: { color: withAlpha(colors.text, 0.38) },
  active: { color: colors.text },
  upcoming: { color: withAlpha(colors.text, 0.22) },
}));
