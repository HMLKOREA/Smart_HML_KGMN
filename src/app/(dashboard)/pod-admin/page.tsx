'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSession } from '@/lib/auth/session';
import { useToast } from '@/components/ui/Toast';
import AccessDenied from '@/components/ui/AccessDenied';
import { format, addDays } from 'date-fns';
import { POD_ENABLED } from '@/lib/featureFlags';

interface Row {
  id: string; company_name: string | null; customer_name: string | null; product_name: string | null;
  vehicle_number: string | null; driver_name: string | null; weight_net: number | null;
  is_shipped: boolean | null; has_attachment: boolean | null; shipment_date: string;
}
interface PodItem { id: string; url: string; uploaded_by: string; created_at: string; }

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function PodAdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const role = useMemo(() => getSession()?.profile?.role, []);
  const isAdmin = role === 'admin';
  const canView = role === 'admin' || role === 'monitor' || role === 'field';
  const toast = useToast();

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyPod, setOnlyPod] = useState(false); // 증빙 있는 것만
  const [viewer, setViewer] = useState<{ ship: Row; items: PodItem[] } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [editW, setEditW] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('v_shipments')
        .select('id, company_name, customer_name, product_name, vehicle_number, driver_name, weight_net, is_shipped, has_attachment, shipment_date')
        .eq('shipment_date', date).order('company_name').order('customer_name');
      setRows((data || []) as Row[]);
      setEditW({});
    } finally { setLoading(false); }
  }, [supabase, date]);
  useEffect(() => { if (canView && POD_ENABLED) load(); }, [canView, load]);

  if (!POD_ENABLED || !canView) return <AccessDenied />;

  const dt = new Date(date + 'T00:00:00');
  const shift = (n: number) => setDate(format(addDays(dt, n), 'yyyy-MM-dd'));
  const shown = onlyPod ? rows.filter(r => r.has_attachment) : rows;
  const podCount = rows.filter(r => r.has_attachment).length;
  const confirmedCount = rows.filter(r => r.is_shipped).length;

  const openViewer = async (ship: Row) => {
    try {
      const j = await (await fetch(`/api/pod?shipmentId=${ship.id}`)).json();
      setViewer({ ship, items: j.items || [] });
    } catch { toast.error('증빙 조회 실패'); }
  };
  const delPod = async (id: string) => {
    if (!viewer || !confirm('이 증빙 사진을 삭제할까요?')) return;
    const j = await (await fetch(`/api/pod?id=${id}`, { method: 'DELETE' })).json();
    if (j.error) { toast.error(j.error); return; }
    const items = viewer.items.filter(i => i.id !== id);
    setViewer({ ...viewer, items });
    if (items.length === 0) load();
  };
  const saveWeight = async (r: Row) => {
    const v = editW[r.id];
    if (v == null || v.trim() === '' || Number(v) === Number(r.weight_net)) return;
    const { error } = await supabase.from('shipments').update({ weight_net: parseFloat(v) }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('계근 저장'); load();
  };
  const toggleConfirm = async (r: Row) => {
    const { error } = await supabase.from('shipments').update({ is_shipped: !r.is_shipped }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(!r.is_shipped ? '확정' : '확정 해제'); load();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b bg-white">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 rounded-sm bg-indigo-600" />
          <h1 className="text-xl font-extrabold text-gray-900">증빙 관리 <span className="text-sm font-bold text-gray-400">계근·POD</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 font-bold text-sm">◀ 전날</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border-2 border-indigo-300 rounded-lg text-base font-bold text-slate-800" style={{ colorScheme: 'light' }} />
          <span className="text-sm font-bold text-slate-400">{DOW[dt.getDay()]}</span>
          <button onClick={() => shift(1)} className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 font-bold text-sm">다음날 ▶</button>
        </div>
      </div>
      {/* 요약바 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 sm:px-6 py-2 bg-slate-50 border-b text-sm">
        <span className="text-gray-500">배차 <b className="text-gray-800">{rows.length}</b>건</span>
        <span className="text-gray-500">증빙있음 <b className="text-emerald-600">{podCount}</b></span>
        <span className="text-gray-500">확정 <b className="text-indigo-600">{confirmedCount}</b></span>
        <label className="ml-auto flex items-center gap-1.5 text-gray-600 font-bold cursor-pointer">
          <input type="checkbox" checked={onlyPod} onChange={e => setOnlyPod(e.target.checked)} /> 증빙 있는 것만
        </label>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">불러오는 중…</div>
        ) : shown.length === 0 ? (
          <div className="text-center text-gray-400 py-16">해당 날짜의 {onlyPod ? '증빙이 있는 ' : ''}배차가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl border shadow-sm">
            <table className="w-full text-[13px]" style={{ minWidth: 820 }}>
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[12px]">
                  <th className="text-left px-2.5 py-1.5 font-bold">운송사</th>
                  <th className="text-left px-2.5 py-1.5 font-bold">거래처</th>
                  <th className="text-left px-2.5 py-1.5 font-bold">제품</th>
                  <th className="text-left px-2.5 py-1.5 font-bold">차량 · 기사</th>
                  <th className="text-right px-2.5 py-1.5 font-bold">계근(톤)</th>
                  <th className="text-center px-2.5 py-1.5 font-bold">계근증 사진</th>
                  <th className="text-center px-2.5 py-1.5 font-bold">확정</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const locked = !!r.is_shipped;
                  const canEditW = isAdmin || !locked;
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-slate-50/60" style={r.is_shipped ? { background: '#f5f7ff' } : undefined}>
                      <td className="px-2.5 py-1 font-bold text-blue-700 whitespace-nowrap">{r.company_name || '-'}</td>
                      <td className="px-2.5 py-1 font-semibold text-gray-800 whitespace-nowrap">{r.customer_name || '-'}</td>
                      <td className="px-2.5 py-1 text-gray-600 whitespace-nowrap">{r.product_name || '-'}</td>
                      <td className="px-2.5 py-1 text-gray-500 whitespace-nowrap">{r.vehicle_number || '-'}{r.driver_name ? ` · ${r.driver_name}` : ''}</td>
                      <td className="px-2.5 py-1 text-right whitespace-nowrap">
                        <input type="number" step="0.01" inputMode="decimal" disabled={!canEditW}
                          value={editW[r.id] ?? (r.weight_net != null ? String(r.weight_net) : '')}
                          onChange={e => setEditW(p => ({ ...p, [r.id]: e.target.value }))}
                          onBlur={() => saveWeight(r)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          placeholder="0.00"
                          className="w-20 px-2 py-1 text-right text-[15px] font-black border-2 border-gray-200 rounded-lg focus:border-indigo-500 outline-none disabled:bg-gray-50 disabled:text-gray-400" />
                      </td>
                      <td className="px-2.5 py-1 text-center whitespace-nowrap">
                        {/* 확정 전에 계근증 사진을 클릭해 확인 가능 (증빙 없어도 클릭 시 '없음' 표시) */}
                        <button onClick={() => openViewer(r)}
                          className={`px-2.5 py-1 rounded-lg text-[13px] font-bold border ${r.has_attachment ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-400'}`}>
                          {r.has_attachment ? '📷 사진확인' : '사진확인'}
                        </button>
                      </td>
                      <td className="px-2.5 py-1 text-center whitespace-nowrap">
                        <button onClick={() => toggleConfirm(r)}
                          className={`px-3 py-1 rounded-lg text-[13px] font-bold border ${r.is_shipped ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-300'}`}>
                          {r.is_shipped ? '확정됨' : '확정'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12px] text-gray-400 mt-2">계근수량은 칸에 입력 후 Enter/이동 시 저장됩니다. <b>확정</b>하면 계근수량이 잠깁니다(관리자만 수정). 증빙 <b>보기</b>에서 사진 확인·삭제.</p>
      </div>

      {/* 증빙 뷰어 */}
      {viewer && (
        <div onClick={() => setViewer(null)} className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="flex items-start justify-between gap-3 p-4 border-b">
              <div>
                <div className="text-lg font-black text-gray-900">{viewer.ship.customer_name} · <span className="text-blue-700">{viewer.ship.product_name}</span></div>
                <div className="text-sm text-gray-500">{viewer.ship.company_name} · {viewer.ship.vehicle_number || ''} · 계근 {viewer.ship.weight_net ?? 0}톤</div>
              </div>
              <button onClick={() => setViewer(null)} className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 text-xl">×</button>
            </div>
            <div className="p-4">
              {viewer.items.length === 0 ? (
                <div className="text-center text-gray-400 py-10">등록된 증빙이 없습니다.</div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
                  {viewer.items.map(it => (
                    <div key={it.id} className="relative rounded-xl overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt="" onClick={() => setZoom(it.url)} className="w-full aspect-square object-cover cursor-zoom-in" />
                      <div className="text-[11px] text-gray-400 px-2 py-1 truncate">{it.uploaded_by}</div>
                      <button onClick={() => delPod(it.id)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-red-600/85 text-white text-sm">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {zoom && (
        <div onClick={() => setZoom(null)} className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
