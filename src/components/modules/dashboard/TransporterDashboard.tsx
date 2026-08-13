'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

/* ── 타입 ── */
interface TodayRequest {
  id: string;
  shipment_number: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  delivery_address: string;
  vehicle_number: string;
  driver_name: string;
  status: string;
  weight_empty: number | null;
  weight_loaded: number | null;
  weight_net: number | null;
}

interface ShipRow { weight_net: number | null; shipment_date: string | null; }
type PeriodMode = 'day' | 'month' | 'quarter';
interface PeriodStat { label: string; total_quantity: number; dispatch_count: number; }

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  pending:    { label: '대기',     style: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  dispatched: { label: '배차완료', style: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  in_transit: { label: '운송중',   style: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
  delivered:  { label: '배송완료', style: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  completed:  { label: '완료',     style: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  cancelled:  { label: '취소',     style: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
};

function VehicleTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200 text-sm">
      <p className="font-medium text-gray-800 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-gray-600">
          {p.dataKey === 'dispatch_count' ? '배차 횟수' : '출하량(ton)'}: {Number(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function TransporterDashboard({ userName, companyName, companyId: companyIdProp }: { userName: string; companyName: string; companyId?: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [todayRequests, setTodayRequests] = useState<TodayRequest[]>([]);
  const [needsWeighing, setNeedsWeighing] = useState<TodayRequest[]>([]);
  const [yearData, setYearData] = useState<ShipRow[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const monthStart = useMemo(() => `${today.substring(0, 7)}-01`, [today]);
  const yearStart = useMemo(() => `${today.substring(0, 4)}-01-01`, [today]);

  const loadData = useCallback(async () => {
    try {
      // 운송사 ID 결정: profile의 company_id 우선, 없으면 회사명으로 조회(하위호환)
      let companyId = companyIdProp || '';
      if (!companyId && companyName) {
        const { data: companyData } = await supabase
          .from('transport_companies')
          .select('id')
          .eq('name', companyName)
          .single();
        companyId = companyData?.id || '';
      }
      if (!companyId) {
        setLoading(false);
        return;
      }

      const [todayShipmentsRes, yearShipmentsRes] = await Promise.all([
        // 금일 출하 요청
        supabase.from('v_shipments')
          .select('id,shipment_number,customer_name,product_name,quantity,delivery_address,vehicle_number,driver_name,status,weight_empty,weight_loaded,weight_net')
          .eq('company_id', companyId)
          .eq('shipment_date', today)
          .order('created_at', { ascending: false }),
        // 연간 출하 데이터 (날짜/월/분기 분석용) - pagination loop
        (async () => {
          const PAGE_SIZE = 1000;
          let allRows: ShipRow[] = [];
          let page = 0;
          let hasMore = true;
          while (hasMore) {
            const start = page * PAGE_SIZE;
            const end = start + PAGE_SIZE - 1;
            const { data, error } = await supabase.from('v_shipments')
              .select('weight_net,shipment_date')
              .eq('company_id', companyId)
              .gte('shipment_date', yearStart)
              .lte('shipment_date', today)
              .range(start, end);
            if (error) throw error;
            const rows = (data || []) as ShipRow[];
            allRows = [...allRows, ...rows];
            hasMore = rows.length === PAGE_SIZE;
            page++;
          }
          return allRows;
        })(),
      ]);

      const todayData = (todayShipmentsRes.data || []) as TodayRequest[];
      setTodayRequests(todayData);

      // 계근 미입력 항목 (weight_net이 null이고 cancelled가 아닌 항목)
      setNeedsWeighing(todayData.filter(s =>
        s.weight_net === null && s.status !== 'cancelled' && s.status !== 'pending'
      ));

      setYearData(yearShipmentsRes);
    } catch (err) {
      console.error('Transporter dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, today, yearStart, companyName, companyIdProp]);

  useEffect(() => { loadData(); }, [loadData]);

  // 월간 KPI (당월)
  const monthKpi = useMemo(() => {
    const rows = yearData.filter(r => (r.shipment_date || '') >= monthStart);
    return {
      totalQuantity: rows.reduce((s, r) => s + (Number(r.weight_net) || 0), 0),
      dispatchCount: rows.length,
    };
  }, [yearData, monthStart]);

  // 기간별(날짜/월/분기) 출하 분석
  const periodStats = useMemo<PeriodStat[]>(() => {
    const map = new Map<string, { total_quantity: number; dispatch_count: number }>();
    // 날짜별은 당월만, 월별/분기별은 연간 전체
    const src = periodMode === 'day' ? yearData.filter(r => (r.shipment_date || '') >= monthStart) : yearData;
    for (const r of src) {
      const d = r.shipment_date;
      if (!d) continue;
      let label: string;
      if (periodMode === 'day') label = d.slice(5);            // MM-DD
      else if (periodMode === 'month') label = d.slice(0, 7);  // YYYY-MM
      else label = `${d.slice(0, 4)} Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`; // 분기
      const cur = map.get(label) || { total_quantity: 0, dispatch_count: 0 };
      cur.total_quantity += Number(r.weight_net) || 0;
      cur.dispatch_count += 1;
      map.set(label, cur);
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, total_quantity: Math.round(v.total_quantity * 100) / 100, dispatch_count: v.dispatch_count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [yearData, periodMode, monthStart]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">대시보드를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
          <span className="text-blue-600">{companyName}</span>
          <span className="text-sm sm:text-base font-normal text-gray-500 ml-2">({userName})</span>
        </h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">{today} 운송사 현황</p>
      </div>

      {/* ═══════ Section 1: 금일 출하 요청 / 계근 미입력 ═══════ */}
      <section>
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full" />
          금일 출하 요청
          <span className="text-xs font-normal text-gray-400">{todayRequests.length}건</span>
        </h3>

        {/* 계근 미입력 알림 */}
        {needsWeighing.length > 0 && (
          <div className="mb-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-xs sm:text-sm font-semibold text-amber-800">계근 입력 필요: {needsWeighing.length}건</span>
            </div>
            <div className="space-y-1">
              {needsWeighing.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-amber-700">
                  <span className="font-mono text-xs">{s.shipment_number}</span>
                  <span>{s.customer_name}</span>
                  <span className="font-mono text-xs">{s.vehicle_number || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 금일 출하 목록 */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>출하번호</th>
                  <th>거래처</th>
                  <th>제품</th>
                  <th className="text-right">수량</th>
                  <th>차량번호</th>
                  <th>기사</th>
                  <th className="text-right">계량(ton)</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {todayRequests.length > 0 ? todayRequests.map((s, i) => {
                  const st = STATUS_MAP[s.status] || { label: s.status, style: 'bg-gray-100 text-gray-600' };
                  const missingWeight = s.weight_net === null && s.status !== 'cancelled' && s.status !== 'pending';
                  return (
                    <tr key={i} className={`hover:bg-gray-50/50 ${missingWeight ? 'bg-amber-50/30' : ''}`}>
                      <td className="font-mono text-xs font-medium text-gray-700 whitespace-nowrap">{s.shipment_number}</td>
                      <td className="font-medium text-gray-800 whitespace-nowrap">{s.customer_name || '-'}</td>
                      <td className="whitespace-nowrap">{s.product_name || '-'}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{Number(s.quantity || 0).toLocaleString()}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{s.vehicle_number || '-'}</td>
                      <td className="whitespace-nowrap">{s.driver_name || '-'}</td>
                      <td className="text-right tabular-nums font-medium whitespace-nowrap">
                        {s.weight_net !== null
                          ? Number(s.weight_net).toLocaleString()
                          : <span className="text-amber-600 text-xs font-semibold">미입력</span>
                        }
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.style}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8} className="text-center py-10 sm:py-12 text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-7 h-7 sm:w-8 sm:h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
                        </svg>
                        <p className="text-sm">금일 배차된 출하 건이 없습니다</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══════ Section 2: 출하 분석 ═══════ */}
      <section>
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-emerald-500 rounded-full" />
          출하 분석
          <span className="text-xs font-normal text-gray-400 ml-1">(당월 요약 · 기간별 추이)</span>
        </h3>

        {/* KPI 카드 (당월) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">총 출하량</p>
            <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mt-1">
              {monthKpi.totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="text-xs sm:text-sm font-normal text-gray-400 ml-1">ton</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">배차 횟수</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
              {monthKpi.dispatchCount.toLocaleString()}
              <span className="text-xs sm:text-sm font-normal text-gray-400 ml-1">회</span>
            </p>
          </div>
        </div>

        {/* 기간별 출하량 분석 (날짜/월/분기 토글) */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700">
              기간별 출하량
              <span className="text-xs font-normal text-gray-400 ml-1">
                ({periodMode === 'day' ? `${today.substring(0, 7)} 일별` : `${today.substring(0, 4)}년 ${periodMode === 'month' ? '월별' : '분기별'}`})
              </span>
            </p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([['day', '날짜별'], ['month', '월별'], ['quarter', '분기별']] as [PeriodMode, string][]).map(([mode, label]) => (
                <button key={mode} onClick={() => setPeriodMode(mode)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${periodMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {periodStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={periodStats} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<VehicleTooltip />} />
                <Bar dataKey="total_quantity" name="출하량(ton)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] sm:h-[280px] text-gray-400 text-sm">
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* 기간별 상세 테이블 */}
        {periodStats.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mt-4">
            <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">
                기간별 상세 <span className="text-xs font-normal text-gray-400">({periodMode === 'day' ? '날짜별' : periodMode === 'month' ? '월별' : '분기별'})</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[320px]">
                <thead>
                  <tr>
                    <th>{periodMode === 'day' ? '날짜' : periodMode === 'month' ? '월' : '분기'}</th>
                    <th className="text-right">배차 횟수</th>
                    <th className="text-right">출하량 (ton)</th>
                  </tr>
                </thead>
                <tbody>
                  {periodStats.map((v, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="font-medium text-gray-800 whitespace-nowrap">{v.label}</td>
                      <td className="text-right tabular-nums">{v.dispatch_count}</td>
                      <td className="text-right tabular-nums font-medium">{v.total_quantity.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="text-gray-700">합계</td>
                    <td className="text-right tabular-nums">{periodStats.reduce((s, v) => s + v.dispatch_count, 0)}</td>
                    <td className="text-right tabular-nums">{periodStats.reduce((s, v) => s + v.total_quantity, 0).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
