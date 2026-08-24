/**
 * 접속 로그 API — 로그인/로그아웃/로그인 실패를 IP·UserAgent와 함께 기록.
 * 클라이언트(useAuth)가 호출하며, 서버에서 접속 IP를 추출해 저장한다.
 * (브라우저는 자기 공인 IP를 알 수 없어 서버단 기록이 필요.)
 *
 * POST /api/access-log
 * Body: { action: 'login' | 'login_fail' | 'logout', login?, name?, role? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Vercel/프록시 환경에서 실제 클라이언트 IP 추출 */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '';
}

const ALLOWED = new Set(['login', 'login_fail', 'logout']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ success: false, error: 'invalid action' }, { status: 400 });
    }
    const sb = sbAdmin();
    if (!sb) return NextResponse.json({ success: false, error: 'not configured' }, { status: 200 });

    await sb.from('app_activity_logs').insert({
      module: 'auth',
      action,
      user_login: body.login ?? null,
      user_name: body.name ?? null,
      role: body.role ?? null,
      target_label: action === 'login' ? '로그인' : action === 'logout' ? '로그아웃' : '로그인 실패',
      ip: clientIp(req) || null,
      user_agent: req.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true });
  } catch {
    // 접속 로그 실패가 로그인/로그아웃 자체를 막지 않도록 200으로 흡수
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
