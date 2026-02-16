// ABOUTME: React context provider for Google OAuth2 authentication state.
// ABOUTME: Exposes sign-in/sign-out and access token to child components.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { JSX } from 'react';
import { clearStoreConfig } from '../config/StoreConfig';
import { TokenStore, type TokenResponse } from './google-auth';

interface AuthContextValue {
  isAuthenticated: boolean;
  accessToken: string | undefined;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const tokenStore = new TokenStore();

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform';

interface AuthProviderProps {
  readonly children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [authenticated, setAuthenticated] = useState(tokenStore.isAuthenticated());

  const handleTokenResponse = useCallback((response: TokenResponse) => {
    tokenStore.setToken(response);
    setAuthenticated(true);
  }, []);

  const signIn = useCallback(() => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      console.error('Google Identity Services not loaded');
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: handleTokenResponse,
    });
    client.requestAccessToken();
  }, [handleTokenResponse]);

  const signOut = useCallback(() => {
    const token = tokenStore.getAccessToken();
    if (token) {
      const google = (window as any).google;
      google?.accounts?.oauth2?.revoke?.(token);
    }
    tokenStore.clear();
    clearStoreConfig();
    setAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: authenticated,
      accessToken: tokenStore.getAccessToken(),
      signIn,
      signOut,
    }),
    [authenticated, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
