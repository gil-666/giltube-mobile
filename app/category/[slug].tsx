import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CategoryLink() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={{ pathname: '/(tabs)/search', params: { q: slug.replaceAll('-', ' ') } }} />;
}
