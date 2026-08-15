import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthProfile, authErrorResponse } from '@/lib/auth/serverAuth';

export const runtime = 'nodejs';

// ── 정산 확정 취소 (관리자 전용, 소프트 취소) ──
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await getAuthProfile();
    if (me.role !== 'admin') {
      return NextResponse.json({ success: false, error: '관리자만 취소할 수 있습니다.' }, { status: 403 });
    }
    const { id } = await ctx.params;
    const svc = await createServiceRoleClient();
    const { error } = await svc.from('settlement_closings').update({ status: 'revoked' }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
