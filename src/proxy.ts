import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Supabase 세션 쿠키 갱신 + 미인증 사용자 보호(서버측 가드)
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health-check|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
