import { Redirect, useLocalSearchParams } from 'expo-router';

// The website opens series and movie details as a panel over their category
// page (/category/series?series_id=...); the app has dedicated screens.
export default function CategoryLink() {
  const { slug = '', series_id: seriesID, movie_id: movieID } = useLocalSearchParams<{ slug: string; series_id?: string; movie_id?: string }>();
  if (slug === 'series') {
    return seriesID ? <Redirect href={{ pathname: '/series/[id]', params: { id: seriesID } }} /> : <Redirect href="/series" />;
  }
  if (slug === 'movies') {
    return movieID ? <Redirect href={{ pathname: '/movies/[id]', params: { id: movieID } }} /> : <Redirect href="/movies" />;
  }
  return <Redirect href={{ pathname: '/(tabs)/search', params: { q: slug.replaceAll('-', ' ') } }} />;
}
