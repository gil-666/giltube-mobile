import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

const WEB_ORIGIN = 'https://giltube.gilservers.com';

export async function openGilTubeWeb(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let browserPackage: string | undefined;

  if (Platform.OS === 'android') {
    const browsers = await WebBrowser.getCustomTabsSupportingBrowsersAsync();
    browserPackage = browsers.preferredBrowserPackage
      || browsers.defaultBrowserPackage
      || browsers.browserPackages[0];
  }

  return WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${normalizedPath}`, {
    browserPackage,
    toolbarColor: '#09090b',
    secondaryToolbarColor: '#18181b',
    showTitle: true,
    enableBarCollapsing: true,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}
