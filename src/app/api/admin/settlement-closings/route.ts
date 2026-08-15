import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthProfile, requireRole, authErrorResponse } from '@/lib/auth/serverAuth';

export const runtime = 'nodejs';

// ── 정산 확정 이력 목록 (staff 조회) ──
export async function GET() {
  try {
    await requireRole(['admin', 'monitor', 'field']);
    const svc = await createServiceRoleClient();
    const { data, error } = await svc
      .from('settlement_closings')
      .select('*')
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ success: true, closings: data || [] });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}

// ── 정산 확정 (관리자 전용, 스냅샷 저장) ──
export async function POST(request: NextRequest) {
  try {
    const me = await getAuthProfile();
    if (me.role !== 'admin') {
      return NextResponse.json({ success: false, error: '정산 확정은 관리자만 가능합니다.' }, { status: 403 });
    }
    const svc = await createServiceRoleClient();
    const b = await request.json();

    if (!b.period_type || !b.period_label || !b.period_from || !b.period_to) {
      return NextResponse.json({ success: false, error: '기간 정보가 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await svc.from('settlement_closings').insert({
      period_type: b.period_type,
      period_label: b.period_label,
      period_from: b.period_from,
      period_to: b.period_to,
      scope_company: b.scope_company || null,
      row_count: Math.round(b.row_count || 0),
      total_weight: b.total_weight || 0,
      total_fee: Math.round(b.total_fee || 0),
      total_tax: Math.round(b.total_tax || 0),
      total_all: Math.round(b.total_all || 0),
      memo: b.memo || null,
      status: 'confirmed',
      confirmed_by: me.id,
      confirmed_by_name: me.name,
    }).select('id').single();
    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
