import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleProp, Text, TextStyle, View } from 'react-native';

import { useI18n } from '@/i18n';
import { titleLogoURL } from '@/utils/titleLogo';

/**
 * A movie's or series' title logo in place of its text title. The logo is
 * sized from its own proportions within maxWidth x maxHeight; the text title
 * shows until it loads and if it fails.
 */
export function TitleLogo({ logos, title, maxWidth, maxHeight, textStyle, numberOfLines }: { logos?: Record<string, string>; title: string; maxWidth: number; maxHeight: number; textStyle: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { locale } = useI18n();
  const uri = titleLogoURL(logos, locale);
  const [size, setSize] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState('');
  const loaded = !!size && size.uri === uri;
  if (!uri || failed === uri) return <Text style={textStyle} numberOfLines={numberOfLines}>{title}</Text>;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={title}>
      {!loaded && <Text style={textStyle} numberOfLines={numberOfLines}>{title}</Text>}
      <Image
        source={uri}
        contentFit="contain"
        transition={250}
        style={loaded ? { width: size.width, height: size.height } : { position: 'absolute', width: 1, height: 1, opacity: 0 }}
        onLoad={(event) => {
          const aspect = event.source.width / Math.max(event.source.height, 1);
          const width = Math.min(maxWidth, maxHeight * aspect);
          setSize({ uri, width, height: width / aspect });
        }}
        onError={() => setFailed(uri)}
      />
    </View>
  );
}
