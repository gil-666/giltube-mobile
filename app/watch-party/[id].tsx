import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { isWatchPartyEndedError, usePlayer } from '@/player/PlayerProvider';
import { colors, radii } from '@/theme/tokens';

export default function WatchPartyResolver() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { status } = useAuth();
  const { watchParty, joinWatchParty, expand } = usePlayer();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || status !== 'signedIn') return;
    let cancelled = false;
    const open = async () => {
      try {
        const snapshot = watchParty?.party.id === id ? watchParty : await joinWatchParty(id);
        if (cancelled) return;
        expand();
        router.replace({ pathname: '/video/[id]', params: { id: snapshot.video.id, party: id } });
      } catch (reason) {
        if (!cancelled && !isWatchPartyEndedError(reason)) setError(reason instanceof Error ? reason.message : t('This watch party could not be opened.'));
      }
    };
    void open();
    return () => { cancelled = true; };
  }, [expand, id, joinWatchParty, status, t, watchParty]);

  if (status === 'loading') return <Loading label={t('Opening watch party…')} />;
  if (status !== 'signedIn') return <View style={styles.center}><Ionicons name="people-circle-outline" size={46} color={colors.accentBright} /><Text style={styles.title}>{t('Sign in to join')}</Text><Text style={styles.body}>{t('Watch parties use your GilTube account to sync playback and chat.')}</Text><PressableScale onPress={() => router.push('/login')} style={styles.button}><Text style={styles.buttonText}>{t('Sign in')}</Text></PressableScale></View>;
  if (error) return <View style={styles.center}><Ionicons name="alert-circle-outline" size={44} color={colors.accentBright} /><Text style={styles.title}>{t('Party unavailable')}</Text><Text style={styles.body}>{error}</Text><PressableScale onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>{t('Go back')}</Text></PressableScale></View>;
  return <Loading label={t('Joining and opening the video…')} />;
}

function Loading({ label }: { label: string }) {
  return <View style={styles.center}><ActivityIndicator color={colors.accentBright} size="large" /><Text style={styles.body}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.canvas },
  title: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 12 },
  body: { color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 9 },
  button: { height: 46, justifyContent: 'center', paddingHorizontal: 24, marginTop: 22, borderRadius: radii.pill, backgroundColor: colors.accent },
  buttonText: { color: colors.white, fontWeight: '900' },
});
