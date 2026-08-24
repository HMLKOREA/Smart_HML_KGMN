'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { UserProfile, UserRole } from '@/types';
import { getSession, setSession, clearSession } from '@/lib/auth/session';

interface AuthState {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

// loginId(KC, ADMIN…) → Supabase Auth 이메일
const emailFor = (loginId: string) => `${loginId.trim().toLowerCase()}@smarthml.com`;

/** 접속 로그(서버에서 IP 기록) — fire-and-forget */
function postAccessLog(action: 'login' | 'login_fail' | 'logout', info: { login?: string; name?: string | null; role?: string | null }) {
  try {
    fetch('/api/access-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...info }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function useAuth() {
  const router = useRouter();

  // localStorage 캐시는 즉시 렌더용 UI 캐시일 뿐, 실제 권한은 Supabase
  // 세션 쿠키 + DB RLS가 강제한다.
  const [state, setState] = useState<AuthState>(() => {
    const session = getSession();
    return { profile: session?.profile || null, loading: false, error: null };
  });

  // 마운트 시 실제 Supabase 세션으로 검증 — 위조된 캐시는 정리
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        clearSession();
        setState(prev => (prev.profile ? { ...prev, profile: null } : prev));
        return;
      }
      const { data: profile } = await supabase
        .from('user_profiles').select('*').eq('id', user.id).single();
      if (!active) return;
      if (profile) {
        setSession({ profile: profile as UserProfile, loginId: profile.username || '', loginAt: new Date().toISOString() });
        setState({ profile: profile as UserProfile, loading: false, error: null });
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { clearSession(); setState({ profile: null, loading: false, error: null }); }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // 로그인 — Supabase Auth
  const login = useCallback(async (loginId: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const supabase = createClient();

    // 현행 비밀번호는 모두 대문자/숫자 → 레거시 대소문자 무시 로그인 호환
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailFor(loginId),
      password: password.trim().toUpperCase(),
    });
    if (error || !data.user) {
      postAccessLog('login_fail', { login: loginId });
      setState({ profile: null, loading: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      return false;
    }

    const { data: profile, error: pErr } = await supabase
      .from('user_profiles').select('*').eq('id', data.user.id).single();
    if (pErr || !profile) {
      postAccessLog('login_fail', { login: loginId });
      await supabase.auth.signOut();
      setState({ profile: null, loading: false, error: '사용자 프로필을 찾을 수 없습니다.' });
      return false;
    }
    if (profile.is_active === false) {
      postAccessLog('login_fail', { login: profile.username || loginId, name: profile.name, role: profile.role });
      await supabase.auth.signOut();
      setState({ profile: null, loading: false, error: '비활성화된 계정입니다.' });
      return false;
    }

    const now = new Date().toISOString();
    postAccessLog('login', { login: profile.username || loginId, name: profile.name, role: profile.role });
    setSession({ profile: profile as UserProfile, loginId: profile.username || loginId, loginAt: now });
    setState({ profile: profile as UserProfile, loading: false, error: null });
    return true;
  }, []);

  // 로그아웃
  const logout = useCallback(async () => {
    const supabase = createClient();
    const cur = getSession();
    postAccessLog('logout', { login: cur?.loginId, name: cur?.profile?.name, role: cur?.profile?.role });
    await supabase.auth.signOut();
    clearSession();
    setState({ profile: null, loading: false, error: null });
    router.push('/login');
  }, [router]);

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
