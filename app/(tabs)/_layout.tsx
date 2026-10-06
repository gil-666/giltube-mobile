import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { useState } from 'react';
import { ColorValue, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { tabBarBottomInset, tabBarHeight } from '@/player/miniPlayerLayout';
import { colors, makeStyles, radii } from '@/theme/tokens';

const icon = (name: keyof typeof Ionicons.glyphMap) => {
  function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  }
  return TabBarIcon;
};

function CreateIcon() {
  const styles = useStyles();
  return <View style={styles.createIcon}><Ionicons name="add" color={colors.onAccent} size={27} /></View>;
}

export default function TabLayout() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { status } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const bottomInset = tabBarBottomInset(insets.bottom);

  const openCreate = () => {
    if (status !== 'signedIn') { router.push('/login'); return; }
    setCreateOpen(true);
  };
  const openLive = () => {
    setCreateOpen(false);
    router.push('/go-live');
  };

  return <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          position: 'absolute',
          height: tabBarHeight(bottomInset),
          paddingTop: 7,
          paddingBottom: bottomInset,
          borderTopColor: colors.border,
          backgroundColor: colors.canvas,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.screen },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="subscriptions" options={{ title: t('Subs'), tabBarIcon: icon('albums') }} />
      <Tabs.Screen name="music" options={{ title: t('Music'), tabBarIcon: icon('musical-notes') }} />
      <Tabs.Screen name="create" listeners={{ tabPress: (event) => { event.preventDefault(); openCreate(); } }} options={{ title: t('Create'), tabBarIcon: CreateIcon, tabBarLabelStyle: styles.createLabel }} />
      <Tabs.Screen name="library" options={{ title: t('Library'), tabBarIcon: icon('play-circle') }} />
      <Tabs.Screen name="profile" options={{ title: t('You'), tabBarIcon: icon('person-circle') }} />
      <Tabs.Screen name="search" options={{ href: null }} />
    </Tabs>
    <SwipeSheet visible={createOpen} title={t('Create')} onClose={() => setCreateOpen(false)}>
      <CreateChoice icon="cloud-upload-outline" title={t('Upload a video')} subtitle={t('Publish from your phone')} onPress={() => { setCreateOpen(false); router.push('/upload'); }} />
      <CreateChoice icon="radio-outline" title={t('Go live')} subtitle={t('Broadcast from your phone')} onPress={openLive} />
    </SwipeSheet>
  </>;
}

function CreateChoice({ icon: iconName, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  const styles = useStyles();
  return <PressableScale onPress={onPress} style={styles.choice}><View style={styles.choiceIcon}><Ionicons name={iconName} color={colors.text} size={23} /></View><View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceSubtitle}>{subtitle}</Text></View><Ionicons name="chevron-forward" color={colors.textDim} size={19} /></PressableScale>;
}

const useStyles = makeStyles(() => ({
  createIcon: { width: 42, height: 42, marginTop: -10, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright, borderWidth: 3, borderColor: colors.canvas, shadowColor: colors.accentBright, shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 7 },
  createLabel: { color: colors.accentBright, fontSize: 10, fontWeight: '900' },
  choice: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  choiceIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  choiceSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
}));
