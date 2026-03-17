// ABOUTME: React context provider for Better Auth session management.
// ABOUTME: Exposes sign-in/sign-out, session state, and user info to child components.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { JSX } from 'react';
import { authClient } from './auth-client';

type SessionReturn = ReturnType<typeof authClient.useSession>;

interface AuthContextValue {
  readonly isAuthenticated: boolean;
  readonly userId: string | undefined;
  readonly email: string | undefined;
  readonly signIn: () => void;
  readonly signOut: () => void;
  readonly session: SessionReturn;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  readonly children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const session = authClient.useSession();

  const signIn = useCallback(() => {
    authClient.signIn.social({ provider: 'google' });
  }, []);

  const signOut = useCallback(() => {
    authClient.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!session.data?.user,
      userId: session.data?.user?.id,
      email: session.data?.user?.email,
      signIn,
      signOut,
      session,
    }),
    [session, signIn, signOut]
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
