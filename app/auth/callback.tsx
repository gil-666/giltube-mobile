import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { colors } from '@/theme/tokens';
import { useI18n } from '@/i18n';

export default function AuthCallbackScreen() {
  const { t } = useI18n();
  const { completeSignIn } = useAuth();
  const params = useLocalSearchParams<{ code?: string | string[]; state?: string | string[]; error?: string | string[] }>();
  const started = useRef(false);
  const [error, setError] = useState('');
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const state = Array.isArray(params.state) ? params.state[0] : params.state;
  const providerError = Array.isArray(params.error) ? params.error[0] : params.error;
  const displayedError = providerError || (!code ? t('GILid did not return a mobile sign-in code.') : error);

  useEffect(() => {
    if (started.current || providerError || !code) return;
    started.current = true;

    void completeSignIn(code, state)
      .then(() => router.replace('/(tabs)'))
      .catch((cause) => setError(t(cause instanceof Error ? cause.message : 'Please try again.')));
  }, [code, completeSignIn, providerError, state, t]);

  return (
    <View style={styles.screen}>
      {!displayedError && <ActivityIndicator color={colors.gilid} size="large" />}
      <Text style={styles.title}>{t(displayedError ? 'Could not sign in' : 'Finishing sign-in…')}</Text>
      <Text style={[styles.body, !!displayedError && styles.error]}>{displayedError || t('Returning securely from GILid.')}</Text>
      {!!displayedError && <PressableScale onPress={() => router.replace('/login')} style={styles.button}><Text style={styles.buttonText}>{t('Back to sign in')}</Text></PressableScale>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 18 },
  body: { color: colors.textMuted, fontSize: 14, marginTop: 6 },
  error: { color: colors.accentBright, maxWidth: 330, textAlign: 'center', lineHeight: 20 },
  button: { marginTop: 22, minHeight: 48, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gilid },
  buttonText: { color: colors.black, fontSize: 14, fontWeight: '900' },
});
