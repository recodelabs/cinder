// ABOUTME: React context provider for Better Auth session management.
// ABOUTME: Exposes sign-in/sign-out (Google, plus dev email/password), session state, and user info.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { JSX } from 'react';
import { authClient } from './auth-client';

type SessionReturn = ReturnType<typeof authClient.useSession>;

export interface EmailCredentials {
  readonly email: string;
  readonly password: string;
  /** Only used when creating an account. */
  readonly name?: string;
}

interface AuthContextValue {
  readonly isAuthenticated: boolean;
  readonly userId: string | undefined;
  readonly email: string | undefined;
  readonly signIn: () => void;
  /** Dev-only email/password sign-in; resolves to an error message on failure. */
  readonly signInWithEmail: (credentials: EmailCredentials) => Promise<string | undefined>;
  /** Dev-only email/password account creation; resolves to an error message on failure. */
  readonly signUpWithEmail: (credentials: EmailCredentials) => Promise<string | undefined>;
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

  const signInWithEmail = useCallback(async ({ email, password }: EmailCredentials) => {
    const result = await authClient.signIn.email({ email, password });
    return result.error?.message ?? (result.error ? 'Sign-in failed' : undefined);
  }, []);

  const signUpWithEmail = useCallback(async ({ email, password, name }: EmailCredentials) => {
    const result = await authClient.signUp.email({ email, password, name: name || email });
    return result.error?.message ?? (result.error ? 'Sign-up failed' : undefined);
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
      signInWithEmail,
      signUpWithEmail,
      signOut,
      session,
    }),
    [session, signIn, signInWithEmail, signUpWithEmail, signOut]
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
