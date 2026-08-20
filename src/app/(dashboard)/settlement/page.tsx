'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/utils/exportExcel';
import { downloadWehago, type WehagoRow } from '@/lib/utils/exportWehago';
import TransactionStatementPrint from '@/components/modules/settlement/TransactionStatementPrint';
import SettlementAnalysis from '@/components/modules/settlement/SettlementAnalysis';
import MultiSelectFilter from '@/components/ui/MultiSelectFilter';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { computeAnalysis, toSettlementLines, type AnalysisPayload, type PeriodMode } from '@/lib/analysis/settlementAnalysis';

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
    case 'daily': {
      const t = new Date();
      const ds = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
      return { from: ds, to: ds, label: `${ds} (당일)` };
    }
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
    case 'daily': {
      const pad = (n: number) => String(n).padStart(2, '0');
      const t = new Date();
      t.setDate(t.getDate() - 1);
      const ds = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
      return { from: ds, to: ds, label: `${ds} (전일)` };
    }
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
type PeriodFilter = 'daily' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual';

// ── Component ──────────────────────────────────────────
export default function SettlementPage() {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  // 운송사 역할은 접근 불가
  if (profile?.role === 'transporter') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-600">접근 권한이 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">이 페이지는 관리자 전용입니다.</p>
        </div>
      </div>
    );
  }

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
  const [stlPeriodFilter, setStlPeriodFilter] = useState<PeriodFilter>('daily');
  const [stlFilterCompany, setStlFilterCompany] = useState<string[]>([]);
  const [stlFilterCustomer, setStlFilterCustomer] = useState<string[]>([]);
  const [stlFilterTransport, setStlFilterTransport] = useState<string[]>([]);
  const [stlFilterProduct, setStlFilterProduct] = useState<string[]>([]);
  const [stlFilterCollapsed, setStlFilterCollapsed] = useState(false);
  const [stlDetailOpen, setStlDetailOpen] = useState(true);
  const [stlLoading, setStlLoading] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [prevSettlements, setPrevSettlements] = useState<SettlementRow[]>([]);

  // ── 기간분석 리포트 ──
  const [analysisPayload, setAnalysisPayload] = useState<AnalysisPayload | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const isAdmin = profile?.role === 'admin';

  // ── 정산 확정/이력 ──
  interface Closing { id: string; period_label: string; period_type: string; period_from: string; period_to: string; scope_company: string | null; row_count: number; total_weight: number; total_fee: number; total_tax: number; total_all: number; confirmed_by_name: string | null; confirmed_at: string; memo: string | null; }
  const [showHistory, setShowHistory] = useState(false);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [closingsLoading, setClosingsLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
      // Supabase 1000행 제한 → 페이징 조회
      const UP_PAGE = 1000;
      let allUpData: Record<string, unknown>[] = [];
      let upPage = 0;
      let upMore = true;
      while (upMore) {
        const { data: chunk, error: chunkErr } = await supabase
          .from('unit_prices')
          .select(`*, transport_companies(id, name), products(id, name)`)
          .eq('is_active', true)
          .order('company_id')
          .range(upPage * UP_PAGE, (upPage + 1) * UP_PAGE - 1);
        if (chunkErr) throw chunkErr;
        const chunkRows = chunk || [];
        allUpData = [...allUpData, ...chunkRows];
        upMore = chunkRows.length === UP_PAGE;
        upPage++;
      }

      const rows: UnitPriceDisplay[] = ((allUpData as unknown as UnitPriceRow[]) || []).map(r => ({
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
      // Supabase 기본 limit 1000건 → 전체 데이터 페이징 조회
      const PAGE_SIZE = 1000;
      let allShipData: Record<string, unknown>[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const start = page * PAGE_SIZE;
        const end = start + PAGE_SIZE - 1;
        const { data: chunk, error: shipErr } = await supabase
          .from('v_shipments')
          .select('*')
          .gte('shipment_date', from)
          .lte('shipment_date', to)
          .order('shipment_date')
          .range(start, end);
        if (shipErr) throw shipErr;

        const rows = chunk || [];
        allShipData = [...allShipData, ...rows];
        hasMore = rows.length === PAGE_SIZE;
        page++;
      }

      const shipData = allShipData;

      // Supabase 1000행 제한 → 페이징 조회 (unit_prices)
      const PRICE_PAGE = 1000;
      let allPriceData: Record<string, unknown>[] = [];
      let pricePg = 0;
      let priceMore = true;
      while (priceMore) {
        // 활성 필터 없이 전체 단가 조회 → 출하월 기준 최신 단가로 매칭 (레거시 confirm은 미사용)
        const { data: priceChunk, error: priceChunkErr } = await supabase
          .from('unit_prices')
          .select(`company_id, customer_id, price, effective_date`)
          .range(pricePg * PRICE_PAGE, (pricePg + 1) * PRICE_PAGE - 1);
        if (priceChunkErr) throw priceChunkErr;
        const priceRows = priceChunk || [];
        allPriceData = [...allPriceData, ...priceRows];
        priceMore = priceRows.length === PRICE_PAGE;
        pricePg++;
      }

      // 단가 = 운송사 × 거래처 × 월 (레거시 unit_mst 구조). key = company_id::customer_id
      const priceList = new Map<string, { date: string; price: number }[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((allPriceData as unknown as any[]) || []).forEach(p => {
        const key = `${p.company_id}::${p.customer_id}`;
        const arr = priceList.get(key) || [];
        arr.push({ date: String(p.effective_date ?? ''), price: Number(p.price) || 0 });
        priceList.set(key, arr);
      });
      // 각 키의 단가를 유효일 내림차순 정렬
      priceList.forEach(arr => arr.sort((a, b) => b.date.localeCompare(a.date)));
      // 출하일에 유효한 단가(출하일 이전 최신 유효월) 조회, 없으면 가장 이른 단가
      const lookupPrice = (companyId: string, customerId: string, shipDate: string): number => {
        const arr = priceList.get(`${companyId}::${customerId}`);
        if (!arr || !arr.length) return 0;
        const eff = arr.find(x => x.date <= shipDate);
        return (eff ?? arr[arr.length - 1]).price;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((shipData || []) as any[]).map((s: any) => {
        const unitPrice = lookupPrice(s.company_id, s.customer_id, String(s.shipment_date ?? ''));
        const wt = Number(s.weight_net) || 0;
        const tt = s.transport_type ?? '';
        // 소수점 유지(반올림 없음): 운송료 = 단가×수량, 부가세 = 운송료×10%
        const fee = tt === '카고' ? unitPrice : unitPrice * wt;
        const tax = fee * 0.1;
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

  // ── 기간분석 리포트 생성 ──
  const openAnalysis = useCallback(async () => {
    if (settlements.length === 0) { toast.warning('분석할 정산 내역이 없습니다.'); return; }
    setAnalysisLoading(true);
    try {
      // 월별 추이: 연초 ~ 기간말 월별 집계 (엔진과 동일 어댑터로 정합 유지)
      const yearStart = `${dateRange.from.slice(0, 4)}-01-01`;
      const yearRows = await fetchSettlementRange(yearStart, dateRange.to);
      const monthMap = new Map<string, { freightTotal: number; totalTons: number }>();
      toSettlementLines(yearRows).forEach(l => {
        const e = monthMap.get(l.month) || { freightTotal: 0, totalTons: 0 };
        e.freightTotal += l.amount;
        e.totalTons += l.tons;
        monthMap.set(l.month, e);
      });
      const monthlySeries = [...monthMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, v]) => ({ month, ...v }));

      const modeMap: Record<PeriodFilter, PeriodMode> = {
        daily: 'month', monthly: 'month', quarterly: 'quarter', 'semi-annual': 'half', annual: 'year',
      };
      const now = new Date();
      const reportDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const payload = computeAnalysis(
        toSettlementLines(settlements),
        toSettlementLines(prevSettlements),
        { consultingCharge: 0, vatRate: 0.10, operationalNotes: [] },
        {
          company: '경기광업㈜', periodLabel: dateRange.label, periodKey: dateRange.from.slice(0, 7),
          prevLabel: prevRange.label, reportDate, supplier: '하멜코리아', mode: modeMap[stlPeriodFilter],
        },
        { monthlySeries },
      );
      setAnalysisPayload(payload);
    } catch {
      toast.error('분석 리포트 생성 중 오류가 발생했습니다.');
    } finally {
      setAnalysisLoading(false);
    }
  }, [settlements, prevSettlements, dateRange, prevRange, stlPeriodFilter, fetchSettlementRange]);

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
    if (stlFilterCompany.length) r = r.filter(s => stlFilterCompany.includes(s.company));
    if (stlFilterCustomer.length) r = r.filter(s => stlFilterCustomer.includes(s.customer));
    if (stlFilterTransport.length) r = r.filter(s => stlFilterTransport.includes(s.transportType));
    if (stlFilterProduct.length) r = r.filter(s => stlFilterProduct.includes(s.product));
    return r;
  }, [settlements, stlFilterCompany, stlFilterCustomer, stlFilterTransport, stlFilterProduct]);

  // ── 세부 테이블: 컬럼 정렬 + 컬럼별 검색 ──
  const [stlSort, setStlSort] = useState<{ key: keyof SettlementRow | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const [stlColFilter, setStlColFilter] = useState<Record<string, string>>({});
  const [stlOpenFilter, setStlOpenFilter] = useState<string | null>(null);
  const toggleStlSort = (key: keyof SettlementRow) =>
    setStlSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const displaySettlements = useMemo(() => {
    let r = filteredSettlements;
    const active = Object.entries(stlColFilter).filter(([, v]) => v.trim());
    if (active.length) {
      r = r.filter(row => active.every(([k, v]) =>
        String((row as unknown as Record<string, unknown>)[k] ?? '').toLowerCase().includes(v.trim().toLowerCase())));
    }
    if (stlSort.key) {
      const k = stlSort.key;
      r = [...r].sort((a, b) => {
        const av = a[k] as unknown, bv = b[k] as unknown;
        if (av == null && bv == null) return 0;
        if (av == null || av === '') return 1;
        if (bv == null || bv === '') return -1;
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av).localeCompare(String(bv), 'ko', { numeric: true });
      });
      if (stlSort.dir === 'desc') r.reverse();
    }
    return r;
  }, [filteredSettlements, stlColFilter, stlSort]);

  const displayTotals = useMemo(() => ({
    count: displaySettlements.length,
    totalWeight: displaySettlements.reduce((s, r) => s + r.weightNet, 0),
    totalFee: displaySettlements.reduce((s, r) => s + r.transportFee, 0),
    totalTax: displaySettlements.reduce((s, r) => s + r.tax, 0),
    totalAll: displaySettlements.reduce((s, r) => s + r.totalFee, 0),
  }), [displaySettlements]);

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

  // ── 정산 확정/이력 핸들러 ──
  const loadClosings = async () => {
    setClosingsLoading(true);
    try {
      const res = await fetch('/api/admin/settlement-closings', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setClosings(json.closings as Closing[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '정산 이력을 불러오지 못했습니다.');
    } finally {
      setClosingsLoading(false);
    }
  };

  const openHistory = () => { setShowHistory(true); loadClosings(); };

  const handleConfirmSettlement = async () => {
    if (filteredSettlements.length === 0) { toast.warning('확정할 정산 내역이 없습니다.'); return; }
    const scope = stlFilterCompany.length === 1 ? stlFilterCompany[0] : stlFilterCompany.length > 1 ? `${stlFilterCompany.length}개 운송사` : null;
    if (!confirm(`[${dateRange.label}] 정산을 확정하시겠습니까?\n\n· 대상: ${scope || '전체 운송사'}\n· ${fmt(stlTotals.count)}건 · ${stlTotals.totalWeight.toFixed(2)}톤\n· 청구총액 ${fmt(stlTotals.totalAll)}원\n\n확정 시점의 집계가 이력으로 기록됩니다.`)) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/admin/settlement-closings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_type: stlPeriodFilter, period_label: dateRange.label,
          period_from: dateRange.from, period_to: dateRange.to, scope_company: scope,
          row_count: stlTotals.count, total_weight: stlTotals.totalWeight,
          total_fee: stlTotals.totalFee, total_tax: stlTotals.totalTax, total_all: stlTotals.totalAll,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('정산이 확정되었습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '정산 확정 중 오류가 발생했습니다.');
    } finally {
      setConfirming(false);
    }
  };

  const handleRevokeClosing = async (id: string, label: string) => {
    if (!confirm(`[${label}] 확정을 취소하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/admin/settlement-closings/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('확정이 취소되었습니다.');
      await loadClosings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '취소 중 오류가 발생했습니다.');
    }
  };

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
    // 현재 화면(정렬·검색 반영) 그대로 내보내고, 맨 아래 합계 행 추가
    const rows: Record<string, unknown>[] = displaySettlements.map(r => ({
      date: r.date, company: r.company, customer: r.customer, transportType: r.transportType,
      product: r.product, weightNet: r.weightNet, unitPrice: r.unitPrice,
      transportFee: r.transportFee, tax: r.tax, totalFee: r.totalFee,
    }));
    rows.push({
      date: '합계', company: '', customer: '', transportType: '', product: `${displayTotals.count}건`,
      weightNet: displayTotals.totalWeight, unitPrice: '', transportFee: displayTotals.totalFee,
      tax: displayTotals.totalTax, totalFee: displayTotals.totalAll,
    });
    exportToExcel(rows, [
      { key: 'date', header: '날짜' }, { key: 'company', header: '운송사' },
      { key: 'customer', header: '거래처' }, { key: 'transportType', header: '운송구분' },
      { key: 'product', header: '제품명' }, { key: 'weightNet', header: '계근수량' },
      { key: 'unitPrice', header: '단가(원)' }, { key: 'transportFee', header: '운송료(원)' },
      { key: 'tax', header: '세액(원)' }, { key: 'totalFee', header: '운송료 합계(원)' },
    ], `정산관리_${dateRange.label}`);
  };

  // 금액/수량: 소수점 2자리까지 허용(있을 때만 표시), 반올림 없음
  const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

  // ── 위하고(SMART A) 출고처리 엑셀 내보내기 (조회 기간의 출하 건별, 우리 몫만) ──
  const [wehagoLoading, setWehagoLoading] = useState(false);
  const handleWehagoExport = async () => {
    setWehagoLoading(true);
    try {
      const PAGE = 1000;
      let all: Record<string, unknown>[] = [];
      let page = 0, more = true;
      while (more) {
        const { data, error } = await supabase
          .from('v_shipments')
          .select('shipment_date, customer_name, product_name, weight_net, vehicle_number, silo')
          .gte('shipment_date', dateRange.from).lte('shipment_date', dateRange.to)
          .order('shipment_date')
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw error;
        const rows = data || [];
        all = [...all, ...rows];
        more = rows.length === PAGE;
        page++;
      }
      if (all.length === 0) { toast.warning('해당 기간 출하 내역이 없습니다.'); return; }
      const rows: WehagoRow[] = (all as Record<string, unknown>[]).map(s => ({
        date: String(s.shipment_date ?? ''),
        customer: (s.customer_name as string) || '미지정',
        product: (s.product_name as string) || '',
        weight: Number(s.weight_net) || 0,
        vehicle: (s.vehicle_number as string) || '',
        silo: (s.silo as string) || '',
      }));
      const label = stlPeriodFilter === 'monthly' ? `${stlYear}-${String(stlMonth).padStart(2, '0')}` : dateRange.label.replace(/[^\w가-힣()~-]/g, '_');
      downloadWehago(rows, label);
      toast.success(`위하고 파일 생성 완료 (${rows.length}건)`);
    } catch {
      toast.error('위하고 내보내기 중 오류가 발생했습니다.');
    } finally {
      setWehagoLoading(false);
    }
  };

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
      { value: 'daily', label: '당일' },
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

                <MultiSelectFilter label="운송사" options={companyOptions} selected={stlFilterCompany} onChange={setStlFilterCompany} width={160} />
                <MultiSelectFilter label="거래처" options={customerOptions} selected={stlFilterCustomer} onChange={setStlFilterCustomer} width={200} />
                <MultiSelectFilter label="운송구분" options={transportTypeOptions} selected={stlFilterTransport} onChange={setStlFilterTransport} width={140} />
                <MultiSelectFilter label="제품명" options={productOptions} selected={stlFilterProduct} onChange={setStlFilterProduct} width={180} />
                <button
                  onClick={() => { setStlFilterCompany([]); setStlFilterCustomer([]); setStlFilterTransport([]); setStlFilterProduct([]); }}
                  className="text-[14px] py-2 px-3 rounded-lg border-none cursor-pointer font-bold bg-gray-500 text-white hover:bg-gray-600 transition-colors"
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
                <h1 className="text-sm md:text-base font-bold text-gray-900">정산관리 (당일)</h1>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={openAnalysis}
                  disabled={analysisLoading}
                  className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 text-white border-none hover:opacity-90 transition-opacity disabled:opacity-50"
                  title="기간분석 리포트 (월/분기/반기/연간)"
                >
                  {analysisLoading ? '분석 생성 중…' : '📊 기간분석 리포트'}
                </button>
                {isAdmin && (
                  <button
                    onClick={handleConfirmSettlement}
                    disabled={confirming}
                    className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-semibold bg-emerald-600 text-white border-none hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    title="현재 조회 기간의 정산을 확정하여 이력에 기록"
                  >
                    {confirming ? '확정 중…' : '✅ 정산 확정'}
                  </button>
                )}
                <button
                  onClick={openHistory}
                  className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-medium bg-white text-slate-700 border border-gray-300 hover:bg-gray-50 transition-colors"
                  title="정산 확정 이력"
                >
                  정산 이력
                </button>
                <button
                  onClick={() => {
                    if (filteredSettlements.length === 0) { toast.warning('출력할 정산 내역이 없습니다.'); return; }
                    setShowStatement(true);
                  }}
                  className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-medium bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition-colors"
                >
                  거래명세서
                </button>
                <button
                  onClick={handleExcelSettlement}
                  className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  엑셀내보내기
                </button>
                {isAdmin && (
                  <button
                    onClick={handleWehagoExport}
                    disabled={wehagoLoading}
                    className="text-[13px] px-3 py-1.5 rounded-lg cursor-pointer font-medium bg-teal-600 text-white border-none hover:bg-teal-700 transition-colors disabled:opacity-50"
                    title="조회 기간을 위하고(SMART A) 출고처리 업로드 양식으로 내보내기 (우리 몫만 채움)"
                  >
                    {wehagoLoading ? '생성 중…' : '위하고 내보내기'}
                  </button>
                )}
              </div>
            </div>

            {/* Dashboard */}
            <div className="flex-1 overflow-auto p-3 md:p-4 bg-slate-50">
              {/* KPI Cards — 1 col mobile, 2 col tablet, 4 col desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4 md:mb-5">
                {[
                  { label: '총 건수', value: `${fmt(stlTotals.count)}건`, prev: `전기 ${fmt(prevTotals.count)}건`, color: '#2563eb', bg: '#eff6ff', icon: '📋' },
                  { label: '총 계근수량', value: `${stlTotals.totalWeight.toFixed(2)} 톤`, prev: `전기 ${prevTotals.totalWeight.toFixed(2)}톤`, color: '#16a34a', bg: '#f0fdf4', icon: '⚖️' },
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
                  {/* 그래프는 대시보드로 이동 — 정산관리는 당일 그리드만 표시 (담당자 요청) */}
                  {false && (<>
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
                  </>)}

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
                                  {([
                                    { label: '#', w: 40, align: 'center' as const },
                                    { label: '날짜', key: 'date' as keyof SettlementRow, filter: true, minW: 90 },
                                    { label: '운송사', key: 'company' as keyof SettlementRow, filter: true, minW: 70 },
                                    { label: '거래처', key: 'customer' as keyof SettlementRow, filter: true, minW: 150 },
                                    { label: '운송구분', key: 'transportType' as keyof SettlementRow, filter: true, minW: 60 },
                                    { label: '제품명', key: 'product' as keyof SettlementRow, filter: true, minW: 130 },
                                    { label: '계근수량', key: 'weightNet' as keyof SettlementRow, align: 'right' as const, minW: 80 },
                                    { label: '단가(원)', key: 'unitPrice' as keyof SettlementRow, align: 'right' as const, minW: 90 },
                                    { label: '운송료(원)', key: 'transportFee' as keyof SettlementRow, align: 'right' as const, minW: 110 },
                                    { label: '세액(원)', key: 'tax' as keyof SettlementRow, align: 'right' as const, minW: 90 },
                                    { label: '합계(원)', key: 'totalFee' as keyof SettlementRow, align: 'right' as const, minW: 120 },
                                  ] as { label: string; key?: keyof SettlementRow; filter?: boolean; align?: 'left' | 'right' | 'center'; minW?: number; w?: number }[]).map(col => {
                                    const active = col.key && stlSort.key === col.key;
                                    const filtering = !!(col.key && stlColFilter[col.key]?.trim());
                                    return (
                                      <th key={col.label} style={{ ...thStyle, ...(col.w ? { width: col.w } : {}), ...(col.minW ? { minWidth: col.minW } : {}), textAlign: col.align || 'left', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                                          <span onClick={col.key ? () => toggleStlSort(col.key!) : undefined} style={{ cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}>
                                            {col.label}{active && <span style={{ color: '#2563eb', marginLeft: 2 }}>{stlSort.dir === 'asc' ? '▲' : '▼'}</span>}
                                          </span>
                                          {col.filter && (
                                            <span onClick={() => setStlOpenFilter(stlOpenFilter === col.key ? null : (col.key as string))} title="검색" style={{ cursor: 'pointer', color: filtering ? '#2563eb' : '#cbd5e1', fontSize: 12 }}>🔍</span>
                                          )}
                                        </div>
                                        {col.filter && stlOpenFilter === col.key && (
                                          <input autoFocus value={(col.key && stlColFilter[col.key]) || ''} placeholder="검색…"
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => setStlColFilter(p => ({ ...p, [col.key as string]: e.target.value }))}
                                            style={{ marginTop: 4, width: '100%', fontSize: 11, fontWeight: 400, padding: '3px 6px', border: '1px solid #93c5fd', borderRadius: 4, boxSizing: 'border-box' }} />
                                        )}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {displaySettlements.map((row, idx) => (
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
                                  <td colSpan={6} style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', color: '#334155' }}>합계 ({displayTotals.count}건)</td>
                                  <td style={{ ...tdR, fontWeight: 700 }}>{displayTotals.totalWeight.toFixed(2)}</td>
                                  <td style={tdR} />
                                  <td style={{ ...tdR, fontWeight: 700 }}>{fmt(displayTotals.totalFee)}</td>
                                  <td style={{ ...tdR, fontWeight: 700 }}>{fmt(displayTotals.totalTax)}</td>
                                  <td style={{ ...tdR, fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>{fmt(displayTotals.totalAll)}</td>
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

      {showStatement && (
        <TransactionStatementPrint
          customer={stlFilterCustomer.length === 1 ? stlFilterCustomer[0] : stlFilterCustomer.length > 1 ? `${stlFilterCustomer.length}개 거래처` : '전체 거래처'}
          periodLabel={dateRange.label}
          rows={filteredSettlements.map(s => ({
            date: s.date, product: s.product, transportType: s.transportType,
            weightNet: s.weightNet, unitPrice: s.unitPrice, transportFee: s.transportFee,
            tax: s.tax, totalFee: s.totalFee,
          }))}
          onClose={() => setShowStatement(false)}
        />
      )}

      {analysisPayload && (
        <SettlementAnalysis
          payload={analysisPayload}
          isAdmin={isAdmin}
          onClose={() => setAnalysisPayload(null)}
        />
      )}

      {/* ═══ 정산 확정 이력 모달 ═══ */}
      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 4, height: 20, background: '#059669', borderRadius: 2 }} />
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: 0 }}>정산 확정 이력</h3>
                <span className="text-[12px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">{closings.length}건</span>
              </div>
              <button onClick={() => setShowHistory(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>
            <div style={{ overflow: 'auto', padding: '4px 0' }}>
              {closingsLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>불러오는 중…</div>
              ) : closings.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>확정된 정산이 없습니다.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr>
                      {['확정기간', '대상', '건수', '총톤', '공급가액', '청구총액', '확정자', '확정일시', ''].map((h, i) => (
                        <th key={h} style={{ ...thStyle, textAlign: i >= 2 && i <= 5 ? 'right' : 'left', position: 'static' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closings.map((c, idx) => (
                      <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{c.period_label}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#475569' }}>{c.scope_company || '전체'}</td>
                        <td style={tdR}>{fmt(c.row_count)}</td>
                        <td style={tdR}>{Number(c.total_weight).toFixed(2)}</td>
                        <td style={tdR}>{fmt(Math.round(Number(c.total_fee)))}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: '#1d4ed8' }}>{fmt(Math.round(Number(c.total_all)))}</td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{c.confirmed_by_name || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{new Date(c.confirmed_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {isAdmin && (
                            <button onClick={() => handleRevokeClosing(c.id, c.period_label)}
                              style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer' }}>
                              취소
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
