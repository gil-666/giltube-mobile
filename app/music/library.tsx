import { Redirect } from 'expo-router';

// The website's /music/library (the listening queue) is the Music tab in the app.
export default function MusicLibraryRedirect() {
  return <Redirect href="/music" />;
}
