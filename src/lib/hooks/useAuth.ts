'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { UserProfile, UserRole } from '@/types';
import { validateCredentials } from '@/lib/auth/credentials';
import { getSession, setSession, clearSession } from '@/lib/auth/session';

interface AuthState {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const router = useRouter();

  const [state, setState] = useState<AuthState>(() => {
    const session = getSession();
    return {
      profile: session?.profile || null,
      loading: false,
      error: null,
    };
  });

  // 로그인
  const login = useCallback(async (loginId: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const account = validateCredentials(loginId, password);
    if (!account) {
      setState(prev => ({ ...prev, loading: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }));
      return false;
    }

    // 운송사 계정이면 company_id 조회
    let companyId: string | undefined;
    let companyName: string | undefined;

    if (account.role === 'transporter' && account.companyName) {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('transport_companies')
          .select('id, name')
          .ilike('name', account.companyName)
          .single();
        if (data) {
          companyId = data.id;
          companyName = data.name;
        }
      } catch {
        // 조회 실패해도 로그인은 진행
      }
    }

    const now = new Date().toISOString();
    const profile: UserProfile = {
      id: `local-${account.loginId.toLowerCase()}`,
      email: `${account.loginId.toLowerCase()}@smarthml.local`,
      name: account.name,
      role: account.role,
      company_id: companyId,
      company_name: companyName,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    setSession({
      profile,
      loginId: account.loginId,
      loginAt: now,
    });

    setState({ profile, loading: false, error: null });
    return true;
  }, []);

  // 로그아웃
  const logout = useCallback(() => {
    clearSession();
    setState({ profile: null, loading: false, error: null });
    router.push('/login');
  }, [router]);

  // 역할 체크
  const hasRole = useCallback((roles: UserRole | UserRole[]): boolean => {
    if (!state.profile) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(state.profile.role);
  }, [state.profile]);

  return useMemo(() => ({
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.profile,
    login,
    logout,
    hasRole,
    isAdmin: state.profile?.role === 'admin',
    isMonitor: state.profile?.role === 'monitor',
    isTransporter: state.profile?.role === 'transporter',
    isField: state.profile?.role === 'field',
  }), [state, login, logout, hasRole]);
}
