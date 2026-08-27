/**
 * POD 저장 정리(보관주기)
 *
 *  GET  /api/pod/cleanup                        → 사용량(총 장수·월별 분포·최고령 월) [관리자]
 *  POST /api/pod/cleanup { beforeMonth:'YYYY-MM' } → 해당 월 이전 증빙 일괄 삭제(수동) [관리자]
 *  POST /api/pod/cleanup { auto:true }          → 자동 정리(월마감+5일 & 2~3개월 보관)
 *        [관리자 세션 또는 Authorization: Bearer <CRON_SECRET>]
 *
 * 정책: 계근수량 등 DB 데이터는 영구 보존, '사진 파일'만 정리.
 *  - 2~3개월 보관: 지지난달(현재월-2) 이전만 삭제 대상(최근 2개월은 항상 보존).
 *  - 월마감 연계: 마감(settlement_closings, confirmed_at)+5일 지난 기간까지만 삭제.
 *  - 백스톱: 마감기록이 없어도 3개월 지난 증빙은 정리(무한 증가 방지).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, authErrorResponse } from '@/lib/auth/serverAuth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const BUCKET = 'shipment-pods';

interface PodJoin { id: string; file_path: string; shipment_id: string; shipments: { shipment_date: string } | null; }

const firstDayMonthsAgo = (n: number): string => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** shipment_date < cutoff(YYYY-MM-DD) 인 증빙 파일·레코드 삭제 */
async function purgeBefore(svc: SupabaseClient, cutoff: string): Promise<{ deleted: number; shipments: number }> {
  const { data } = await svc.from('shipment_pods')
    .select('id, file_path, shipment_id, shipments!inner(shipment_date)')
    .lt('shipments.shipment_date', cutoff) as unknown as { data: PodJoin[] | null };
  const rows = data || [];
  if (rows.length === 0) return { deleted: 0, shipments: 0 };
  const paths = rows.map(r => r.file_path);
  const ids = rows.map(r => r.id);
  const shipIds = [...new Set(rows.map(r => r.shipment_id))];
  for (let i = 0; i < paths.length; i += 100) await svc.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  for (let i = 0; i < ids.length; i += 200) await svc.from('shipment_pods').delete().in('id', ids.slice(i, i + 200));
  for (let i = 0; i < shipIds.length; i += 200) await svc.from('shipments').update({ has_attachment: false }).in('id', shipIds.slice(i, i + 200));
  return { deleted: rows.length, shipments: shipIds.length };
}

export async function GET() {
  try {
    await requireRole(['admin']);
    const svc = await createServiceRoleClient();
    const { data } = await svc.from('shipment_pods')
      .select('id, shipments!inner(shipment_date)') as unknown as { data: { id: string; shipments: { shipment_date: string } | null }[] | null };
    const rows = data || [];
    const byMonth: Record<string, number> = {};
    for (const r of rows) { const m = (r.shipments?.shipment_date || '').slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + 1; }
    const months = Object.keys(byMonth).sort();
    return NextResponse.json({
      success: true, total: rows.length, oldestMonth: months[0] || null,
      byMonth: months.map(m => ({ month: m, count: byMonth[m] })),
      estimateMB: Math.round(rows.length * 0.25 * 10) / 10,
    });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '조회 오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // 인증: 자동(cron)은 Bearer 토큰 허용, 그 외/수동은 관리자 세션
    const auth = request.headers.get('authorization') || '';
    const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
    if (!cronOk) await requireRole(['admin']);

    const svc = await createServiceRoleClient();

    // ── 자동 정리 ──
    if (body.auto === true) {
      const floor2 = firstDayMonthsAgo(2);      // 최근 2개월 보존
      const backstop3 = firstDayMonthsAgo(3);   // 마감기록 없어도 3개월 지나면 정리

      // 마감(+5일 경과)까지의 최대 종료일
      const cutoffTs = new Date(Date.now() - 5 * 86400000).toISOString();
      const { data: closings } = await svc.from('settlement_closings')
        .select('period_to, confirmed_at, status')
        .neq('status', 'revoked').not('confirmed_at', 'is', null)
        .lte('confirmed_at', cutoffTs);
      const closedThrough = (closings || []).reduce<string | null>((mx, c) => {
        const pt = c.period_to as string | null;
        return pt && (!mx || pt > mx) ? pt : mx;
      }, null);

      // 마감기반 컷오프: 마감 종료 다음날과 2개월 floor 중 이른 쪽(=최근 2개월은 보존)
      let cutoff = backstop3;
      if (closedThrough) {
        const ctExcl = new Date(closedThrough + 'T00:00:00'); ctExcl.setDate(ctExcl.getDate() + 1);
        const ctExclStr = `${ctExcl.getFullYear()}-${String(ctExcl.getMonth() + 1).padStart(2, '0')}-${String(ctExcl.getDate()).padStart(2, '0')}`;
        const closedCutoff = ctExclStr < floor2 ? ctExclStr : floor2;
        cutoff = closedCutoff > backstop3 ? closedCutoff : backstop3; // 백스톱과 비교(더 많이 지우는 쪽=더 과거)
      }
      const res = await purgeBefore(svc, cutoff);
      return NextResponse.json({ success: true, mode: 'auto', cutoff, ...res, message: `${cutoff} 이전 증빙 ${res.deleted}장 정리` });
    }

    // ── 수동(월 지정) ──
    const beforeMonth = String(body.beforeMonth || '');
    if (!/^\d{4}-\d{2}$/.test(beforeMonth)) {
      return NextResponse.json({ error: "beforeMonth 형식은 'YYYY-MM' 이어야 합니다." }, { status: 400 });
    }
    const res = await purgeBefore(svc, `${beforeMonth}-01`);
    return NextResponse.json({ success: true, mode: 'manual', ...res, message: `${beforeMonth} 이전 증빙 ${res.deleted}장 정리 완료` });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '정리 오류' }, { status: 500 });
  }
}
