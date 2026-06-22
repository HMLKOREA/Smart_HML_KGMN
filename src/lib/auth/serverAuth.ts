import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserProfile, UserRole } from '@/types';

/**
 * 서버측 인증/인가 헬퍼.
 *
 * 클라이언트가 보낸 값(localStorage 등)을 신뢰하지 않고, Supabase Auth
 * 세션 쿠키에서 검증된 사용자(auth.uid())를 확인한 뒤 user_profiles에서
 * 역할을 조회한다. API 라우트의 진입점에서 호출한다.
 */

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** 인증된 사용자 프로필 반환. 미인증/비활성 시 AuthError(401). */
export async function getAuthProfile(): Promise<UserProfile> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AuthError(401, '로그인이 필요합니다.');
  }
  const { data: profile, error: pErr } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (pErr || !profile) {
    throw new AuthError(401, '사용자 프로필을 찾을 수 없습니다.');
  }
  if (profile.is_active === false) {
    throw new AuthError(403, '비활성화된 계정입니다.');
  }
  return profile as UserProfile;
}

/** 허용 역할 검증. 미인증 401 / 권한부족 403. */
export async function requireRole(allowed: UserRole[]): Promise<UserProfile> {
  const profile = await getAuthProfile();
  if (!allowed.includes(profile.role)) {
    throw new AuthError(403, '접근 권한이 없습니다.');
  }
  return profile;
}

/** AuthError를 JSON 응답으로 변환 (그 외 에러는 그대로 던짐). */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  return null;
}
