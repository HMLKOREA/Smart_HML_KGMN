import type { UserProfile } from '@/types';

const SESSION_KEY = 'auth_session';

export interface AuthSession {
  profile: UserProfile;
  loginId: string;
  loginAt: string;
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
  // 레거시 데모 모드 키 정리
  localStorage.removeItem('demo_user');
}
