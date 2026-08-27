/**
 * POD 저장 정리(보관주기) — 관리자 전용
 *
 *  GET  /api/pod/cleanup            → 증빙 사용량(총 장수 · 월별 분포 · 최고령 월)
 *  POST /api/pod/cleanup  { beforeMonth: 'YYYY-MM' }
 *       → 해당 월 '이전'(< YYYY-MM-01) 출하 건의 증빙 사진을 일괄 삭제(월마감 정리용).
 *         계근수량 등 DB 데이터는 그대로 두고 '사진 파일'만 정리한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, authErrorResponse } from '@/lib/auth/serverAuth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const BUCKET = 'shipment-pods';

interface PodJoin { id: string; file_path: string; shipment_id: string; shipments: { shipment_date: string } | null; }

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
      success: true,
      total: rows.length,
      oldestMonth: months[0] || null,
      byMonth: months.map(m => ({ month: m, count: byMonth[m] })),
      estimateMB: Math.round(rows.length * 0.25 * 10) / 10, // 평균 250KB 가정
    });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '조회 오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin']);
    const { beforeMonth } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(String(beforeMonth || ''))) {
      return NextResponse.json({ error: "beforeMonth 형식은 'YYYY-MM' 이어야 합니다." }, { status: 400 });
    }
    const cutoff = `${beforeMonth}-01`;
    const svc = await createServiceRoleClient();

    const { data } = await svc.from('shipment_pods')
      .select('id, file_path, shipment_id, shipments!inner(shipment_date)')
      .lt('shipments.shipment_date', cutoff) as unknown as { data: PodJoin[] | null };
    const rows = data || [];
    if (rows.length === 0) return NextResponse.json({ success: true, deleted: 0, message: `${beforeMonth} 이전 증빙이 없습니다.` });

    const paths = rows.map(r => r.file_path);
    const ids = rows.map(r => r.id);
    const shipIds = [...new Set(rows.map(r => r.shipment_id))];

    // 스토리지 파일 삭제(배치)
    for (let i = 0; i < paths.length; i += 100) await svc.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    // 레코드 삭제
    for (let i = 0; i < ids.length; i += 200) await svc.from('shipment_pods').delete().in('id', ids.slice(i, i + 200));
    // 해당 출하건 증빙 플래그 해제
    for (let i = 0; i < shipIds.length; i += 200) await svc.from('shipments').update({ has_attachment: false }).in('id', shipIds.slice(i, i + 200));

    return NextResponse.json({ success: true, deleted: rows.length, shipments: shipIds.length, message: `${beforeMonth} 이전 증빙 ${rows.length}장 정리 완료` });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '정리 오류' }, { status: 500 });
  }
}
