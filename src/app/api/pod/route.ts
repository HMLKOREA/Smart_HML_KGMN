/**
 * POD(증빙) 업로드/조회/삭제 API
 *
 * 운송사가 배차 건에 출하증·계근증 사진을 올리고 계근수량을 확정한다.
 * 저장: 비공개 버킷 'shipment-pods' (서비스롤로만 접근) + shipment_pods 테이블.
 *
 *  POST   /api/pod        multipart: shipmentId, weight?, files[]  → 사진 업로드 + (허용 시)계근확정
 *  GET    /api/pod?shipmentId=...   → 해당 배차 증빙 목록(서명 URL)
 *  DELETE /api/pod?id=...           → 증빙 1건 삭제(마감 전 · 본인회사/스태프)
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthProfile, authErrorResponse } from '@/lib/auth/serverAuth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isWeightLocked, weightLockDeadline } from '@/lib/podLock';

export const runtime = 'nodejs';

const BUCKET = 'shipment-pods';
const STAFF = ['admin', 'monitor', 'field'];

/** 계근수량 잠금 여부: 출하확정과 무관하게 출하일 +1 영업일(주말 건너뜀)까지 허용, 그 이후 잠금.
 *  (관리자는 호출측에서 별도 우회) */
function isLocked(s: { is_shipped: boolean | null; shipment_date: string }): boolean {
  return isWeightLocked(s.shipment_date);
}

function extOf(name: string, type: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  if (m) return m[1].toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

// ── 업로드 + 계근 확정 ──
export async function POST(request: NextRequest) {
  try {
    const profile = await getAuthProfile();
    const isStaff = STAFF.includes(profile.role);
    const svc = await createServiceRoleClient();

    const form = await request.formData();
    const shipmentId = String(form.get('shipmentId') || '');
    const weightRaw = form.get('weight');
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    if (!shipmentId) return NextResponse.json({ error: '배차 정보가 없습니다.' }, { status: 400 });
    if (files.length === 0 && weightRaw == null) return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });

    // 대상 배차 조회 + 권한
    const { data: ship, error: sErr } = await svc
      .from('shipments')
      .select('id, company_id, is_shipped, shipment_date, weight_net')
      .eq('id', shipmentId).single();
    if (sErr || !ship) return NextResponse.json({ error: '배차를 찾을 수 없습니다.' }, { status: 404 });
    if (!isStaff) {
      if (profile.role !== 'transporter' || !profile.company_id || ship.company_id !== profile.company_id) {
        return NextResponse.json({ error: '이 배차의 증빙을 올릴 권한이 없습니다.' }, { status: 403 });
      }
    }

    // 계근 잠금 검사 (마감/확정 후엔 관리자만 계근 변경)
    const locked = isLocked(ship);
    const wantWeight = weightRaw != null && String(weightRaw).trim() !== '';
    const weight = wantWeight ? parseFloat(String(weightRaw)) : null;
    const weightChanges = wantWeight && weight !== Number(ship.weight_net);
    const canEditWeight = profile.role === 'admin' || !locked;
    if (weightChanges && !canEditWeight) {
      return NextResponse.json({ error: `계근수량 입력 마감(${weightLockDeadline(ship.shipment_date)})이 지났습니다. 이후에는 관리자만 수정할 수 있습니다.` }, { status: 403 });
    }

    // 파일 업로드
    const uploaded: { id: string; file_path: string }[] = [];
    for (const f of files) {
      const ext = extOf(f.name, f.type);
      const path = `${shipmentId}/${crypto.randomUUID()}.${ext}`;
      const buf = Buffer.from(await f.arrayBuffer());
      const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
        contentType: f.type || 'image/jpeg', upsert: false,
      });
      if (upErr) return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });
      const { data: row } = await svc.from('shipment_pods').insert({
        shipment_id: shipmentId, company_id: ship.company_id, file_path: path,
        content_type: f.type || null, uploaded_by: profile.name || '',
      }).select('id, file_path').single();
      if (row) uploaded.push(row);
    }

    // shipments 갱신: 증빙 플래그 + (허용 시)계근수량
    const patch: Record<string, unknown> = { has_attachment: true, updated_by: profile.name || '' };
    if (weightChanges && canEditWeight) patch.weight_net = weight;
    await svc.from('shipments').update(patch).eq('id', shipmentId);

    return NextResponse.json({ success: true, uploaded: uploaded.length, weightSaved: !!(weightChanges && canEditWeight) });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '증빙 처리 오류' }, { status: 500 });
  }
}

// ── 목록(서명 URL) ──
export async function GET(request: NextRequest) {
  try {
    const profile = await getAuthProfile();
    const isStaff = STAFF.includes(profile.role);
    const shipmentId = request.nextUrl.searchParams.get('shipmentId') || '';
    if (!shipmentId) return NextResponse.json({ error: '배차 정보가 없습니다.' }, { status: 400 });
    const svc = await createServiceRoleClient();

    const { data: ship } = await svc.from('shipments').select('company_id').eq('id', shipmentId).single();
    if (!isStaff && (!profile.company_id || ship?.company_id !== profile.company_id)) {
      return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 });
    }

    const { data: pods } = await svc.from('shipment_pods')
      .select('id, file_path, content_type, uploaded_by, created_at')
      .eq('shipment_id', shipmentId).order('created_at', { ascending: true });

    const items = [] as { id: string; url: string; uploaded_by: string; created_at: string }[];
    for (const p of pods || []) {
      const { data: signed } = await svc.storage.from(BUCKET).createSignedUrl(p.file_path, 3600);
      items.push({ id: p.id, url: signed?.signedUrl || '', uploaded_by: p.uploaded_by || '', created_at: p.created_at });
    }
    return NextResponse.json({ success: true, items });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '조회 오류' }, { status: 500 });
  }
}

// ── 삭제(마감 전 · 본인회사/스태프) ──
export async function DELETE(request: NextRequest) {
  try {
    const profile = await getAuthProfile();
    const isStaff = STAFF.includes(profile.role);
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: '대상이 없습니다.' }, { status: 400 });
    const svc = await createServiceRoleClient();

    const { data: pod } = await svc.from('shipment_pods').select('id, shipment_id, company_id, file_path').eq('id', id).single();
    if (!pod) return NextResponse.json({ error: '증빙을 찾을 수 없습니다.' }, { status: 404 });
    const { data: ship } = await svc.from('shipments').select('id, company_id, is_shipped, shipment_date').eq('id', pod.shipment_id).single();

    if (!isStaff) {
      if (profile.role !== 'transporter' || pod.company_id !== profile.company_id) {
        return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
      }
      if (ship && isLocked(ship)) {
        return NextResponse.json({ error: '마감/확정된 건의 증빙은 삭제할 수 없습니다.' }, { status: 403 });
      }
    }

    await svc.storage.from(BUCKET).remove([pod.file_path]);
    await svc.from('shipment_pods').delete().eq('id', id);
    // 남은 증빙 없으면 플래그 해제
    const { count } = await svc.from('shipment_pods').select('id', { count: 'exact', head: true }).eq('shipment_id', pod.shipment_id);
    if ((count || 0) === 0) await svc.from('shipments').update({ has_attachment: false }).eq('id', pod.shipment_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const a = authErrorResponse(err); if (a) return a;
    return NextResponse.json({ error: err instanceof Error ? err.message : '삭제 오류' }, { status: 500 });
  }
}
