import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import { useActiveChannel } from '@/channels/ChannelProvider';
import { PressableScale } from '@/components/PressableScale';
import { SwipeSheet } from '@/components/SwipeSheet';
import { useI18n } from '@/i18n';
import { colors, makeStyles, radii } from '@/theme/tokens';
import { resolveMediaURL } from '@/utils/media';
import { openGilTubeWeb } from '@/utils/web';
import { useState } from 'react';

export default function ProfileScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets(); const { account, status, signOut } = useAuth(); const guest = status !== 'signedIn'; const { channels, activeChannel, switchChannel } = useActiveChannel(); const [channelOpen, setChannelOpen] = useState(false);
  const { t } = useI18n();
  const web = (path: string) => void openGilTubeWeb(path).catch((error) => Alert.alert(t('Could not open GilTube web'), error instanceof Error ? error.message : t('Please try again.')));
  const unread = useQuery({ queryKey: ['notification-count'], queryFn: giltubeAPI.unreadNotifications, enabled: !guest, refetchInterval: 60_000 });
  const initial = (activeChannel?.name || account?.username || 'G').charAt(0).toUpperCase();
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 110 }}>
    <Text style={styles.heading}>{t('You')}</Text>
    <View style={styles.profileCard}>{!guest && activeChannel?.avatar_url ? <Image source={resolveMediaURL(activeChannel.avatar_url)} style={styles.avatarImage} contentFit="cover" /> : <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>}<View style={styles.details}><Text style={styles.username}>{guest ? t('Guest') : activeChannel?.name || t('Choose a channel')}</Text><Text numberOfLines={1} style={styles.email}>{guest ? t('Browsing without an account') : `@${account?.gilid_username || account?.username}`}</Text></View></View>
    {guest ? <><Text style={styles.guestNote}>{t('Sign in only when you want synced history, comments, subscriptions, notifications, or playlists.')}</Text><PressableScale onPress={() => router.push('/login')} style={styles.signIn}><Text style={styles.signInText}>{t('Sign in with GILid')}</Text></PressableScale></> : <>
      <Text style={styles.section}>{t('YOUR GILTUBE')}</Text>
      <Menu icon="swap-horizontal-outline" label={t('Switch channel')} onPress={() => setChannelOpen(true)} />
      <Menu icon="notifications-outline" label={t('Notifications')} badge={unread.data?.unread_count} onPress={() => router.push('/notifications')} />
      <Menu icon="options-outline" label={t('Notification preferences')} onPress={() => router.push('/notification-settings')} />
      <Menu icon="people-circle-outline" label={t('Watch parties')} onPress={() => router.push('/watch-parties')} />
      <Menu icon="list-outline" label={t('Playlists and downloads')} onPress={() => router.push('/(tabs)/library')} />
      <Menu icon="albums-outline" label={t('Subscriptions')} onPress={() => router.push('/(tabs)/subscriptions')} />
      <Text style={styles.section}>{t('CREATE & MANAGE')}</Text>
      <Menu icon="cloud-upload-outline" label={t('Upload a video')} onPress={() => router.push('/upload')} />
      <Menu icon="radio-outline" label={t('Go live')} onPress={() => router.push('/go-live')} />
      <Menu icon="people-outline" label={t('Create and manage channels')} onPress={() => router.push('/channels/manage')} />
      <Menu icon="speedometer-outline" label={t('Creator dashboard')} onPress={() => router.push('/dashboard')} />
      {account?.user_type === 'admin' && <Menu icon="shield-checkmark-outline" label={t('Admin console')} onPress={() => router.push('/admin')} />}
      <Text style={styles.section}>{t('EXPLORE')}</Text>
      <Menu icon="musical-notes-outline" label={t('GilTube Music')} onPress={() => web('/music')} />
      <Menu icon="film-outline" label={t('Movies')} onPress={() => router.push('/movies')} />
      <Menu icon="tv-outline" label={t('Series')} onPress={() => router.push('/series')} />
      <Menu icon="person-outline" label={t('Account settings')} onPress={() => web('/account-settings')} />
      <Menu icon="color-palette-outline" label={t('Themes')} onPress={() => router.push('/themes')} />
      <Menu icon="settings-outline" label={t('App settings')} onPress={() => router.push('/settings')} />
      <PressableScale onPress={() => void signOut()} style={styles.logout}><Text style={styles.logoutText}>{t('Sign out')}</Text></PressableScale>
    </>}
    <Text style={styles.version}>GilTube {DeviceInfo.getVersion()} ({DeviceInfo.getBuildNumber()})</Text>
    <SwipeSheet visible={channelOpen} title={t('Switch channel')} onClose={() => setChannelOpen(false)}>{channels.map((channel) => <PressableScale key={channel.id} onPress={() => { void switchChannel(channel.id).then(() => setChannelOpen(false)).catch((error) => Alert.alert(t('Could not switch channel'), error.message)); }} style={styles.channelChoice}><Image source={resolveMediaURL(channel.avatar_url || '')} style={styles.channelAvatar} contentFit="cover" /><View style={{ flex: 1 }}><Text style={styles.channelChoiceName}>{channel.name}</Text></View>{channel.id === activeChannel?.id && <Ionicons name="checkmark-circle" color={colors.gilid} size={22} />}</PressableScale>)}</SwipeSheet>
  </ScrollView>;
}

function Menu({ icon, label, badge, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; badge?: number; onPress: () => void }) { const styles = useStyles(); return <PressableScale onPress={onPress} style={styles.menu}><View style={styles.menuIcon}><Ionicons name={icon} size={21} color={colors.text} /></View><Text style={styles.menuLabel}>{label}</Text>{!!badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}<Ionicons name="chevron-forward" size={18} color={colors.textDim} /></PressableScale>; }

const useStyles = makeStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.screen, paddingHorizontal: 18 }, heading: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.2 }, profileCard: { flexDirection: 'row', alignItems: 'center', marginTop: 24, padding: 18, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, avatarImage: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceStrong }, avatarText: { color: colors.onAccent, fontSize: 22, fontWeight: '900' }, details: { flex: 1, marginLeft: 14 }, username: { color: colors.text, fontSize: 17, fontWeight: '800' }, email: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, guestNote: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 22 }, signIn: { marginTop: 18, height: 52, borderRadius: radii.lg, backgroundColor: colors.gilid, alignItems: 'center', justifyContent: 'center' }, signInText: { color: colors.black, fontSize: 15, fontWeight: '900' }, section: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 28, marginBottom: 8 }, menu: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, menuIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, menuLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700', marginLeft: 13 }, badge: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBright, marginRight: 7 }, badgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '900' }, logout: { marginTop: 28, height: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }, logoutText: { color: colors.accentBright, fontSize: 15, fontWeight: '800' }, version: { color: colors.textDim, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 28 }, channelChoice: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, channelAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceStrong }, channelChoiceName: { color: colors.text, fontSize: 14, fontWeight: '800' },
}));
