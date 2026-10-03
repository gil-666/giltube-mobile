import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PlaylistLink() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/playlist/[id]', params: { id } }} />;
}
