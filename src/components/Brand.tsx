import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel="GilTube">
      <Image
        source={require('../../assets/images/giltube-wordmark.png')}
        style={[styles.wordmark, compact && styles.compactWordmark]}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { width: 100, height: 54 },
  compactWordmark: { width: 78, height: 42 },
});
