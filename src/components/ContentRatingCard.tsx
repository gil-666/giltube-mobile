import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useI18n } from '@/i18n';
import type { ContentRating } from '@/types/api';
import { contentDescriptorText } from '@/utils/contentRating';

export type ContentWarningKind = '' | 'movie' | 'episode';

// Shown once per title when its playback is running: the disturbing-content
// notice for 5s (when flagged), crossfading into the rating card for 7s.
// Mount it with key={videoID} so each title gets its own run.
export function ContentRatingCard({ rating, warning, active, fullscreen }: { rating?: ContentRating; warning: ContentWarningKind; active: boolean; fullscreen?: boolean }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<'' | 'warning' | 'rating'>('');
  const shownRef = useRef(false);
  const hasRating = !!rating?.rating;

  // Resuming skips the playback intro, so playback can start before the
  // rating loads; whichever arrives last starts the cards.
  useEffect(() => {
    if (!active || shownRef.current || (!warning && !hasRating)) return;
    shownRef.current = true;
    setStage(warning ? 'warning' : 'rating');
  }, [active, hasRating, warning]);

  useEffect(() => {
    if (!stage) return;
    const timer = setTimeout(() => setStage(stage === 'warning' && hasRating ? 'rating' : ''), stage === 'warning' ? 5_000 : 7_000);
    return () => clearTimeout(timer);
  }, [hasRating, stage]);

  const descriptors = contentDescriptorText(rating, t);
  return <View pointerEvents="none" style={[styles.stack, fullscreen && styles.stackFullscreen]}>
    {stage === 'warning' && <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)} style={[styles.card, styles.warningCard]}>
      <Text style={styles.warningText}>{t(warning === 'episode' ? 'The following episode contains scenes that some viewers may find disturbing.' : 'The following movie contains scenes that some viewers may find disturbing.')}</Text>
    </Animated.View>}
    {stage === 'rating' && hasRating && <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)} style={styles.card}>
      <Text style={styles.rating}>{rating!.rating}</Text>
      {!!descriptors && <Text style={styles.descriptors}>{descriptors}</Text>}
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', top: 14, left: 14, right: 70 },
  stackFullscreen: { top: 28, left: 40, right: 120 },
  card: { position: 'absolute', top: 0, left: 0, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 3, borderLeftColor: '#e50914', backgroundColor: 'rgba(0,0,0,.55)', paddingVertical: 6, paddingLeft: 10, paddingRight: 18 },
  warningCard: { maxWidth: 360 },
  warningText: { color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
  rating: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: .3 },
  descriptors: { color: 'rgba(255,255,255,.85)', fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
