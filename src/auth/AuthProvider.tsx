import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { setAPISession } from '@/api/client';
import { giltubeAPI } from '@/api/giltube';
import { environment } from '@/config/environment';
import type { Account, AuthSession } from '@/types/api';

const sessionKey = 'giltube.session.v1';
const guestKey = 'giltube.guest.v1';
const pushTokenKey = 'giltube.push.token.v1';
const pendingVerifierKey = 'giltube.auth.pending-verifier.v1';

let activeSignInCompletion: Promise<void> | null = null;

type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  account: Account | null;
  signIn: () => Promise<boolean>;
  completeSignIn: (code: string, state?: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createVerifier() {
  return `${Crypto.randomUUID().replaceAll('-', '')}${Crypto.randomUUID().replaceAll('-', '')}`;
}

function toBase64URL(value: string) {
  return value.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function challengeFor(verifier: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return toBase64URL(digest);
}

async function persistSession(session: AuthSession | null) {
  if (!session) {
    await SecureStore.deleteItemAsync(sessionKey);
    return;
  }
  await SecureStore.setItemAsync(sessionKey, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [account, setAccount] = useState<Account | null>(null);

  const refreshAccount = useCallback(async () => {
    const profile = await giltubeAPI.account();
    setAccount(profile);
  }, []);

  const completeSignIn = useCallback(async (code: string, state?: string) => {
    if (activeSignInCompletion) return activeSignInCompletion;

    activeSignInCompletion = (async () => {
      const verifier = await SecureStore.getItemAsync(pendingVerifierKey);
      if (!verifier) throw new Error('This sign-in request expired. Please start again.');

      let handoffCode = code;
      if (state) {
        const callback = await giltubeAPI.finishMobileAuthCallback(code, state);
        const redirect = callback.app_redirect_url;
        if (!redirect?.startsWith(`${environment.mobileRedirectURI}?`)) {
          throw new Error('GILid did not return a valid mobile sign-in handoff.');
        }
        handoffCode = new URL(redirect).searchParams.get('code') || '';
      }
      if (!handoffCode) throw new Error('GILid did not return a mobile sign-in code.');

      const session = await giltubeAPI.exchangeMobileAuth(handoffCode, verifier);
      setAPISession(session.session_token);
      await persistSession(session);
      await Promise.all([
        SecureStore.deleteItemAsync(guestKey),
        SecureStore.deleteItemAsync(pendingVerifierKey),
      ]);
      const profile = await giltubeAPI.account();
      setAccount(profile);
      setStatus('signedIn');
    })();

    try {
      await activeSignInCompletion;
    } finally {
      activeSignInCompletion = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(sessionKey);
        if (!raw) {
          const guest = await SecureStore.getItemAsync(guestKey);
          if (active) setStatus(guest === 'true' ? 'guest' : 'signedOut');
          return;
        }
        const saved = JSON.parse(raw) as AuthSession;
        setAPISession(saved.session_token);
        const profile = await giltubeAPI.account();
        if (active) {
          setAccount(profile);
          setStatus('signedIn');
        }
      } catch {
        setAPISession(null);
        await persistSession(null);
        if (active) setStatus('signedOut');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    const verifier = createVerifier();
    const challenge = await challengeFor(verifier);
    await SecureStore.setItemAsync(pendingVerifierKey, verifier, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    let authorize_url: string;
    try {
      ({ authorize_url } = await giltubeAPI.beginMobileAuth(challenge));
    } catch (error) {
      await SecureStore.deleteItemAsync(pendingVerifierKey);
      throw error;
    }
    const result = await WebBrowser.openAuthSessionAsync(authorize_url, environment.mobileRedirectURI);
    if (result.type !== 'success') return false;

    const handoffCode = new URL(result.url).searchParams.get('code');
    if (!handoffCode) throw new Error('GILid did not return a mobile sign-in code.');
    await completeSignIn(handoffCode);
    return true;
  }, [completeSignIn]);

  const continueAsGuest = useCallback(async () => {
    setAPISession(null);
    setAccount(null);
    await persistSession(null);
    await SecureStore.setItemAsync(guestKey, 'true');
    setStatus('guest');
  }, []);

  const signOut = useCallback(async () => {
    try {
      const pushToken = await SecureStore.getItemAsync(pushTokenKey);
      if (pushToken) await giltubeAPI.unregisterMobilePushToken(pushToken);
      await giltubeAPI.logout();
    } catch {
      // Clear the local session even when the network is unavailable.
    }
    setAPISession(null);
    await SecureStore.deleteItemAsync(pushTokenKey);
    await SecureStore.deleteItemAsync(pendingVerifierKey);
    await persistSession(null);
    setAccount(null);
    await SecureStore.setItemAsync(guestKey, 'true');
    setStatus('guest');
  }, []);

  const value = useMemo(
    () => ({ status, account, signIn, completeSignIn, continueAsGuest, signOut, refreshAccount }),
    [status, account, signIn, completeSignIn, continueAsGuest, signOut, refreshAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
