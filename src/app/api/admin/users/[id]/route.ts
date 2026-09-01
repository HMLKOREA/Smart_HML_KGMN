import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthProfile, authErrorResponse } from '@/lib/auth/serverAuth';
import type { UserRole } from '@/types';

export const runtime = 'nodejs';

const emailFor = (loginId: string) => `${loginId.trim().toLowerCase()}@smarthml.com`;
const normPw = (pw: string) => pw.trim().toUpperCase();

const roleFromCategory = (category: string): UserRole => {
  if (category === '관리자') return 'admin';
  if (category === '모니터링') return 'monitor';
  if (category === '관리자, 제한') return 'field';
  return 'transporter';
};

// ── 수정 (관리자: 전체 / 본인: 연락처·비밀번호만) ──
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await getAuthProfile();
    const { id } = await ctx.params;
    const isAdmin = me.role === 'admin';
    const isSelf = me.id === id;
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const svc = await createServiceRoleClient();
    const body = await request.json();
    const { name, loginId, password, category, permission, email, phone, company_id, is_active, is_kiosk } = body;

    const update: Record<string, unknown> = {};

    if (isAdmin) {
      if (name != null) update.name = name;
      if (category != null) {
        update.role = roleFromCategory(category);
        update.role_label = permission || category;
        if (update.role !== 'transporter') update.company_id = null;
      }
      if (permission != null && update.role_label == null) update.role_label = permission;
      if (email != null) update.email = email;
      if (company_id !== undefined && (update.role ?? me.role) === 'transporter') update.company_id = company_id || null;
      if (typeof is_active === 'boolean') update.is_active = is_active;
      if (typeof is_kiosk === 'boolean') update.is_kiosk = is_kiosk;

      // ID(username/이메일) 변경 — Auth 이메일도 함께 갱신
      if (loginId != null && loginId.trim()) {
        const uname = loginId.trim().toUpperCase();
        const { data: dup } = await svc.from('user_profiles').select('id').eq('username', uname).neq('id', id).maybeSingle();
        if (dup) return NextResponse.json({ success: false, error: `이미 존재하는 ID입니다: ${loginId}` }, { status: 409 });
        update.username = uname;
        update.email = emailFor(loginId);
        const { error: eErr } = await svc.auth.admin.updateUserById(id, { email: emailFor(loginId) });
        if (eErr) return NextResponse.json({ success: false, error: `ID 변경 실패: ${eErr.message}` }, { status: 500 });
      }
    }

    // 연락처는 본인도 수정 가능
    if (phone !== undefined) update.phone = phone || null;

    // 비밀번호 변경 (값이 있을 때만) — 관리자 또는 본인
    if (password && password.trim()) {
      const { error: pwErr } = await svc.auth.admin.updateUserById(id, { password: normPw(password) });
      if (pwErr) return NextResponse.json({ success: false, error: `비밀번호 변경 실패: ${pwErr.message}` }, { status: 500 });
      update.password = normPw(password);
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      const { error: uErr } = await svc.from('user_profiles').update(update).eq('id', id);
      if (uErr) return NextResponse.json({ success: false, error: `수정 실패: ${uErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
