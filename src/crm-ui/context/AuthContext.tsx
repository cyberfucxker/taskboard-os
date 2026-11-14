'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../services/apiClient';

/**
 * TaskBoard host shim for the legacy CRM's AuthContext. Sign-in is TaskBoard's NextAuth session, so there
 * is no login flow here — just who the CRM user is, from `GET /api/crm/me` (or seeded from
 * the server page's props so the first render already knows).
 */
export interface CrmSession {
  id: string;
  name: string;
  role: string;
  departmentSlug?: string | null;
  isFullAccess: boolean;
  canManage: boolean;
  canAdmin: boolean;
  /** Leadership only — revenue figures in reports. */
  canSeeRevenue?: boolean;
}

interface AuthContextValue {
  session: CrmSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Re-reads `/api/crm/me`. */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, initialSession }: { children: ReactNode; initialSession?: CrmSession | null }) {
  const [session, setSession] = useState<CrmSession | null>(initialSession ?? null);
  const [isLoading, setIsLoading] = useState(!initialSession);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      setSession(await api.get<CrmSession>('/me'));
    } catch {
      // Keep whatever the page seeded; a 401 already redirects to /login.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: !!session, isLoading, refreshSession }),
    [session, isLoading, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
