import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(_request: NextRequest) {
  // 인증은 클라이언트 localStorage 기반 — 서버 미들웨어 패스스루
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health-check|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
