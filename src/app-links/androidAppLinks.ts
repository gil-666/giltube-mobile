import { NativeModules, Platform } from 'react-native';

export type AppLinkApprovalState = 'approved' | 'unapproved' | 'unknown' | 'unsupported';

interface GilTubeAppLinksModule {
  getDomainApprovalState: () => Promise<AppLinkApprovalState>;
  openDomainSettings: () => Promise<void>;
}

const nativeModule = NativeModules.GilTubeAppLinks as GilTubeAppLinksModule | undefined;

export async function getAppLinkApprovalState(): Promise<AppLinkApprovalState> {
  if (Platform.OS !== 'android' || !nativeModule) return 'unsupported';
  return nativeModule.getDomainApprovalState();
}

export async function openAppLinkSettings() {
  if (Platform.OS !== 'android' || !nativeModule) return;
  await nativeModule.openDomainSettings();
}
