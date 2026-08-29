/**
 * 출하증 대기화면: 사전에 기사 미지정된 배차에, 현장에서 기사 인적사항을 입력하고 발급.
 * POST /api/shipment/adhoc-driver  { shipmentId, vehicle, name, phone }
 *  - 차량번호로 기사 매칭(있으면 이름/연락처 갱신, 없으면 신규 생성)
 *  - 해당 배차(shipment)에 driver_id·vehicle_number 저장
 *  - 발급 내용이 기록에 남도록 함
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthProfile, authErrorResponse } from '@/lib/auth/serverAuth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const STAFF = ['admin', 'monitor', 'field'];

export async function POST(request: NextRequest) {
  try {
    const profile = await getAuthProfile();
    if (!STAFF.includes(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    const { shipmentId, vehicle, name, phone } = await request.json();
    const veh = String(vehicle || '').trim();
    const nm = String(name || '').trim();
    const ph = String(phone || '').trim();
    if (!shipmentId) return NextResponse.json({ error: '배차 정보가 없습니다.' }, { status: 400 });
    if (!veh || !nm) return NextResponse.json({ error: '차량번호와 기사이름은 필수입니다.' }, { status: 400 });

    const svc = await createServiceRoleClient();
    const { data: ship } = await svc.from('shipments').select('id, company_id').eq('id', shipmentId).single();
    if (!ship) return NextResponse.json({ error: '배차를 찾을 수 없습니다.' }, { status: 404 });

    // 차량번호로 기존 기사 매칭
    const { data: ex } = await svc.from('drivers').select('id').eq('vehicle_number', veh).limit(1).maybeSingle();
    let driverId: string;
    if (ex?.id) {
      driverId = ex.id;
      await svc.from('drivers').update({ name: nm, phone: ph || null, updated_at: new Date().toISOString() }).eq('id', ex.id);
    } else {
      const { data: created, error: cErr } = await svc.from('drivers')
        .insert({ name: nm, phone: ph || null, vehicle_number: veh, company_id: ship.company_id, is_active: true })
        .select('id').single();
      if (cErr || !created) return NextResponse.json({ error: `기사 등록 실패: ${cErr?.message || ''}` }, { status: 500 });
      driverId = created.id;
    }

    // 배차에 연결
    const { error: uErr } = await svc.from('shipments')
      .update({ driver_id: driverId, vehicle_number: veh, updated_by: profile.name || '' }).eq('id', shipmentId);
    if (uErr) return NextResponse.json({ error: `배차 저장 실패: ${uErr.message}` }, { status: 500 });

    return NextResponse.json({ success: true, driver_id: driverId, driver_name: nm, driver_phone: ph, vehicle_number: veh });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '처리 오류' }, { status: 500 });
  }
}
