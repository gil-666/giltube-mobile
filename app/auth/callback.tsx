import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { hasPendingSignIn, useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { colors, makeStyles } from '@/theme/tokens';
import { useI18n } from '@/i18n';

export default function AuthCallbackScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const { completeSignIn, status } = useAuth();
  const params = useLocalSearchParams<{ code?: string | string[]; state?: string | string[]; error?: string | string[] }>();
  const started = useRef(false);
  const [error, setError] = useState('');
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const state = Array.isArray(params.state) ? params.state[0] : params.state;
  const providerError = Array.isArray(params.error) ? params.error[0] : params.error;
  const displayedError = providerError || (!code ? t('GILid did not return a mobile sign-in code.') : error);

  const leave = () => router.replace(status === 'signedIn' || status === 'guest' ? '/(tabs)' : '/login');

  useEffect(() => {
    if (started.current || providerError || !code || status === 'loading') return;
    started.current = true;

    void (async () => {
      // A callback this app did not start (e.g. a GILid sign-in for GilTube
      // web that Android handed to the app) must not be redeemed here: it
      // can't succeed, and the user's app session should stay untouched.
      if (!(await hasPendingSignIn())) {
        router.replace(status === 'signedIn' || status === 'guest' ? '/(tabs)' : '/login');
        return;
      }
      await completeSignIn(code, state);
      router.replace('/(tabs)');
    })().catch((cause) => setError(t(cause instanceof Error ? cause.message : 'Please try again.')));
  }, [code, completeSignIn, providerError, state, status, t]);

  return (
    <View style={styles.screen}>
      {!displayedError && <ActivityIndicator color={colors.gilid} size="large" />}
      <Text style={styles.title}>{t(displayedError ? 'Could not sign in' : 'Finishing sign-in…')}</Text>
      <Text style={[styles.body, !!displayedError && styles.error]}>{displayedError || t('Returning securely from GILid.')}</Text>
      {!!displayedError && <PressableScale onPress={leave} style={styles.button}><Text style={styles.buttonText}>{t(status === 'signedIn' ? 'Go to Home' : 'Back to sign in')}</Text></PressableScale>}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 18 },
  body: { color: colors.textMuted, fontSize: 14, marginTop: 6 },
  error: { color: colors.accentBright, maxWidth: 330, textAlign: 'center', lineHeight: 20 },
  button: { marginTop: 22, minHeight: 48, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gilid },
  buttonText: { color: colors.black, fontSize: 14, fontWeight: '900' },
}));
