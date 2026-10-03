import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { colors, radii } from '@/theme/tokens';

export function PlaceholderScreen({ icon, title, body, actionLabel, onAction }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Animated.View entering={FadeInDown.duration(420).springify()} style={styles.card}>
        <View style={styles.icon}><Ionicons name={icon} size={28} color={colors.accentBright} /></View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {!!actionLabel && !!onAction && (
          <PressableScale onPress={onAction} style={styles.action}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </PressableScale>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', padding: 24 },
  card: { borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 24 },
  icon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(239,68,68,.12)', alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 20 },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  action: { height: 48, marginTop: 22, borderRadius: radii.lg, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.black, fontSize: 14, fontWeight: '900' },
});
