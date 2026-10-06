import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';
import { openGilTubeWeb } from '@/utils/web';

export default function LoginScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { signIn, continueAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const glow = useSharedValue(0.72);
  glow.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: glow.value }] }));

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const signedIn = await signIn();
      if (signedIn) router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(t('Could not sign in'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    await continueAsGuest();
    router.replace('/(tabs)');
  };

  const handleLegacyLogin = () => {
    void openGilTubeWeb('/login').catch((error) => Alert.alert(t('Could not open GilTube web'), error instanceof Error ? error.message : t('Please try again.')));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <LinearGradient colors={[withAlpha(colors.accentDark, 0.44), 'transparent']} style={styles.topGlow} />
      <Animated.View entering={FadeIn.duration(500)} style={styles.brand}><Image source={require('../assets/images/giltube-wordmark-large.png')} style={styles.heroLogo} contentFit="contain" accessibilityLabel="GilTube" accessibilityIgnoresInvertColors /></Animated.View>

      <Animated.View style={[styles.orb, glowStyle]} />
      <Animated.View entering={FadeInDown.delay(100).duration(620).springify()} style={styles.content}>
        <Text style={styles.eyebrow}>{t('YOUR SCREEN. YOUR CHANNELS.')}</Text>
        <Text style={styles.title}>{t('Everything you love,')}{`\n`}{t('ready to play.')}</Text>
        <Text style={styles.body}>{t('Sign in with GILid to pick up your history, subscriptions, and recommendations.')}</Text>

        <PressableScale disabled={loading} onPress={handleSignIn} style={styles.button}>
          {loading ? <ActivityIndicator color={colors.black} /> : <Text style={styles.buttonText}>{t('Continue with GILid')}</Text>}
        </PressableScale>
        <PressableScale disabled={loading} onPress={handleGuest} style={styles.guestButton}>
          <Text style={styles.guestButtonText}>{t('Browse as guest')}</Text>
        </PressableScale>
        <Text style={styles.security}>{t('Secure browser sign-in · GilTube never stores your GILid password')}</Text>
        <PressableScale disabled={loading} onPress={handleLegacyLogin} style={styles.legacyButton}><Text style={styles.legacyButtonText}>{t('Use legacy GilTube login (without GILid)')}</Text><Ionicons name="open-outline" size={12} color={colors.textDim} /></PressableScale>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1, overflow: 'hidden', backgroundColor: colors.screen, paddingHorizontal: 24 },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  brand: { zIndex: 2, height: 240, marginTop: -18, alignItems: 'center', justifyContent: 'center' },
  heroLogo: { width: '150%', aspectRatio: 2816 / 1536 },
  orb: { position: 'absolute', width: 340, height: 340, borderRadius: 170, right: -170, top: 120, backgroundColor: withAlpha(colors.accent, 0.18) },
  content: { flex: 1, justifyContent: 'flex-end', paddingBottom: 32 },
  eyebrow: { color: colors.accentBright, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 42, lineHeight: 45, letterSpacing: -1.8, fontWeight: '900', marginTop: 14 },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 18, maxWidth: 430 },
  button: { height: 56, borderRadius: radii.lg, backgroundColor: colors.gilid, alignItems: 'center', justifyContent: 'center', marginTop: 34 },
  buttonText: { color: colors.black, fontSize: 16, fontWeight: '900' },
  guestButton: { height: 52, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  guestButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  security: { color: colors.textDim, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 14 },
  legacyButton: { minHeight: 30, marginTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  legacyButtonText: { color: colors.textDim, fontSize: 10, fontWeight: '700', textDecorationLine: 'underline' },
}));
