import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireRole, authErrorResponse } from '@/lib/auth/serverAuth';
import type { UserRole } from '@/types';

export const runtime = 'nodejs';

const emailFor = (loginId: string) => `${loginId.trim().toLowerCase()}@smarthml.com`;
const normPw = (pw: string) => pw.trim().toUpperCase(); // 레거시 규칙: 대문자 저장

const roleFromCategory = (category: string): UserRole => {
  if (category === '관리자') return 'admin';
  if (category === '모니터링') return 'monitor';
  if (category === '관리자, 제한') return 'field';
  return 'transporter';
};

// ── 목록 (관리자 전용) ──
export async function GET() {
  try {
    await requireRole(['admin']);
    const svc = await createServiceRoleClient();

    const { data: users, error } = await svc
      .from('user_profiles')
      .select('id, username, name, role, role_label, company_id, email, phone, password, is_active, department')
      .order('role')
      .order('username');
    if (error) throw error;

    const { data: companies } = await svc
      .from('transport_companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    return NextResponse.json({ success: true, users: users || [], companies: companies || [] });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}

// ── 신규 등록 (관리자 전용) ──
export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin']);
    const svc = await createServiceRoleClient();
    const body = await request.json();
    const { name, loginId, password, category, permission, email, phone, company_id } = body;

    if (!name || !loginId || !password) {
      return NextResponse.json({ success: false, error: '이름·ID·비밀번호는 필수입니다.' }, { status: 400 });
    }
    const role = roleFromCategory(category);
    const authEmail = emailFor(loginId);

    // 중복 ID 방지
    const { data: dup } = await svc.from('user_profiles').select('id').eq('username', loginId.trim().toUpperCase()).maybeSingle();
    if (dup) return NextResponse.json({ success: false, error: `이미 존재하는 ID입니다: ${loginId}` }, { status: 409 });

    // Supabase Auth 계정 생성
    const { data: authData, error: authErr } = await svc.auth.admin.createUser({
      email: authEmail,
      password: normPw(password),
      email_confirm: true,
    });
    if (authErr || !authData.user) {
      return NextResponse.json({ success: false, error: `계정 생성 실패: ${authErr?.message || '알수없음'}` }, { status: 500 });
    }

    const { error: pErr } = await svc.from('user_profiles').insert({
      id: authData.user.id,
      username: loginId.trim().toUpperCase(),
      name,
      role,
      role_label: permission || category || null,
      email: email || authEmail,
      phone: phone || null,
      password: normPw(password), // 표시용(레거시 호환)
      company_id: role === 'transporter' ? (company_id || null) : null,
      is_active: true,
    });
    if (pErr) {
      await svc.auth.admin.deleteUser(authData.user.id); // 롤백
      return NextResponse.json({ success: false, error: `프로필 생성 실패: ${pErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: authData.user.id });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
