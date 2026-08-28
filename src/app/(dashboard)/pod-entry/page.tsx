'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import { format, addDays } from 'date-fns';
import PodModal, { type PodShipment } from '@/components/modules/dispatch/PodModal';
import { POD_ENABLED } from '@/lib/featureFlags';

interface Row {
  id: string; customer_name: string | null; product_name: string | null;
  vehicle_number: string | null; driver_name: string | null;
  weight_net: number | null; is_shipped: boolean | null; shipment_date: string;
  has_attachment: boolean | null; company_name: string | null;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function PodEntryPage() {
  const supabase = useMemo(() => createClient(), []);
  const role = useMemo(() => getSession()?.profile?.role, []);
  const canView = role === 'transporter' || role === 'admin' || role === 'monitor' || role === 'field';
  const isTransporter = role === 'transporter';
  const isAdmin = role === 'admin';

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [pod, setPod] = useState<PodShipment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // RLS가 운송사는 자기 회사 건만 반환. 스태프는 전체.
      const { data } = await supabase.from('v_shipments')
        .select('id, customer_name, product_name, vehicle_number, driver_name, weight_net, is_shipped, shipment_date, has_attachment, company_name')
        .eq('shipment_date', date)
        .order('company_name').order('customer_name');
      setRows((data || []) as Row[]);
    } finally { setLoading(false); }
  }, [supabase, date]);
  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!POD_ENABLED || !canView) return <AccessDenied />;

  const dt = new Date(date + 'T00:00:00');
  const isToday = date === format(new Date(), 'yyyy-MM-dd');
  const done = rows.filter(r => r.has_attachment).length;
  const shiftDate = (n: number) => setDate(format(addDays(dt, n), 'yyyy-MM-dd'));

  return (
    <div className="min-h-full" style={{ background: '#f1f5f9' }}>
      {/* 상단바 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'linear-gradient(135deg,#1e3a5f,#16233a)', color: '#fff', padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>계근 증빙 입력</div>
            <div style={{ fontSize: 13, color: '#a9c0d6', marginTop: 1 }}>출하증·계근증 사진을 올리고 계근수량을 확정하세요</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, color: '#cbd5e1' }}>
            <div>증빙완료</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>{done}<span style={{ fontSize: 13, color: '#94a3b8' }}>/{rows.length}</span></div>
          </div>
        </div>
        {/* 날짜 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button onClick={() => shiftDate(-1)} style={{ flex: 'none', width: 44, height: 44, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 20, fontWeight: 800 }}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.1)', borderRadius: 11, padding: '8px 10px' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 17, fontWeight: 800, textAlign: 'center', width: '100%', colorScheme: 'dark' }} />
            <div style={{ fontSize: 12, color: '#a9c0d6' }}>{DOW[dt.getDay()]}요일 {isToday ? '· 오늘' : ''}</div>
          </div>
          <button onClick={() => shiftDate(1)} style={{ flex: 'none', width: 44, height: 44, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 20, fontWeight: 800 }}>›</button>
        </div>
      </div>

      {/* 배차 목록 — 한눈에, 계근수량 눌러 입력 */}
      <div style={{ padding: '12px', maxWidth: 920, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: 15 }}>불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px 16px', fontSize: 15 }}>
            이 날짜에 배차된 건이 없습니다.<br /><span style={{ fontSize: 13, color: '#cbd5e1' }}>날짜를 바꿔 확인해 보세요.</span>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 116px 52px', gap: 8, padding: '9px 12px', background: '#f1f5f9', fontSize: 12, fontWeight: 800, color: '#64748b' }}>
              <span>거래처 · 제품 · 차량</span>
              <span style={{ textAlign: 'center' }}>계근수량(톤)</span>
              <span style={{ textAlign: 'center' }}>증빙</span>
            </div>
            {rows.map(r => {
              const hasWeight = r.weight_net != null && r.weight_net > 0;
              const hasPod = !!r.has_attachment;
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 116px 52px', gap: 8, alignItems: 'center', padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.customer_name || '(거래처)'} <span style={{ color: '#2563eb', fontSize: 13.5, fontWeight: 800 }}>{r.product_name || ''}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.vehicle_number || '차량미정'}{r.driver_name ? ` · ${r.driver_name}` : ''}{(!isTransporter && r.company_name) ? ` · ${r.company_name}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setPod({
                    id: r.id, company_name: r.company_name, customer_name: r.customer_name, product_name: r.product_name,
                    shipment_date: r.shipment_date, weight_net: r.weight_net, is_shipped: r.is_shipped, vehicle_number: r.vehicle_number,
                  })}
                    style={{ width: 116, padding: '11px 0', borderRadius: 10, border: `2px solid ${hasWeight ? '#6d28d9' : '#cbd5e1'}`, background: hasWeight ? '#f5f3ff' : '#fff', color: hasWeight ? '#6d28d9' : '#94a3b8', fontSize: 19, fontWeight: 900, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                    {hasWeight ? r.weight_net!.toFixed(2) : '입력'}
                  </button>
                  <div style={{ width: 52, textAlign: 'center', fontSize: 18 }} title={hasPod ? '증빙 있음' : '증빙 없음'}>
                    {hasPod ? '✅' : <span style={{ opacity: .3 }}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pod && (
        <PodModal shipment={pod} isAdmin={isAdmin} isTransporter={isTransporter}
          onClose={() => setPod(null)} onChanged={() => load()} />
      )}
    </div>
  );
}
