'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';

// ── Types ──────────────────────────────────────────────
interface UnitPriceRow {
  id: string;
  company_id: string;
  product_id: string;
  price: number;
  effective_date: string;
  end_date: string | null;
  memo: string | null;
  is_active: boolean;
  transport_companies: { id: string; name: string } | null;
  products: { id: string; name: string } | null;
}

interface UnitPriceDisplay {
  id: string;
  company_id: string;
  company: string;
  product_id: string;
  product: string;
  price: number;
  effective_date: string;
  end_date: string | null;
  memo: string | null;
}

interface SettlementRow {
  id: string;
  date: string;
  company: string;
  customer: string;
  transportType: string;
  product: string;
  weightNet: number;
  unitPrice: number;
  transportFee: number;
  tax: number;
  totalFee: number;
}

type GroupSummary = { name: string; totalFee: number; totalWeight: number };

function groupBy(rows: SettlementRow[], key: 'company' | 'customer' | 'product'): GroupSummary[] {
  const map = new Map<string, { totalFee: number; totalWeight: number }>();
  rows.forEach(r => {
    const k = r[key];
    const e = map.get(k) || { totalFee: 0, totalWeight: 0 };
    e.totalFee += r.totalFee;
    e.totalWeight += r.weightNet;
    map.set(k, e);
  });
  return Array.from(map.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.totalFee - a.totalFee);
}

// ── 날짜 유틸 ──────────────────────────────────────────
/** 해당 월의 말일 반환 */
function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 정확한 기간 문자열 반환 */
function getDateRange(
  year: number,
  month: number,
  period: PeriodFilter
): { from: string; to: string; label: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = year;

  switch (period) {
    case 'monthly': {
      const ld = lastDay(y, month);
      return {
        from: `${y}-${pad(month)}-01`,
        to: `${y}-${pad(month)}-${pad(ld)}`,
        label: `${y}년 ${month}월`,
      };
    }
    case 'quarterly': {
      const q = Math.ceil(month / 3);
      const sm = (q - 1) * 3 + 1;
      const em = q * 3;
      const ld = lastDay(y, em);
      return {
        from: `${y}-${pad(sm)}-01`,
        to: `${y}-${pad(em)}-${pad(ld)}`,
        label: `${y}년 ${q}분기 (${sm}~${em}월)`,
      };
    }
    case 'semi-annual': {
      const half = month <= 6 ? 1 : 2;
      if (half === 1) {
        return { from: `${y}-01-01`, to: `${y}-06-30`, label: `${y}년 상반기 (1~6월)` };
      }
      return { from: `${y}-07-01`, to: `${y}-12-31`, label: `${y}년 하반기 (7~12월)` };
    }
    case 'annual':
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}년 전체` };
  }
}

/** 이전 동기간 범위 */
function getPrevRange(
  year: number,
  month: number,
  period: PeriodFilter
): { from: string; to: string; label: string } {
  switch (period) {
    case 'monthly': {
      const pm = month === 1 ? 12 : month - 1;
      const py = month === 1 ? year - 1 : year;
      return getDateRange(py, pm, 'monthly');
    }
    case 'quarterly': {
      const q = Math.ceil(month / 3);
      if (q === 1) {
        // 전년 4분기
        return getDateRange(year - 1, 12, 'quarterly');
      }
      return getDateRange(year, (q - 2) * 3 + 1, 'quarterly');
    }
    case 'semi-annual': {
      const half = month <= 6 ? 1 : 2;
      if (half === 1) return getDateRange(year - 1, 7, 'semi-annual');
      return getDateRange(year, 1, 'semi-annual');
    }
    case 'annual':
      return getDateRange(year - 1, 1, 'annual');
  }
}

const CHART_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];

type TabKey = 'settlement' | 'unitprice';
type PeriodFilter = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';

// ── Component ──────────────────────────────────────────
export default function SettlementPage() {
  const supabase = createClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('settlement');

  // ── Unit Price State ──
  const [upFilterCompany, setUpFilterCompany] = useState('');
  const [upFilterProduct, setUpFilterProduct] = useState('');
  const [upFilterCollapsed, setUpFilterCollapsed] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<number>(0);
  const [upLoading, setUpLoading] = useState(false);
  const [unitPrices, setUnitPrices] = useState<UnitPriceDisplay[]>([]);

  // ── Settlement State ──
  const [stlYear, setStlYear] = useState(() => new Date().getFullYear());
  const [stlMonth, setStlMonth] = useState(() => new Date().getMonth() + 1);
  const [stlPeriodFilter, setStlPeriodFilter] = useState<PeriodFilter>('monthly');
  const [stlFilterCompany, setStlFilterCompany] = useState('');
  const [stlFilterCustomer, setStlFilterCustomer] = useState('');
  const [stlFilterTransport, setStlFilterTransport] = useState('');
  const [stlFilterProduct, setStlFilterProduct] = useState('');
  const [stlFilterCollapsed, setStlFilterCollapsed] = useState(false);
  const [stlDetailOpen, setStlDetailOpen] = useState(false);
  const [stlLoading, setStlLoading] = useState(false);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [prevSettlements, setPrevSettlements] = useState<SettlementRow[]>([]);

  // Filter options
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [transportTypeOptions, setTransportTypeOptions] = useState<string[]>([]);

  // ── 기간 계산 ──
  const dateRange = useMemo(() => getDateRange(stlYear, stlMonth, stlPeriodFilter), [stlYear, stlMonth, stlPeriodFilter]);
  const prevRange = useMemo(() => getPrevRange(stlYear, stlMonth, stlPeriodFilter), [stlYear, stlMonth, stlPeriodFilter]);

  // ── Fetch unit prices ──
  const fetchUnitPrices = useCallback(async () => {
    setUpLoading(true);
    try {
      const { data, error } = await supabase
        .from('unit_prices')
        .select(`*, transport_companies(id, name), products(id, name)`)
        .eq('is_active', true)
        .order('company_id');
      if (error) throw error;

      const rows: UnitPriceDisplay[] = ((data as UnitPriceRow[]) || []).map(r => ({
        id: r.id,
        company_id: r.company_id,
        company: r.transport_companies?.name ?? '(알수없음)',
        product_id: r.product_id,
        product: r.products?.name ?? '(알수없음)',
        price: r.price,
        effective_date: r.effective_date,
        end_date: r.end_date,
        memo: r.memo,
      }));
      setUnitPrices(rows);
      setCompanyOptions([...new Set(rows.map(r => r.company))].sort());
      setProductOptions([...new Set(rows.map(r => r.product))].sort());
    } catch {
      toast.error('단가 데이터를 불러오지 못했습니다.');
    } finally {
      setUpLoading(false);
    }
  }, [supabase]);

  // ── Fetch settlements ──
  const fetchSettlementRange = useCallback(async (from: string, to: string): Promise<SettlementRow[]> => {
    try {
      const { data: shipData, error: shipErr } = await supabase
        .from('v_shipments')
        .select('*')
        .gte('shipment_date', from)
        .lte('shipment_date', to)
        .order('shipment_date');
      if (shipErr) throw shipErr;

      const { data: priceData, error: priceErr } = await supabase
        .from('unit_prices')
        .select(`*, transport_companies(id, name), products(id, name)`)
        .eq('is_active', true);
      if (priceErr) throw priceErr;

      // company_id::product_id → price
      const priceMap = new Map<string, number>();
      ((priceData as UnitPriceRow[]) || []).forEach(p => {
        priceMap.set(`${p.company_id}::${p.product_id}`, p.price);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((shipData || []) as any[]).map((s: any) => {
        const unitPrice = priceMap.get(`${s.company_id}::${s.product_id}`) ?? 0;
        const wt = Number(s.weight_net) || 0;
        const tt = s.transport_type ?? '';
        const fee = tt === '카고' ? unitPrice : Math.round(unitPrice * wt);
        const tax = Math.round(fee * 0.1);
        return {
          id: s.id,
          date: s.shipment_date,
          company: s.company_name ?? '',
          customer: s.customer_name ?? '',
          transportType: tt,
          product: s.product_name ?? '',
          weightNet: wt,
          unitPrice,
          transportFee: fee,
          tax,
          totalFee: fee + tax,
        };
      });
    } catch {
      return [];
    }
  }, [supabase]);

  const loadSettlements = useCallback(async () => {
    setStlLoading(true);
    try {
      const [curr, prev] = await Promise.all([
        fetchSettlementRange(dateRange.from, dateRange.to),
        fetchSettlementRange(prevRange.from, prevRange.to),
      ]);
      setSettlements(curr);
      setPrevSettlements(prev);

      // Build filter options
      const allRows = [...curr, ...prev];
      setCustomerOptions([...new Set(allRows.map(r => r.customer).filter(Boolean))].sort());
      setTransportTypeOptions([...new Set(allRows.map(r => r.transportType).filter(Boolean))].sort());
      if (companyOptions.length === 0) {
        setCompanyOptions([...new Set(allRows.map(r => r.company).filter(Boolean))].sort());
      }
      if (productOptions.length === 0) {
        setProductOptions([...new Set(allRows.map(r => r.product).filter(Boolean))].sort());
      }
    } catch {
      toast.error('정산 데이터를 불러오지 못했습니다.');
    } finally {
      setStlLoading(false);
    }
  }, [dateRange, prevRange, fetchSettlementRange]);

  // ── Effects ──
  useEffect(() => { fetchUnitPrices(); }, []);
  useEffect(() => { if (activeTab === 'settlement') loadSettlements(); }, [activeTab, dateRange.from, dateRange.to]);

  // ── Filtered data ──
  const filteredPrices = useMemo(() => {
    let r = unitPrices;
    if (upFilterCompany) r = r.filter(p => p.company === upFilterCompany);
    if (upFilterProduct) r = r.filter(p => p.product === upFilterProduct);
    return r;
  }, [unitPrices, upFilterCompany, upFilterProduct]);

  const filteredSettlements = useMemo(() => {
    let r = settlements;
    if (stlFilterCompany) r = r.filter(s => s.company === stlFilterCompany);
    if (stlFilterCustomer) r = r.filter(s => s.customer === stlFilterCustomer);
    if (stlFilterTransport) r = r.filter(s => s.transportType === stlFilterTransport);
    if (stlFilterProduct) r = r.filter(s => s.product === stlFilterProduct);
    return r;
  }, [settlements, stlFilterCompany, stlFilterCustomer, stlFilterTransport, stlFilterProduct]);

  const stlTotals = useMemo(() => ({
    count: filteredSettlements.length,
    totalWeight: filteredSettlements.reduce((s, r) => s + r.weightNet, 0),
    totalFee: filteredSettlements.reduce((s, r) => s + r.transportFee, 0),
    totalTax: filteredSettlements.reduce((s, r) => s + r.tax, 0),
    totalAll: filteredSettlements.reduce((s, r) => s + r.totalFee, 0),
  }), [filteredSettlements]);

  const prevTotals = useMemo(() => ({
    count: prevSettlements.length,
    totalWeight: prevSettlements.reduce((s, r) => s + r.weightNet, 0),
    totalFee: prevSettlements.reduce((s, r) => s + r.transportFee, 0),
    totalAll: prevSettlements.reduce((s, r) => s + r.totalFee, 0),
  }), [prevSettlements]);

  const dashCompany = useMemo(() => groupBy(filteredSettlements, 'company'), [filteredSettlements]);
  const dashCustomer = useMemo(() => groupBy(filteredSettlements, 'customer'), [filteredSettlements]);
  const dashProduct = useMemo(() => groupBy(filteredSettlements, 'product'), [filteredSettlements]);
  const prevCompany = useMemo(() => groupBy(prevSettlements, 'company'), [prevSettlements]);
  const prevCustomer = useMemo(() => groupBy(prevSettlements, 'customer'), [prevSettlements]);
  const prevProduct = useMemo(() => groupBy(prevSettlements, 'product'), [prevSettlements]);

  // ── Handlers ──
  const savePriceEdit = async () => {
    if (!editingPriceId) return;
    try {
      const { error } = await supabase.from('unit_prices').update({ price: editingPriceValue }).eq('id', editingPriceId);
      if (error) throw error;
      setUnitPrices(prev => prev.map(p => p.id === editingPriceId ? { ...p, price: editingPriceValue } : p));
      toast.success('단가가 수정되었습니다.');
    } catch {
      toast.error('단가 수정 중 오류가 발생했습니다.');
    } finally {
      setEditingPriceId(null);
    }
  };

  const handleExcelUnitPrice = () => {
    exportToExcel(filteredPrices as unknown as Record<string, unknown>[], [
      { key: 'company', header: '운송사' }, { key: 'product', header: '제품명' },
      { key: 'price', header: '단가(원)' }, { key: 'effective_date', header: '적용시작일' },
      { key: 'end_date', header: '적용종료일' }, { key: 'memo', header: '메모' },
    ], `단가관리`);
  };

  const handleExcelSettlement = () => {
    exportToExcel(filteredSettlements as unknown as Record<string, unknown>[], [
      { key: 'date', header: '날짜' }, { key: 'company', header: '운송사' },
      { key: 'customer', header: '거래처' }, { key: 'transportType', header: '운송구분' },
      { key: 'product', header: '제품명' }, { key: 'weightNet', header: '계근수량' },
      { key: 'unitPrice', header: '단가(원)' }, { key: 'transportFee', header: '운송료(원)' },
      { key: 'tax', header: '세액(원)' }, { key: 'totalFee', header: '운송료합계(원)' },
    ], `정산관리_${dateRange.label}`);
  };

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  // ── Inline styles used only for dynamic/computed values ──
  const thStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#475569',
    backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0',
    textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  };
  const tdStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9' };
  const tdR: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  const spinner = (
    <div className="flex items-center justify-center h-48 gap-2.5">
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite' }} />
      <span className="text-sm text-gray-500">데이터를 불러오는 중...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── 조회구분 선택 UI ──
  const renderPeriodSelector = () => {
    const periods: { value: PeriodFilter; label: string }[] = [
      { value: 'monthly', label: '월별' },
      { value: 'quarterly', label: '분기별' },
      { value: 'semi-annual', label: '반기별' },
      { value: 'annual', label: '연간' },
    ];

    return (
      <>
        {/* 조회구분 */}
        <div>
          <label className="block text-[13px] font-semibold text-slate-600 mb-1">조회구분</label>
          <div className="grid grid-cols-2 gap-1">
            {periods.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStlPeriodFilter(opt.value)}
                style={{
                  fontSize: 12, padding: '5px 0', borderRadius: 5, cursor: 'pointer', fontWeight: 600,
                  border: stlPeriodFilter === opt.value ? '2px solid #2563eb' : '1px solid #d1d5db',
                  background: stlPeriodFilter === opt.value ? '#eff6ff' : '#fff',
                  color: stlPeriodFilter === opt.value ? '#1d4ed8' : '#6b7280',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 년도 */}
        <div>
          <label className="block text-[13px] font-semibold text-slate-600 mb-1">년도</label>
          <select
            value={stlYear}
            onChange={e => setStlYear(Number(e.target.value))}
            className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>

        {/* 월별: 월 선택 */}
        {stlPeriodFilter === 'monthly' && (
          <div>
            <label className="block text-[13px] font-semibold text-slate-600 mb-1">월</label>
            <select
              value={stlMonth}
              onChange={e => setStlMonth(Number(e.target.value))}
              className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
        )}

        {/* 분기별: 분기 선택 */}
        {stlPeriodFilter === 'quarterly' && (
          <div>
            <label className="block text-[13px] font-semibold text-slate-600 mb-1">분기</label>
            <div className="grid grid-cols-2 gap-1">
              {[
                { q: 1, label: '1분기', months: '1~3월', m: 1 },
                { q: 2, label: '2분기', months: '4~6월', m: 4 },
                { q: 3, label: '3분기', months: '7~9월', m: 7 },
                { q: 4, label: '4분기', months: '10~12월', m: 10 },
              ].map(opt => {
                const isActive = Math.ceil(stlMonth / 3) === opt.q;
                return (
                  <button
                    key={opt.q}
                    onClick={() => setStlMonth(opt.m)}
                    style={{
                      fontSize: 11, padding: '6px 4px', borderRadius: 5, cursor: 'pointer',
                      border: isActive ? '2px solid #2563eb' : '1px solid #d1d5db',
                      background: isActive ? '#eff6ff' : '#fff',
                      color: isActive ? '#1d4ed8' : '#6b7280',
                      fontWeight: isActive ? 700 : 500,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    }}
                  >
                    <span>{opt.label}</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>{opt.months}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 반기별: 상/하반기 선택 */}
        {stlPeriodFilter === 'semi-annual' && (
          <div>
            <label className="block text-[13px] font-semibold text-slate-600 mb-1">반기</label>
            <div className="grid grid-cols-2 gap-1">
              {[
                { half: 1, label: '상반기', months: '1~6월', m: 1 },
                { half: 2, label: '하반기', months: '7~12월', m: 7 },
              ].map(opt => {
                const isActive = stlMonth <= 6 ? opt.half === 1 : opt.half === 2;
                return (
                  <button
                    key={opt.half}
                    onClick={() => setStlMonth(opt.m)}
                    style={{
                      fontSize: 12, padding: '8px 4px', borderRadius: 5, cursor: 'pointer',
                      border: isActive ? '2px solid #2563eb' : '1px solid #d1d5db',
                      background: isActive ? '#eff6ff' : '#fff',
                      color: isActive ? '#1d4ed8' : '#6b7280',
                      fontWeight: isActive ? 700 : 500,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}
                  >
                    <span>{opt.label}</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{opt.months}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 연간: 추가 선택 불필요 → 안내 표시 */}
        {stlPeriodFilter === 'annual' && (
          <div className="px-2 py-1.5 rounded-md bg-slate-100 text-[12px] text-slate-500 text-center">
            {stlYear}년 1~12월 전체
          </div>
        )}

        {/* 현재 조회 범위 표시 */}
        <div
          style={{ background: 'linear-gradient(135deg, #eff6ff, #f5f3ff)', border: '1px solid #c7d2fe' }}
          className="p-2 rounded-lg text-center"
        >
          <div className="text-[10px] text-gray-500 mb-0.5">조회 범위</div>
          <div className="text-[12px] font-bold text-blue-700">{dateRange.label}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {dateRange.from} ~ {dateRange.to}
          </div>
        </div>
      </>
    );
  };

  // ── Bar chart ──
  const renderHBarChart = (title: string, current: GroupSummary[], previous: GroupSummary[], mode: 'fee' | 'weight') => {
    const getVal = (item: GroupSummary) => mode === 'fee' ? item.totalFee : item.totalWeight;
    const top = [...current].sort((a, b) => getVal(b) - getVal(a)).slice(0, 10);
    const allVals = [...top.map(getVal), ...top.map(t => { const p = previous.find(pp => pp.name === t.name); return p ? getVal(p) : 0; })];
    const maxVal = Math.max(...allVals, 1);
    return (
      <div>
        <div className="text-[12px] font-bold text-slate-600 mb-2">
          {title} {mode === 'fee' ? '(정산금액)' : '(계근수량)'}
        </div>
        <div className="flex flex-col gap-1.5">
          {top.map(item => {
            const prev = previous.find(p => p.name === item.name);
            const cur = getVal(item), prv = prev ? getVal(prev) : 0;
            const diff = prv > 0 ? ((cur - prv) / prv * 100) : 0;
            return (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-16 text-[11px] font-semibold text-slate-700 text-right shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</div>
                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <div style={{ height: 14, borderRadius: 3, background: '#3b82f6', width: `${Math.max((cur / maxVal) * 100, 1)}%`, transition: 'width 0.3s' }} />
                    <span className="text-[10px] text-blue-500 font-semibold whitespace-nowrap">{mode === 'fee' ? fmt(Math.round(cur / 10000)) + '만' : cur.toFixed(1) + 't'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div style={{ height: 10, borderRadius: 3, background: '#cbd5e1', width: `${Math.max((prv / maxVal) * 100, 0.5)}%`, transition: 'width 0.3s' }} />
                    <span className="text-[9px] text-slate-400 whitespace-nowrap">{mode === 'fee' ? fmt(Math.round(prv / 10000)) + '만' : prv.toFixed(1) + 't'}</span>
                    {prv > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: diff >= 0 ? '#16a34a' : '#ef4444' }}>{diff >= 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(0)}%</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
          <div className="flex items-center gap-0.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span>당기</span></div>
          <div className="flex items-center gap-0.5"><div className="w-2.5 h-2.5 rounded-sm bg-slate-300" /><span>전기 ({prevRange.label})</span></div>
        </div>
      </div>
    );
  };

  // ── Pie chart ──
  const renderPieChart = (title: string, data: GroupSummary[], mode: 'fee' | 'weight') => {
    const getVal = (item: GroupSummary) => mode === 'fee' ? item.totalFee : item.totalWeight;
    const sorted = [...data].sort((a, b) => getVal(b) - getVal(a));
    const top8 = sorted.slice(0, 8);
    const rest = sorted.slice(8);
    const items = [...top8.map(d => ({ name: d.name, value: getVal(d) }))];
    if (rest.length > 0) items.push({ name: '기타', value: rest.reduce((s, d) => s + getVal(d), 0) });
    const total = items.reduce((s, i) => s + i.value, 0);
    if (total === 0) return <div className="text-[12px] text-gray-400 text-center py-5">데이터 없음</div>;
    let cumPct = 0;
    const segs = items.map((item, i) => { const pct = (item.value / total) * 100; const s = `${CHART_COLORS[i % CHART_COLORS.length]} ${cumPct}% ${cumPct + pct}%`; cumPct += pct; return s; });
    return (
      <div className="flex flex-col items-center">
        <div className="text-[12px] font-bold text-slate-600 mb-2.5">{title}</div>
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${segs.join(', ')})`, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-2.5 max-w-[260px] justify-center">
          {items.map((item, i) => (
            <div key={item.name} className="flex items-center gap-0.5 text-[10px]">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
              <span className="text-slate-600 whitespace-nowrap">{item.name}</span>
              <span className="text-gray-400">({((item.value / total) * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-gray-200 bg-white pl-4 shrink-0">
        <button
          onClick={() => setActiveTab('settlement')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer bg-transparent border-0 ${
            activeTab === 'settlement' ? 'text-blue-600 border-blue-600 font-bold' : 'text-gray-500 border-transparent'
          }`}
        >
          정산관리
        </button>
        <button
          onClick={() => setActiveTab('unitprice')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer bg-transparent border-0 ${
            activeTab === 'unitprice' ? 'text-blue-600 border-blue-600 font-bold' : 'text-gray-500 border-transparent'
          }`}
        >
          단가관리
        </button>
      </div>

      {/* ═══ 단가관리 탭 ═══ */}
      {activeTab === 'unitprice' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Filter Sidebar */}
          {!upFilterCollapsed && (
            <div className="w-44 md:w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-auto">
              <div
                style={{ background: 'linear-gradient(135deg, #1e293b, #334155)' }}
                className="px-3 py-2.5 flex justify-between items-center"
              >
                <span className="text-[13px] font-bold text-white">🔍 조회 조건</span>
                <button
                  onClick={() => setUpFilterCollapsed(true)}
                  className="text-[12px] text-slate-400 cursor-pointer bg-transparent border-none"
                >
                  접기 ◀
                </button>
              </div>
              <div className="p-3 flex flex-col gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">운송사</label>
                  <select
                    value={upFilterCompany}
                    onChange={e => setUpFilterCompany(e.target.value)}
                    className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
                  >
                    <option value="">[전체]</option>
                    {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">제품명</label>
                  <select
                    value={upFilterProduct}
                    onChange={e => setUpFilterProduct(e.target.value)}
                    className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
                  >
                    <option value="">[전체]</option>
                    {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <button
                  onClick={fetchUnitPrices}
                  className="w-full py-2 rounded-lg border-none cursor-pointer font-semibold text-[13px] bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  새로고침
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Title Bar */}
            <div className="flex flex-wrap items-center justify-between px-3 md:px-4 py-2 border-b border-gray-200 bg-white gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {upFilterCollapsed && (
                  <button
                    onClick={() => setUpFilterCollapsed(false)}
                    className="text-[13px] px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-md cursor-pointer text-slate-600 font-semibold"
                  >
                    필터 ▶
                  </button>
                )}
                <div className="w-1 h-5 rounded-sm bg-blue-600 shrink-0" />
                <h1 className="text-sm md:text-base font-bold text-gray-900">단가관리</h1>
                <span className="text-[13px] px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 font-bold text-blue-700">
                  {filteredPrices.length}건
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={handleExcelUnitPrice}
                  className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  엑셀내보내기
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <div className="overflow-x-auto">
                {upLoading ? spinner : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>#</th>
                        <th style={{ ...thStyle, minWidth: 90 }}>운송사</th>
                        <th style={{ ...thStyle, minWidth: 160 }}>제품명</th>
                        <th style={{ ...thStyle, minWidth: 120, textAlign: 'right' }}>단가(원)</th>
                        <th style={{ ...thStyle, minWidth: 100 }}>적용시작일</th>
                        <th style={{ ...thStyle, minWidth: 100 }}>적용종료일</th>
                        <th style={{ ...thStyle, minWidth: 140 }}>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPrices.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                            단가 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : filteredPrices.map((row, idx) => (
                        <tr
                          key={row.id}
                          style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0f7ff'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 0 ? '#fff' : '#fafbfc'; }}
                        >
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                          <td style={tdStyle}>
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[12px] font-semibold text-slate-700">
                              {row.company}
                            </span>
                          </td>
                          <td style={tdStyle}>{row.product}</td>
                          <td style={{ ...tdR, fontWeight: 600 }}>
                            {editingPriceId === row.id ? (
                              <div className="flex items-center gap-1 justify-end">
                                <input
                                  type="number"
                                  value={editingPriceValue}
                                  onChange={e => setEditingPriceValue(parseInt(e.target.value) || 0)}
                                  onKeyDown={e => { if (e.key === 'Enter') savePriceEdit(); if (e.key === 'Escape') setEditingPriceId(null); }}
                                  autoFocus
                                  className="w-24 text-[13px] px-1.5 py-0.5 rounded border-2 border-blue-500 text-right outline-none"
                                />
                                <button onClick={savePriceEdit} className="text-[11px] px-1.5 py-0.5 rounded border-none bg-green-600 text-white cursor-pointer">저장</button>
                                <button onClick={() => setEditingPriceId(null)} className="text-[11px] px-1.5 py-0.5 rounded border border-gray-300 bg-white text-gray-500 cursor-pointer">취소</button>
                              </div>
                            ) : (
                              <span
                                onClick={() => { setEditingPriceId(row.id); setEditingPriceValue(row.price); }}
                                style={{ cursor: 'pointer', color: row.price === 0 ? '#d1d5db' : '#1e293b' }}
                                title="클릭하여 수정"
                              >
                                {fmt(row.price)}
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{row.effective_date}</td>
                          <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{row.end_date ?? '-'}</td>
                          <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{row.memo ?? '-'}</td>
                        </tr>
                      ))}
                      {filteredPrices.length > 0 && (
                        <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                          <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', color: '#334155' }}>합계 ({filteredPrices.length}건)</td>
                          <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>{fmt(filteredPrices.reduce((s, p) => s + p.price, 0))}</td>
                          <td colSpan={3} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 정산관리 탭 ═══ */}
      {activeTab === 'settlement' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Filter Panel */}
          {!stlFilterCollapsed && (
            <div className="w-44 md:w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-auto">
              <div
                style={{ background: 'linear-gradient(135deg, #1e293b, #334155)' }}
                className="px-3 py-2.5 flex justify-between items-center"
              >
                <span className="text-[13px] font-bold text-white">🔍 조회 조건</span>
                <button
                  onClick={() => setStlFilterCollapsed(true)}
                  className="text-[12px] text-slate-400 cursor-pointer bg-transparent border-none"
                >
                  접기 ◀
                </button>
              </div>
              <div className="p-3 flex flex-col gap-3">
                {renderPeriodSelector()}

                <div className="h-px bg-gray-200" />

                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">운송사</label>
                  <select
                    value={stlFilterCompany}
                    onChange={e => setStlFilterCompany(e.target.value)}
                    className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
                  >
                    <option value="">[전체]</option>
                    {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">거래처</label>
                  <select
                    value={stlFilterCustomer}
                    onChange={e => setStlFilterCustomer(e.target.value)}
                    className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
                  >
                    <option value="">[전체]</option>
                    {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">운송구분</label>
                  <select
                    value={stlFilterTransport}
                    onChange={e => setStlFilterTransport(e.target.value)}
                    className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
                  >
                    <option value="">[전체]</option>
                    {transportTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">제품명</label>
                  <select
                    value={stlFilterProduct}
                    onChange={e => setStlFilterProduct(e.target.value)}
                    className="w-full text-[13px] py-1.5 px-2 rounded-md border border-gray-300 bg-white outline-none"
                  >
                    <option value="">[전체]</option>
                    {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => { setStlFilterCompany(''); setStlFilterCustomer(''); setStlFilterTransport(''); setStlFilterProduct(''); }}
                  className="w-full text-[13px] py-2 rounded-lg border-none cursor-pointer font-bold bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                >
                  필터 초기화
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Title Bar */}
            <div className="flex flex-wrap items-center justify-between px-3 md:px-4 py-2 border-b border-gray-200 bg-white gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {stlFilterCollapsed && (
                  <button
                    onClick={() => setStlFilterCollapsed(false)}
                    className="text-[13px] px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-md cursor-pointer text-slate-600 font-semibold"
                  >
                    필터 ▶
                  </button>
                )}
                <div className="w-1 h-5 rounded-sm bg-blue-600 shrink-0" />
                <h1 className="text-sm md:text-base font-bold text-gray-900">정산 대시보드</h1>
                <span className="text-[13px] px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 font-bold text-blue-700">
                  {dateRange.label}
                </span>
                {stlLoading && (
                  <div className="flex items-center gap-1">
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite' }} />
                    <span className="text-[12px] text-gray-500">로딩...</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleExcelSettlement}
                className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                엑셀내보내기
              </button>
            </div>

            {/* Dashboard */}
            <div className="flex-1 overflow-auto p-3 md:p-4 bg-slate-50">
              {/* KPI Cards — 1 col mobile, 2 col tablet, 4 col desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4 md:mb-5">
                {[
                  { label: '총 건수', value: `${fmt(stlTotals.count)}건`, prev: `전기 ${fmt(prevTotals.count)}건`, color: '#2563eb', bg: '#eff6ff', icon: '📋' },
                  { label: '총 계근수량', value: `${stlTotals.totalWeight.toFixed(1)} 톤`, prev: `전기 ${prevTotals.totalWeight.toFixed(1)}톤`, color: '#16a34a', bg: '#f0fdf4', icon: '⚖️' },
                  { label: '총 운송료 (공급가액)', value: `${fmt(stlTotals.totalFee)} 원`, prev: `전기 ${fmt(prevTotals.totalFee)}원`, color: '#d97706', bg: '#fefce8', icon: '💰' },
                  { label: '총 합계 (세포함)', value: `${fmt(stlTotals.totalAll)} 원`, prev: `전기 ${fmt(prevTotals.totalAll)}원`, color: '#7c3aed', bg: '#f5f3ff', icon: '📊' },
                ].map(card => (
                  <div
                    key={card.label}
                    style={{ background: card.bg }}
                    className="px-3 py-3 md:px-4 md:py-3.5 rounded-xl border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-base md:text-lg">{card.icon}</span>
                      <span className="text-[11px] md:text-[12px] text-gray-500 font-medium">{card.label}</span>
                    </div>
                    <div style={{ color: card.color }} className="text-lg md:text-xl font-bold mb-0.5 tabular-nums">
                      {card.value}
                    </div>
                    <div className="text-[11px] text-gray-400">{card.prev}</div>
                  </div>
                ))}
              </div>

              {stlLoading ? spinner : (
                <>
                  {/* Charts Row 1 — 1 col mobile, 2 col desktop */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-3.5 pb-2 border-b border-slate-100">
                        <span>🚛</span>
                        <span className="text-sm font-bold text-slate-800">운송사별 정산현황</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                        {renderHBarChart('운송사', dashCompany, prevCompany, 'fee')}
                        {renderHBarChart('운송사', dashCompany, prevCompany, 'weight')}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-3.5 pb-2 border-b border-slate-100">
                        <span>🏢</span>
                        <span className="text-sm font-bold text-slate-800">거래처별 정산현황</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                        {renderHBarChart('거래처', dashCustomer, prevCustomer, 'fee')}
                        {renderHBarChart('거래처', dashCustomer, prevCustomer, 'weight')}
                      </div>
                    </div>
                  </div>

                  {/* Charts Row 2 — 1 col mobile, 2 col desktop */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-3.5 pb-2 border-b border-slate-100">
                        <span>📦</span>
                        <span className="text-sm font-bold text-slate-800">제품별 정산현황</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                        {renderHBarChart('제품', dashProduct, prevProduct, 'fee')}
                        {renderHBarChart('제품', dashProduct, prevProduct, 'weight')}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-3.5 pb-2 border-b border-slate-100">
                        <span>🥧</span>
                        <span className="text-sm font-bold text-slate-800">거래처별 구성비</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {renderPieChart('정산금액 비율', dashCustomer, 'fee')}
                        {renderPieChart('계근수량 비율', dashCustomer, 'weight')}
                      </div>
                    </div>
                  </div>

                  {/* Detail Table */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div
                      onClick={() => setStlDetailOpen(!stlDetailOpen)}
                      className="flex items-center justify-between px-4 py-3 cursor-pointer bg-slate-50 border-b border-transparent hover:bg-slate-100 transition-colors"
                      style={{ borderBottom: stlDetailOpen ? '1px solid #e5e7eb' : 'none' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-gray-500">{stlDetailOpen ? '▼' : '▶'}</span>
                        <span className="text-sm font-bold text-slate-700">세부 데이터</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                          {filteredSettlements.length}건
                        </span>
                      </div>
                      <span className="text-[12px] text-gray-400">{stlDetailOpen ? '접기' : '펼치기'}</span>
                    </div>
                    {stlDetailOpen && (
                      <div style={{ maxHeight: 500 }} className="overflow-auto">
                        {filteredSettlements.length === 0 ? (
                          <div className="flex items-center justify-center h-28 text-gray-400 text-[13px]">
                            조회된 데이터가 없습니다.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                              <thead>
                                <tr>
                                  <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>#</th>
                                  <th style={{ ...thStyle, minWidth: 90 }}>날짜</th>
                                  <th style={{ ...thStyle, minWidth: 70 }}>운송사</th>
                                  <th style={{ ...thStyle, minWidth: 150 }}>거래처</th>
                                  <th style={{ ...thStyle, minWidth: 60 }}>운송구분</th>
                                  <th style={{ ...thStyle, minWidth: 130 }}>제품명</th>
                                  <th style={{ ...thStyle, minWidth: 80, textAlign: 'right' }}>계근수량</th>
                                  <th style={{ ...thStyle, minWidth: 90, textAlign: 'right' }}>단가(원)</th>
                                  <th style={{ ...thStyle, minWidth: 110, textAlign: 'right' }}>운송료(원)</th>
                                  <th style={{ ...thStyle, minWidth: 90, textAlign: 'right' }}>세액(원)</th>
                                  <th style={{ ...thStyle, minWidth: 120, textAlign: 'right' }}>합계(원)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredSettlements.map((row, idx) => (
                                  <tr
                                    key={row.id}
                                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0f7ff'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 0 ? '#fff' : '#fafbfc'; }}
                                  >
                                    <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                                    <td style={{ ...tdStyle, fontSize: 12, color: '#475569' }}>{row.date}</td>
                                    <td style={tdStyle}>
                                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[12px] font-semibold text-slate-700">
                                        {row.company}
                                      </span>
                                    </td>
                                    <td style={tdStyle}>{row.customer}</td>
                                    <td style={tdStyle}>
                                      <span style={{
                                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                                        background: row.transportType === '탱크' ? '#dbeafe' : row.transportType === '카고' ? '#fef3c7' : '#fce7f3',
                                        color: row.transportType === '탱크' ? '#1e40af' : row.transportType === '카고' ? '#92400e' : '#9d174d',
                                      }}>
                                        {row.transportType}
                                      </span>
                                    </td>
                                    <td style={tdStyle}>{row.product}</td>
                                    <td style={tdR}>{row.weightNet.toFixed(2)}</td>
                                    <td style={tdR}>{fmt(row.unitPrice)}</td>
                                    <td style={{ ...tdR, fontWeight: 600 }}>{fmt(row.transportFee)}</td>
                                    <td style={tdR}>{fmt(row.tax)}</td>
                                    <td style={{ ...tdR, fontWeight: 700, color: '#1d4ed8' }}>{fmt(row.totalFee)}</td>
                                  </tr>
                                ))}
                                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                                  <td colSpan={6} style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', color: '#334155' }}>합계 ({filteredSettlements.length}건)</td>
                                  <td style={{ ...tdR, fontWeight: 700 }}>{stlTotals.totalWeight.toFixed(2)}</td>
                                  <td style={tdR} />
                                  <td style={{ ...tdR, fontWeight: 700 }}>{fmt(stlTotals.totalFee)}</td>
                                  <td style={{ ...tdR, fontWeight: 700 }}>{fmt(stlTotals.totalTax)}</td>
                                  <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>{fmt(stlTotals.totalAll)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
