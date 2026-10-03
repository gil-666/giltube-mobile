import { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radii } from '@/theme/tokens';

export function SwipeSheet({ visible, title, onClose, children }: React.PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  useEffect(() => { if (visible) translateY.value = 0; }, [translateY, visible]);
  const gesture = Gesture.Pan().activeOffsetY(8).failOffsetX([-40, 40]).onUpdate((event) => {
    translateY.value = Math.max(0, event.translationY);
  }).onEnd((event) => {
    if (event.translationY > 90 || event.velocityY > 700) { runOnJS(onClose)(); return; }
    translateY.value = withSpring(0, motion.spring);
  });
  const motionStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.scrim}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <GestureDetector gesture={gesture}><Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }, motionStyle]}>
          <View style={styles.handle} /><Text style={styles.title}>{title}</Text><ScrollView bounces={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>{children}</ScrollView>
        </Animated.View></GestureDetector>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.68)' },
  sheet: { maxHeight: '76%', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.textDim, marginBottom: 15 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 10 },
});
