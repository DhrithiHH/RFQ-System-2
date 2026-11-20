import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, getStoredToken, setStoredToken } from '../services/api';
import type { DemoAccount, UserProfile, UserRole } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  demoAccounts: DemoAccount[];
  loading: boolean;
  signIn: (email: string) => Promise<UserProfile>;
  signUp: (name: string, email: string, role: UserRole) => Promise<UserProfile>;
  switchDemoAccount: (email: string) => Promise<UserProfile>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const accounts = await authApi.demoAccounts();
        if (active) setDemoAccounts(accounts);

        const existingToken = getStoredToken();
        if (existingToken) {
          try {
            const me = await authApi.me();
            if (active) setUser(me);
            return;
          } catch {
            setStoredToken(null);
          }
        }

        // Default to the seeded Buyer account on first load for immediate hands-on access
        const defaultBuyer = accounts.find((a) => a.role === 'BUYER');
        if (defaultBuyer) {
          const session = await authApi.createSession({ email: defaultBuyer.email, mode: 'login' });
          setStoredToken(session.access_token);
          if (active) setUser(session.user);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string) => {
    const res = await authApi.createSession({ email, mode: 'login' });
    setStoredToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const signUp = useCallback(async (name: string, email: string, role: UserRole) => {
    const res = await authApi.createSession({ name, email, role, mode: 'signup' });
    setStoredToken(res.access_token);
    setUser(res.user);
    const updated = await authApi.demoAccounts();
    setDemoAccounts(updated);
    return res.user;
  }, []);

  const switchDemoAccount = useCallback(async (email: string) => {
    const res = await authApi.createSession({ email, mode: 'login' });
    setStoredToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const signOut = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, demoAccounts, loading, signIn, signUp, switchDemoAccount, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
