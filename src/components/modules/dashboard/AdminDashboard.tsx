'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/* ── 타입 ── */
interface TodayStats {
  total: number;
  pending: number;
  completed: number;
}

interface CustomerVolumeItem {
  name: string;
  currentCount: number;
  previousCount: number;
  currentTon: number;
  previousTon: number;
}

interface MonthlyAnalysis {
  totalQuantity: number;
  companyVolumes: { name: string; value: number }[];
  customerVolumes: CustomerVolumeItem[];
  settlementAmount: number;
}

interface RecentShipment {
  shipment_date: string;
  shipment_number: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  weight_net: number;
  vehicle_number: string;
  company_name: string;
  status: string;
}

/* ── 색상 팔레트 ── */
const PIE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#84CC16',
];

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  pending:    { label: '대기',     style: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  dispatched: { label: '배차완료', style: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  in_transit: { label: '운송중',   style: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
  delivered:  { label: '배송완료', style: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  completed:  { label: '완료',     style: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  cancelled:  { label: '취소',     style: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
};

/* ── 커스텀 툴팁 ── */
function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur px-4 py-2.5 rounded-xl shadow-lg border border-gray-100 text-sm">
      <p className="font-semibold text-gray-800">{payload[0].name}</p>
      <p className="text-blue-600 font-medium">{Number(payload[0].value).toLocaleString()} ton</p>
    </div>
  );
}

function BarTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  const u = unit || '건';
  return (
    <div className="bg-white/95 backdrop-blur px-4 py-2.5 rounded-xl shadow-lg border border-gray-100 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className={p.dataKey.startsWith('current') ? 'text-blue-600 font-medium' : 'text-gray-400'}>
          {p.dataKey.startsWith('current') ? '당월' : '전월'}: {Number(p.value).toLocaleString()} {u}
        </p>
      ))}
    </div>
  );
}

/* ── 파이 차트 라벨 ── */
const RADIAN = Math.PI / 180;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPieLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
  if (!percent || percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.35;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#374151" textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central" className="text-[11px]">
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

/* ── 섹션 헤더 컴포넌트 ── */
function SectionHeader({ color, title, subtitle }: { color: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-1.5 h-7 rounded-full ${color}`} />
      <h3 className="text-lg font-bold text-gray-800 tracking-tight">{title}</h3>
      {subtitle && <span className="text-sm font-normal text-gray-400 bg-gray-50 px-2.5 py-0.5 rounded-full">{subtitle}</span>}
    </div>
  );
}

/* ── 토글 버튼 ── */
type ChartMode = 'ton' | 'count';
function ChartModeToggle({ mode, onChange }: { mode: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-xl p-1 gap-1">
      <button
        onClick={() => onChange('ton')}
        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${
          mode === 'ton'
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
        </svg>
        출하량 (ton)
      </button>
      <button
        onClick={() => onChange('count')}
        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${
          mode === 'count'
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
        차량대수 (건)
      </button>
    </div>
  );
}

export default function AdminDashboard({ userName, userRole = 'admin' }: { userName: string; userRole?: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [todayStats, setTodayStats] = useState<TodayStats>({ total: 0, pending: 0, completed: 0 });
  const [monthly, setMonthly] = useState<MonthlyAnalysis>({
    totalQuantity: 0, companyVolumes: [], customerVolumes: [], settlementAmount: 0,
  });
  const [recentShipments, setRecentShipments] = useState<RecentShipment[]>([]);
  const [todaySettlement, setTodaySettlement] = useState(0);
  const [chartMode, setChartMode] = useState<ChartMode>('ton');

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const monthStart = useMemo(() => `${today.substring(0, 7)}-01`, [today]);

  const { prevMonthStart, prevMonthEnd } = useMemo(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
    return {
      prevMonthStart: `${y}-${m}-01`,
      prevMonthEnd: `${y}-${m}-${lastDay}`,
    };
  }, [today]);

  const loadData = useCallback(async () => {
    try {
      const [
        todayTotalRes, todayPendingRes, todayCompletedRes,
        monthShipmentsRes, prevMonthShipmentsRes,
        monthUnitPricesRes, recentRes,
      ] = await Promise.all([
        supabase.from('shipments').select('*', { count: 'exact', head: true }).eq('shipment_date', today),
        supabase.from('shipments').select('*', { count: 'exact', head: true }).eq('shipment_date', today).eq('status', 'pending'),
        supabase.from('shipments').select('*', { count: 'exact', head: true }).eq('shipment_date', today).in('status', ['completed', 'delivered']),
        supabase.from('v_shipments').select('weight_net, company_name, company_id, customer_name, product_name, quantity').gte('shipment_date', monthStart).lte('shipment_date', today),
        supabase.from('v_shipments').select('customer_name, quantity, weight_net').gte('shipment_date', prevMonthStart).lte('shipment_date', prevMonthEnd),
        supabase.from('unit_prices').select('company_id, product_id, price, transport_type').eq('effective_date', monthStart),
        supabase.from('v_shipments').select('shipment_date,shipment_number,customer_name,product_name,quantity,weight_net,vehicle_number,company_name,status').order('created_at', { ascending: false }).limit(10),
      ]);

      setTodayStats({
        total: todayTotalRes.count || 0,
        pending: todayPendingRes.count || 0,
        completed: todayCompletedRes.count || 0,
      });

      const monthData = (monthShipmentsRes.data || []) as Array<Record<string, unknown>>;
      const prevData = (prevMonthShipmentsRes.data || []) as Array<Record<string, unknown>>;

      const totalQuantity = monthData.reduce((sum, r) => sum + (Number(r.weight_net) || 0), 0);

      // 운송사별 누적
      const companyMap = new Map<string, number>();
      monthData.forEach(r => {
        const name = String(r.company_name || '미지정');
        companyMap.set(name, (companyMap.get(name) || 0) + (Number(r.weight_net) || 0));
      });
      const companyVolumes = Array.from(companyMap.entries())
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => b.value - a.value);

      // 거래처별 (당월 vs 전월) - count + ton 둘 다 수집
      const custCurrentCount = new Map<string, number>();
      const custCurrentTon = new Map<string, number>();
      monthData.forEach(r => {
        const name = String(r.customer_name || '미지정');
        custCurrentCount.set(name, (custCurrentCount.get(name) || 0) + 1);
        custCurrentTon.set(name, (custCurrentTon.get(name) || 0) + (Number(r.weight_net) || 0));
      });
      const custPrevCount = new Map<string, number>();
      const custPrevTon = new Map<string, number>();
      prevData.forEach(r => {
        const name = String(r.customer_name || '미지정');
        custPrevCount.set(name, (custPrevCount.get(name) || 0) + 1);
        custPrevTon.set(name, (custPrevTon.get(name) || 0) + (Number(r.weight_net) || 0));
      });
      const allCustomers = new Set([...custCurrentCount.keys(), ...custPrevCount.keys()]);
      const customerVolumes: CustomerVolumeItem[] = Array.from(allCustomers)
        .map(name => ({
          name,
          currentCount: custCurrentCount.get(name) || 0,
          previousCount: custPrevCount.get(name) || 0,
          currentTon: Math.round((custCurrentTon.get(name) || 0) * 10) / 10,
          previousTon: Math.round((custPrevTon.get(name) || 0) * 10) / 10,
        }))
        .sort((a, b) => b.currentTon - a.currentTon)
        .slice(0, 10);

      // 정산 누적: shipments weight_net × unit_prices 기반 추정 계산
      // unit_prices를 company_id 기반으로 평균 단가 맵 생성
      const priceData = (monthUnitPricesRes.data || []) as Array<Record<string, unknown>>;
      const avgPriceByCompany = new Map<string, number>();
      const priceCountByCompany = new Map<string, number>();
      priceData.forEach(p => {
        const cid = String(p.company_id || '');
        const price = Number(p.price) || 0;
        if (cid && price > 0) {
          avgPriceByCompany.set(cid, (avgPriceByCompany.get(cid) || 0) + price);
          priceCountByCompany.set(cid, (priceCountByCompany.get(cid) || 0) + 1);
        }
      });
      // 평균 계산
      avgPriceByCompany.forEach((total, cid) => {
        avgPriceByCompany.set(cid, total / (priceCountByCompany.get(cid) || 1));
      });
      // 월간 정산 추정: 각 shipment의 weight_net × 해당 운송사 평균 단가
      let settlementAmount = 0;
      let todaySettle = 0;
      monthData.forEach(r => {
        const weight = Number(r.weight_net) || 0;
        const cid = String(r.company_id || '');
        const avgPrice = avgPriceByCompany.get(cid) || 15000; // 기본 단가 15,000원/톤
        const fee = Math.round(weight * avgPrice);
        settlementAmount += fee;
      });
      // 금일 정산은 오늘 건수 × 평균 추정
      todaySettle = Math.round(settlementAmount / Math.max(monthData.length, 1) * todayStats.total);
      setTodaySettlement(todaySettle);

      setMonthly({ totalQuantity, companyVolumes, customerVolumes, settlementAmount });
      setRecentShipments((recentRes.data as RecentShipment[]) || []);
    } catch (err) {
      console.error('Admin dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, today, monthStart, prevMonthStart, prevMonthEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  // 차트 모드에 따른 dataKey
  const barCurrentKey = chartMode === 'ton' ? 'currentTon' : 'currentCount';
  const barPrevKey = chartMode === 'ton' ? 'previousTon' : 'previousCount';
  const barUnit = chartMode === 'ton' ? 'ton' : '건';

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

  const inProgress = todayStats.total - todayStats.pending - todayStats.completed;

  return (
    <div className="max-w-[1600px]">

      {/* ── 인사말 헤더 ── */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-blue-900 rounded-xl px-8 py-5 text-white shadow-lg">
        <h2 className="text-xl font-bold tracking-tight">
          안녕하세요, <span className="text-blue-300">{userName}</span>님 👋
        </h2>
        <p className="text-slate-300 text-sm mt-1.5">{today} 현재 시스템 현황을 확인하세요.</p>
      </div>

      {/* ── 역할별 배너 ── */}
      {userRole === 'monitor' && (
        <div className="mt-4 px-5 py-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span className="text-sm font-medium text-blue-800">모니터링 모드 - 조회 전용으로 시스템 현황을 확인합니다.</span>
        </div>
      )}
      {userRole === 'field' && (
        <div className="mt-4 px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          <span className="text-sm font-medium text-emerald-800">현장 모드 - 오늘의 출하 및 계근 현황을 확인합니다.</span>
        </div>
      )}

      {/* ═══════ Section 1: 배차현황 ═══════ */}
      <section className="mt-6">
        <SectionHeader color="bg-blue-500" title="배차현황" subtitle="오늘" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">

          {/* 오늘 출하 */}
          <div className="bg-white rounded-2xl border border-gray-100 pl-5 pr-4 py-4 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div style={{ paddingLeft: 3 }}>
                <p className="text-sm font-semibold text-gray-400 tracking-wide">오늘 출하</p>
                <p className="text-3xl font-extrabold text-gray-900 mt-2">
                  {todayStats.total}<span className="text-base font-medium text-gray-400 ml-1">건</span>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* 대기중 */}
          <div className="bg-white rounded-2xl border border-gray-100 pl-5 pr-4 py-4 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div style={{ paddingLeft: 3 }}>
                <p className="text-sm font-semibold text-gray-400 tracking-wide">대기중</p>
                <p className="text-3xl font-extrabold text-amber-500 mt-2">
                  {todayStats.pending}<span className="text-base font-medium text-gray-400 ml-1">건</span>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* 완료 */}
          <div className="bg-white rounded-2xl border border-gray-100 pl-5 pr-4 py-4 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div style={{ paddingLeft: 3 }}>
                <p className="text-sm font-semibold text-gray-400 tracking-wide">완료</p>
                <p className="text-3xl font-extrabold text-emerald-500 mt-2">
                  {todayStats.completed}<span className="text-base font-medium text-gray-400 ml-1">건</span>
                </p>
                {inProgress > 0 && (
                  <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    진행중 {inProgress}건
                  </p>
                )}
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* 금일 누적 정산금액 */}
          <div className="bg-white rounded-2xl border border-gray-100 pl-5 pr-4 py-4 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div style={{ paddingLeft: 3 }}>
                <p className="text-sm font-semibold text-gray-400 tracking-wide">금일 정산</p>
                <p className="text-3xl font-extrabold text-violet-600 mt-2">
                  {todaySettlement.toLocaleString()}<span className="text-base font-medium text-gray-400 ml-1">원</span>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-violet-500/20 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══════ Section 2: 월간 분석 ═══════ */}
      <section className="mt-8">
        <SectionHeader color="bg-emerald-500" title="월간 분석" subtitle={today.substring(0, 7)} />

        {/* KPI 카드 2개 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-blue-50 rounded-full -translate-y-10 translate-x-10 opacity-50" />
            <p className="text-sm font-semibold text-gray-400 tracking-wider uppercase relative z-10" style={{ paddingLeft: 3 }}>월간 총 출하량</p>
            <p className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mt-2 relative z-10" style={{ paddingLeft: 3 }}>
              {monthly.totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="text-base font-semibold text-gray-400 ml-2">ton</span>
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-50 rounded-full -translate-y-10 translate-x-10 opacity-50" />
            <p className="text-sm font-semibold text-gray-400 tracking-wider uppercase relative z-10" style={{ paddingLeft: 3 }}>월간 정산 누적</p>
            <p className="text-2xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mt-2 relative z-10" style={{ paddingLeft: 3 }}>
              {monthly.settlementAmount.toLocaleString()}
              <span className="text-base font-semibold text-gray-400 ml-2">원</span>
            </p>
            <p className="text-xs text-gray-400 mt-2 relative z-10">
              {monthStart} ~ {today} 누적
            </p>
          </div>
        </div>

        {/* 차트 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* 파이차트 */}
          <div className="bg-white rounded-xl border border-gray-100 px-6 py-5">
            <p className="text-sm font-bold text-gray-700 mb-4" style={{ paddingLeft: 3 }}>운송사별 운송량</p>
            {monthly.companyVolumes.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={monthly.companyVolumes}
                    cx="50%" cy="50%"
                    outerRadius={95} innerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderPieLabel}
                  >
                    {monthly.companyVolumes.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-gray-300 text-sm">
                데이터가 없습니다
              </div>
            )}
          </div>

          {/* 막대차트 - 전환 가능 */}
          <div className="bg-white rounded-xl border border-gray-100 px-6 py-5">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
              <div style={{ paddingLeft: 3 }}>
                <p className="text-base font-bold text-gray-700">거래처별 출하 수량</p>
                <p className="text-sm text-gray-400 mt-1.5">당월 vs 전월 비교</p>
              </div>
              <ChartModeToggle mode={chartMode} onChange={setChartMode} />
            </div>
            {monthly.customerVolumes.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly.customerVolumes} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <Tooltip content={<BarTooltip unit={barUnit} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey={barPrevKey} name="전월" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={barCurrentKey} name="당월" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-gray-300 text-sm">
                데이터가 없습니다
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════ Section 3: 최근 출하내역 ═══════ */}
      <section className="mt-8">
        <SectionHeader color="bg-violet-500" title="최근 출하내역" subtitle="최근 10건" />
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm mt-3">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>출하일자</th>
                  <th>출하번호</th>
                  <th>거래처</th>
                  <th>제품</th>
                  <th className="text-right">계량(ton)</th>
                  <th>차량번호</th>
                  <th>운송사</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.length > 0 ? recentShipments.map((s, i) => {
                  const st = STATUS_MAP[s.status] || { label: s.status, style: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                      <td className="text-gray-500">{s.shipment_date}</td>
                      <td className="font-mono text-sm font-semibold text-gray-700">{s.shipment_number}</td>
                      <td className="font-medium text-gray-800">{s.customer_name || '-'}</td>
                      <td className="text-gray-600">{s.product_name || '-'}</td>
                      <td className="text-right tabular-nums font-semibold text-gray-800">{(s.weight_net || 0).toLocaleString()}</td>
                      <td className="font-mono text-sm text-gray-600">{s.vehicle_number || '-'}</td>
                      <td className="text-gray-600">{s.company_name || '-'}</td>
                      <td>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${st.style}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-gray-300">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                        </svg>
                        <p className="text-sm">출하 데이터가 없습니다</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 하단 여백 */}
      <div className="h-10" />
    </div>
  );
}
