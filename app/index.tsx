import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { colors, makeStyles } from '@/theme/tokens';

export default function Index() {
  const styles = useStyles();
  const { status } = useAuth();
  if (status === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={colors.accentBright} /></View>;
  }
  return <Redirect href={status === 'signedIn' || status === 'guest' ? '/(tabs)' : '/login'} />;
}

const useStyles = makeStyles(() => ({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.screen } }));
