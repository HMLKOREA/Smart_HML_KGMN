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
  is_active: boolean;
}

interface ShipmentRow {
  id: string;
  shipment_date: string;
  company_id: string | null;
  company_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  product_id: string | null;
  product_name: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  weight_net: number | null;
  transport_type: string | null;
  status: string | null;
  certificate_time: string | null;
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

// ── Group settlements by key ─────────────────────────
type GroupSummary = { name: string; totalFee: number; totalWeight: number };

function groupSettlementsByKey(rows: SettlementRow[], key: 'company' | 'customer' | 'product'): GroupSummary[] {
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

const CHART_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];

type TabKey = 'settlement' | 'unitprice';
type PeriodFilter = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';

// ── Component ──────────────────────────────────────────
export default function SettlementPage() {
  const supabase = createClient();
  const toast = useToast();

  // Tab
  const [activeTab, setActiveTab] = useState<TabKey>('settlement');

  // ── Unit Price State ──
  const [upMonth, setUpMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [upFilterCompany, setUpFilterCompany] = useState('');
  const [upFilterProduct, setUpFilterProduct] = useState('');
  const [upFilterCollapsed, setUpFilterCollapsed] = useState(false);
  const [confirmedMonths, setConfirmedMonths] = useState<Record<string, boolean>>({});
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<number>(0);

  // Loading states
  const [upLoading, setUpLoading] = useState(false);
  const [stlLoading, setStlLoading] = useState(false);

  // DB data
  const [unitPrices, setUnitPrices] = useState<UnitPriceDisplay[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [prevMonthSettlements, setPrevMonthSettlements] = useState<SettlementRow[]>([]);

  // Filter options derived from DB
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [transportTypeOptions, setTransportTypeOptions] = useState<string[]>([]);

  // ── Settlement State ──
  const [stlYear, setStlYear] = useState(() => String(new Date().getFullYear()));
  const [stlMonth, setStlMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [stlPeriodFilter, setStlPeriodFilter] = useState<PeriodFilter>('monthly');
  const [stlFilterCompany, setStlFilterCompany] = useState('');
  const [stlFilterCustomer, setStlFilterCustomer] = useState('');
  const [stlFilterTransport, setStlFilterTransport] = useState('');
  const [stlFilterProduct, setStlFilterProduct] = useState('');
  const [stlFilterCollapsed, setStlFilterCollapsed] = useState(false);
  const [stlDetailOpen, setStlDetailOpen] = useState(false);

  const isMonthConfirmed = confirmedMonths[upMonth] || false;

  // ── Settlement: date range calculation ──
  const stlDateRange = useMemo(() => {
    const y = stlYear;
    const m = stlMonth;
    switch (stlPeriodFilter) {
      case 'monthly':
        return { from: `${y}-${m}-01`, to: `${y}-${m}-31` };
      case 'quarterly': {
        const q = Math.ceil(parseInt(m) / 3);
        const startM = String((q - 1) * 3 + 1).padStart(2, '0');
        const endM = String(q * 3).padStart(2, '0');
        return { from: `${y}-${startM}-01`, to: `${y}-${endM}-31` };
      }
      case 'semi-annual': {
        const half = parseInt(m) <= 6 ? 1 : 2;
        return half === 1
          ? { from: `${y}-01-01`, to: `${y}-06-30` }
          : { from: `${y}-07-01`, to: `${y}-12-31` };
      }
      case 'annual':
        return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
  }, [stlYear, stlMonth, stlPeriodFilter]);

  const prevMonthRange = useMemo(() => {
    const m = parseInt(stlMonth);
    const y = parseInt(stlYear);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    const pmStr = String(pm).padStart(2, '0');
    return { from: `${py}-${pmStr}-01`, to: `${py}-${pmStr}-31` };
  }, [stlYear, stlMonth]);

  // ── Fetch unit prices ──
  const fetchUnitPrices = useCallback(async () => {
    setUpLoading(true);
    try {
      const { data, error } = await supabase
        .from('unit_prices')
        .select(`*,
          transport_companies(id, name),
          products(id, name)
        `)
        .eq('is_active', true)
        .order('company_id');

      if (error) throw error;

      const rows: UnitPriceDisplay[] = (data as UnitPriceRow[] || []).map(r => ({
        id: r.id,
        company_id: r.company_id,
        company: r.transport_companies?.name ?? '(알수없음)',
        product_id: r.product_id,
        product: r.products?.name ?? '(알수없음)',
        price: r.price,
        effective_date: r.effective_date,
        end_date: r.end_date,
        memo: r.memo,
        is_active: r.is_active,
      }));

      setUnitPrices(rows);

      // Build company/product options for filter
      const companies = [...new Set(rows.map(r => r.company))].sort();
      const products = [...new Set(rows.map(r => r.product))].sort();
      setCompanyOptions(companies);
      setProductOptions(products);
    } catch (err) {
      console.error('unit_prices fetch error:', err);
      toast.error('단가 데이터를 불러오지 못했습니다.');
    } finally {
      setUpLoading(false);
    }
  }, [supabase]);

  // ── Fetch settlements (v_shipments × unit_prices) ──
  const fetchSettlements = useCallback(async (dateFrom: string, dateTo: string) => {
    setStlLoading(true);
    try {
      // 1. Fetch shipments
      const { data: shipData, error: shipErr } = await supabase
        .from('v_shipments')
        .select('*')
        .gte('shipment_date', dateFrom)
        .lte('shipment_date', dateTo)
        .order('shipment_date');

      if (shipErr) throw shipErr;

      const shipments: ShipmentRow[] = shipData || [];

      // 2. Fetch all active unit prices for matching
      const { data: priceData, error: priceErr } = await supabase
        .from('unit_prices')
        .select(`*,
          transport_companies(id, name),
          products(id, name)
        `)
        .eq('is_active', true);

      if (priceErr) throw priceErr;

      const priceRows: UnitPriceRow[] = priceData || [];
      // Build a lookup map: company_id + product_id → price
      const priceMap = new Map<string, number>();
      priceRows.forEach(p => {
        const key = `${p.company_id}::${p.product_id}`;
        if (!priceMap.has(key)) {
          priceMap.set(key, p.price);
        }
      });

      // 3. Compute settlement rows
      const rows: SettlementRow[] = shipments.map(s => {
        const key = `${s.company_id}::${s.product_id}`;
        const unitPrice = priceMap.get(key) ?? 0;
        const weightNet = s.weight_net ?? 0;
        const transportType = s.transport_type ?? '';

        let transportFee: number;
        if (transportType === '카고') {
          transportFee = unitPrice; // 건당 고정 운임
        } else {
          transportFee = Math.round(unitPrice * weightNet); // 톤당 단가 × 중량
        }
        const tax = Math.round(transportFee * 0.1);
        const totalFee = transportFee + tax;

        return {
          id: s.id,
          date: s.shipment_date,
          company: s.company_name ?? '(알수없음)',
          customer: s.customer_name ?? '(알수없음)',
          transportType,
          product: s.product_name ?? '(알수없음)',
          weightNet,
          unitPrice,
          transportFee,
          tax,
          totalFee,
        };
      });

      return rows;
    } catch (err) {
      console.error('settlements fetch error:', err);
      toast.error('정산 데이터를 불러오지 못했습니다.');
      return [];
    } finally {
      setStlLoading(false);
    }
  }, [supabase]);

  // ── Initial load ──
  useEffect(() => {
    fetchUnitPrices();
  }, [fetchUnitPrices]);

  // ── Load settlements when date range changes ──
  useEffect(() => {
    if (activeTab !== 'settlement') return;
    (async () => {
      const [curr, prev] = await Promise.all([
        fetchSettlements(stlDateRange.from, stlDateRange.to),
        fetchSettlements(prevMonthRange.from, prevMonthRange.to),
      ]);
      setSettlements(curr);
      setPrevMonthSettlements(prev);

      // Build filter options from settlement data
      const customers = [...new Set(curr.map(r => r.customer))].sort();
      const transports = [...new Set(curr.map(r => r.transportType).filter(Boolean))].sort();
      setCustomerOptions(customers);
      setTransportTypeOptions(transports);
    })();
  }, [activeTab, stlDateRange, prevMonthRange]);

  // ── Also load settlements when switching to settlement tab ──
  useEffect(() => {
    if (activeTab === 'settlement') {
      (async () => {
        const [curr, prev] = await Promise.all([
          fetchSettlements(stlDateRange.from, stlDateRange.to),
          fetchSettlements(prevMonthRange.from, prevMonthRange.to),
        ]);
        setSettlements(curr);
        setPrevMonthSettlements(prev);
      })();
    }
  }, [activeTab]);

  // ── Unit Price: filtered data ──
  const filteredPrices = useMemo(() => {
    let result = unitPrices;
    if (upFilterCompany) result = result.filter(p => p.company === upFilterCompany);
    if (upFilterProduct) result = result.filter(p => p.product === upFilterProduct);
    return result;
  }, [unitPrices, upFilterCompany, upFilterProduct]);

  const upTotalPrice = useMemo(() => filteredPrices.reduce((s, p) => s + p.price, 0), [filteredPrices]);

  // ── Settlement: filtered data ──
  const filteredSettlements = useMemo(() => {
    let result = settlements;
    if (stlFilterCompany) result = result.filter(r => r.company === stlFilterCompany);
    if (stlFilterCustomer) result = result.filter(r => r.customer === stlFilterCustomer);
    if (stlFilterTransport) result = result.filter(r => r.transportType === stlFilterTransport);
    if (stlFilterProduct) result = result.filter(r => r.product === stlFilterProduct);
    return result;
  }, [settlements, stlFilterCompany, stlFilterCustomer, stlFilterTransport, stlFilterProduct]);

  const stlTotals = useMemo(() => {
    const totalWeight = filteredSettlements.reduce((s, r) => s + r.weightNet, 0);
    const totalFee = filteredSettlements.reduce((s, r) => s + r.transportFee, 0);
    const totalTax = filteredSettlements.reduce((s, r) => s + r.tax, 0);
    const totalAll = filteredSettlements.reduce((s, r) => s + r.totalFee, 0);
    return { totalWeight, totalFee, totalTax, totalAll, count: filteredSettlements.length };
  }, [filteredSettlements]);

  const prevTotals = useMemo(() => {
    const totalWeight = prevMonthSettlements.reduce((s, r) => s + r.weightNet, 0);
    const totalFee = prevMonthSettlements.reduce((s, r) => s + r.transportFee, 0);
    const totalAll = prevMonthSettlements.reduce((s, r) => s + r.totalFee, 0);
    return { totalWeight, totalFee, totalAll, count: prevMonthSettlements.length };
  }, [prevMonthSettlements]);

  const dashCompany = useMemo(() => groupSettlementsByKey(filteredSettlements, 'company'), [filteredSettlements]);
  const dashCustomer = useMemo(() => groupSettlementsByKey(filteredSettlements, 'customer'), [filteredSettlements]);
  const dashProduct = useMemo(() => groupSettlementsByKey(filteredSettlements, 'product'), [filteredSettlements]);

  const prevCompany = useMemo(() => groupSettlementsByKey(prevMonthSettlements, 'company'), [prevMonthSettlements]);
  const prevCustomer = useMemo(() => groupSettlementsByKey(prevMonthSettlements, 'customer'), [prevMonthSettlements]);
  const prevProduct = useMemo(() => groupSettlementsByKey(prevMonthSettlements, 'product'), [prevMonthSettlements]);

  const currMonthLabel = useMemo(() => `${parseInt(stlMonth)}월`, [stlMonth]);
  const prevMonthLabel = useMemo(() => {
    const m = parseInt(stlMonth);
    return `${m === 1 ? 12 : m - 1}월`;
  }, [stlMonth]);

  // ── Handlers ──
  const handleConfirm = () => {
    setConfirmedMonths(prev => ({ ...prev, [upMonth]: true }));
    toast.success(`${upMonth} 단가가 확정되었습니다.`);
  };

  const handleUnconfirm = () => {
    setConfirmedMonths(prev => ({ ...prev, [upMonth]: false }));
    toast.info(`${upMonth} 단가 확정이 취소되었습니다.`);
  };

  const handleCopyMonth = () => {
    toast.info('월 복사 기능은 DB 연동 후 활성화됩니다.');
  };

  const startPriceEdit = (id: string, currentPrice: number) => {
    if (isMonthConfirmed) {
      toast.warning('확정된 월의 단가는 수정할 수 없습니다. 확정취소 후 수정하세요.');
      return;
    }
    setEditingPriceId(id);
    setEditingPriceValue(currentPrice);
  };

  const savePriceEdit = async () => {
    if (!editingPriceId) return;
    try {
      const { error } = await supabase
        .from('unit_prices')
        .update({ price: editingPriceValue })
        .eq('id', editingPriceId);

      if (error) throw error;

      // Update local state
      setUnitPrices(prev => prev.map(p =>
        p.id === editingPriceId ? { ...p, price: editingPriceValue } : p
      ));
      toast.success('단가가 수정되었습니다.');
    } catch (err) {
      console.error('price update error:', err);
      toast.error('단가 수정 중 오류가 발생했습니다.');
    } finally {
      setEditingPriceId(null);
    }
  };

  const cancelPriceEdit = () => {
    setEditingPriceId(null);
  };

  const handleExcelUnitPrice = () => {
    const cols = [
      { key: 'company', header: '운송사' },
      { key: 'product', header: '제품명' },
      { key: 'price', header: '단가(원)' },
      { key: 'effective_date', header: '적용시작일' },
      { key: 'end_date', header: '적용종료일' },
      { key: 'memo', header: '메모' },
    ];
    exportToExcel(filteredPrices as unknown as Record<string, unknown>[], cols, `단가관리_${upMonth}`);
  };

  const handleExcelSettlement = () => {
    const cols = [
      { key: 'date', header: '날짜' },
      { key: 'company', header: '운송사' },
      { key: 'customer', header: '거래처' },
      { key: 'transportType', header: '운송구분' },
      { key: 'product', header: '제품명' },
      { key: 'weightNet', header: '계근수량' },
      { key: 'unitPrice', header: '단가(원)' },
      { key: 'transportFee', header: '운송료(원)' },
      { key: 'tax', header: '세액(원)' },
      { key: 'totalFee', header: '운송료 합계(원)' },
    ];
    exportToExcel(filteredSettlements as unknown as Record<string, unknown>[], cols, `정산관리_${stlYear}-${stlMonth}`);
  };

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  // ── Styles ──
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    color: active ? '#2563eb' : '#6b7280',
    borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: 3,
    borderBottomStyle: 'solid',
    borderBottomColor: active ? '#2563eb' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  const filterLabelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3,
  };

  const filterSelectStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6,
    border: '1px solid #d1d5db', outline: 'none', backgroundColor: '#fff',
  };

  const thStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#475569',
    backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0',
    textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  };

  const tdStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9',
  };

  const tdRightStyle: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  const btnPrimary: React.CSSProperties = {
    fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
    fontWeight: 600, background: '#2563eb', color: '#fff',
  };

  const btnOutline: React.CSSProperties = {
    fontSize: 13, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontWeight: 500,
    background: '#fff', color: '#374151', border: '1px solid #d1d5db',
  };

  const btnDanger: React.CSSProperties = {
    fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
    fontWeight: 600, background: '#ef4444', color: '#fff',
  };

  const btnSuccess: React.CSSProperties = {
    fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
    fontWeight: 600, background: '#16a34a', color: '#fff',
  };

  const btnWarning: React.CSSProperties = {
    fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
    fontWeight: 600, background: '#f59e0b', color: '#fff',
  };

  const kpiChipStyle = (bg: string, border: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
    borderRadius: 6, background: bg, border: `1px solid ${border}`,
  });

  // ── Loading spinner ──
  const renderSpinner = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        border: '3px solid #e5e7eb', borderTopColor: '#2563eb',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: 14, color: '#6b7280' }}>데이터를 불러오는 중...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Unit Price Filter Panel ──
  const renderUpFilterPanel = () => {
    if (upFilterCollapsed) return null;
    return (
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid #e5e7eb',
        backgroundColor: '#fff', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{
          padding: '10px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, #1e293b, #334155)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg style={{ width: 14, height: 14, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>조회 조건</span>
          </div>
          <button
            onClick={() => setUpFilterCollapsed(true)}
            style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 600 }}
          >접기 ◀</button>
        </div>

        <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={filterLabelStyle}>월 선택</label>
            <input
              type="month"
              value={upMonth}
              onChange={e => setUpMonth(e.target.value)}
              style={{ ...filterSelectStyle, padding: '6px 8px' }}
            />
          </div>

          <div>
            <label style={filterLabelStyle}>운송사</label>
            <select value={upFilterCompany} onChange={e => setUpFilterCompany(e.target.value)} style={filterSelectStyle}>
              <option value="">[전체]</option>
              {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>제품명</label>
            <select value={upFilterProduct} onChange={e => setUpFilterProduct(e.target.value)} style={filterSelectStyle}>
              <option value="">[전체]</option>
              {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <button onClick={fetchUnitPrices} style={{
            width: '100%', fontSize: 13, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontWeight: 700, background: '#2563eb', color: '#fff',
          }}>새로고침</button>
        </div>
      </div>
    );
  };

  // ── Settlement Filter Panel ──
  const renderStlFilterPanel = () => {
    if (stlFilterCollapsed) return null;
    return (
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid #e5e7eb',
        backgroundColor: '#fff', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{
          padding: '10px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, #1e293b, #334155)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg style={{ width: 14, height: 14, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>조회 조건</span>
          </div>
          <button
            onClick={() => setStlFilterCollapsed(true)}
            style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 600 }}
          >접기 ◀</button>
        </div>

        <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Period type */}
          <div>
            <label style={filterLabelStyle}>조회구분</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {([
                { value: 'monthly' as PeriodFilter, label: '월별' },
                { value: 'quarterly' as PeriodFilter, label: '분기별' },
                { value: 'semi-annual' as PeriodFilter, label: '반기별' },
                { value: 'annual' as PeriodFilter, label: '연간' },
              ]).map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, cursor: 'pointer',
                  color: stlPeriodFilter === opt.value ? '#1d4ed8' : '#6b7280',
                  fontWeight: stlPeriodFilter === opt.value ? 700 : 400,
                }}>
                  <input type="radio" name="stlPeriod" checked={stlPeriodFilter === opt.value}
                    onChange={() => setStlPeriodFilter(opt.value)}
                    style={{ width: 12, height: 12, accentColor: '#2563eb' }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Year / Month */}
          <div>
            <label style={filterLabelStyle}>년도</label>
            <select value={stlYear} onChange={e => setStlYear(e.target.value)} style={filterSelectStyle}>
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          {stlPeriodFilter !== 'annual' && (
            <div>
              <label style={filterLabelStyle}>월</label>
              <select value={stlMonth} onChange={e => setStlMonth(e.target.value)} style={filterSelectStyle}>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  return <option key={m} value={m}>{i + 1}월</option>;
                })}
              </select>
            </div>
          )}

          <div>
            <label style={filterLabelStyle}>운송사</label>
            <select value={stlFilterCompany} onChange={e => setStlFilterCompany(e.target.value)} style={filterSelectStyle}>
              <option value="">[전체]</option>
              {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>거래처</label>
            <select value={stlFilterCustomer} onChange={e => setStlFilterCustomer(e.target.value)} style={filterSelectStyle}>
              <option value="">[전체]</option>
              {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>운송구분</label>
            <select value={stlFilterTransport} onChange={e => setStlFilterTransport(e.target.value)} style={filterSelectStyle}>
              <option value="">[전체]</option>
              {transportTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>제품명</label>
            <select value={stlFilterProduct} onChange={e => setStlFilterProduct(e.target.value)} style={filterSelectStyle}>
              <option value="">[전체]</option>
              {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <button onClick={() => {
            setStlFilterCompany('');
            setStlFilterCustomer('');
            setStlFilterTransport('');
            setStlFilterProduct('');
          }} style={{
            width: '100%', fontSize: 13, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontWeight: 700, background: '#6b7280', color: '#fff',
          }}>필터 초기화</button>
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff', paddingLeft: 16,
      }}>
        <button style={tabStyle(activeTab === 'settlement')} onClick={() => setActiveTab('settlement')}>
          정산관리
        </button>
        <button style={tabStyle(activeTab === 'unitprice')} onClick={() => setActiveTab('unitprice')}>
          단가관리
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ═══ Unit Price Tab ═══ */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'unitprice' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Filter Panel */}
          {renderUpFilterPanel()}

          {/* Main Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Title Bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}>
                {upFilterCollapsed && (
                  <button onClick={() => setUpFilterCollapsed(false)} style={{
                    fontSize: 13, padding: '5px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
                    borderRadius: 6, cursor: 'pointer', color: '#475569', fontWeight: 600,
                  }}>필터 ▶</button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ width: 4, height: 18, borderRadius: 2, background: '#2563eb' }} />
                  <h1 style={{ fontSize: 16, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>단가관리</h1>
                </div>

                {/* Month badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                  borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{upMonth}</span>
                </div>

                {/* Confirmed status badge */}
                {isMonthConfirmed ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                    borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0',
                  }}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>확정완료</span>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                    borderRadius: 6, background: '#fefce8', border: '1px solid #fde68a',
                  }}>
                    <span style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>미확정</span>
                  </div>
                )}

                {/* KPI chips */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0, marginLeft: 4 }}>
                  <div style={kpiChipStyle('#eff6ff', '#bfdbfe')}>
                    <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>구간</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>{filteredPrices.length}</span>
                    <span style={{ fontSize: 11, color: '#3b82f6' }}>건</span>
                  </div>
                  <div style={kpiChipStyle('#f5f3ff', '#c4b5fd')}>
                    <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>합계</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#6d28d9' }}>{fmt(upTotalPrice)}</span>
                    <span style={{ fontSize: 11, color: '#7c3aed' }}>원</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={handleCopyMonth} style={btnWarning}>월 복사</button>
                {isMonthConfirmed ? (
                  <button onClick={handleUnconfirm} style={btnDanger}>확정취소</button>
                ) : (
                  <button onClick={handleConfirm} style={btnSuccess}>확정</button>
                )}
                <button onClick={handleExcelUnitPrice} style={btnOutline}>엑셀내보내기</button>
              </div>
            </div>

            {/* Data Grid */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {upLoading ? renderSpinner() : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>#</th>
                      <th style={{ ...thStyle, minWidth: 90 }}>운송사</th>
                      <th style={{ ...thStyle, minWidth: 160 }}>제품명</th>
                      <th style={{ ...thStyle, minWidth: 120, textAlign: 'right' }}>단가(원)</th>
                      <th style={{ ...thStyle, minWidth: 100 }}>적용시작일</th>
                      <th style={{ ...thStyle, minWidth: 100 }}>적용종료일</th>
                      <th style={{ ...thStyle, minWidth: 160 }}>메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrices.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                          단가 데이터가 없습니다. unit_prices 테이블에 데이터를 입력해주세요.
                        </td>
                      </tr>
                    ) : filteredPrices.map((row, idx) => (
                      <tr
                        key={row.id}
                        style={{
                          backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc',
                          transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0f7ff'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 0 ? '#fff' : '#fafbfc'; }}
                      >
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#334155',
                          }}>{row.company}</span>
                        </td>
                        <td style={tdStyle}>{row.product}</td>
                        <td style={{ ...tdRightStyle, fontWeight: 600 }}>
                          {editingPriceId === row.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                              <input
                                type="number"
                                value={editingPriceValue}
                                onChange={e => setEditingPriceValue(parseInt(e.target.value) || 0)}
                                onKeyDown={e => { if (e.key === 'Enter') savePriceEdit(); if (e.key === 'Escape') cancelPriceEdit(); }}
                                autoFocus
                                style={{
                                  width: 90, fontSize: 13, padding: '3px 6px', borderRadius: 4,
                                  border: '2px solid #3b82f6', textAlign: 'right', outline: 'none',
                                }}
                              />
                              <button onClick={savePriceEdit} style={{
                                fontSize: 11, padding: '2px 6px', borderRadius: 4, border: 'none',
                                background: '#16a34a', color: '#fff', cursor: 'pointer',
                              }}>저장</button>
                              <button onClick={cancelPriceEdit} style={{
                                fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db',
                                background: '#fff', color: '#6b7280', cursor: 'pointer',
                              }}>취소</button>
                            </div>
                          ) : (
                            <span
                              onClick={() => startPriceEdit(row.id, row.price)}
                              style={{ cursor: isMonthConfirmed ? 'default' : 'pointer', color: row.price === 0 ? '#d1d5db' : '#1e293b' }}
                              title={isMonthConfirmed ? '확정취소 후 수정 가능' : '클릭하여 수정'}
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
                        <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', color: '#334155' }}>
                          합계 ({filteredPrices.length}건)
                        </td>
                        <td style={{ ...tdRightStyle, fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>
                          {fmt(upTotalPrice)}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ═══ Settlement Tab ═══ */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'settlement' && (() => {
        // ── Bar chart renderer ──
        const renderHBarChart = (
          title: string,
          current: GroupSummary[],
          previous: GroupSummary[],
          mode: 'fee' | 'weight',
        ) => {
          const getValue = (item: GroupSummary) => mode === 'fee' ? item.totalFee : item.totalWeight;
          const top = [...current].sort((a, b) => getValue(b) - getValue(a)).slice(0, 10);
          const allVals = [
            ...top.map(getValue),
            ...top.map(t => {
              const p = previous.find(pp => pp.name === t.name);
              return p ? getValue(p) : 0;
            }),
          ];
          const maxVal = Math.max(...allVals, 1);

          return (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                {title} {mode === 'fee' ? '(정산금액)' : '(계근수량)'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {top.map((item) => {
                  const prev = previous.find(p => p.name === item.name);
                  const curVal = getValue(item);
                  const prvVal = prev ? getValue(prev) : 0;
                  const curPct = (curVal / maxVal) * 100;
                  const prvPct = (prvVal / maxVal) * 100;
                  const diff = prvVal > 0 ? ((curVal - prvVal) / prvVal * 100) : 0;

                  return (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 65, fontSize: 11, fontWeight: 600, color: '#334155', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ height: 14, borderRadius: 3, background: '#3b82f6', width: `${Math.max(curPct, 1)}%`, transition: 'width 0.3s' }} />
                          <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {mode === 'fee' ? fmt(Math.round(curVal / 10000)) + '만' : curVal.toFixed(1) + 't'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ height: 10, borderRadius: 3, background: '#cbd5e1', width: `${Math.max(prvPct, 0.5)}%`, transition: 'width 0.3s' }} />
                          <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {mode === 'fee' ? fmt(Math.round(prvVal / 10000)) + '만' : prvVal.toFixed(1) + 't'}
                          </span>
                          {prvVal > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: diff >= 0 ? '#16a34a' : '#ef4444' }}>
                              {diff >= 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: '#6b7280' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6' }} />
                  <span>{currMonthLabel} (당월)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#cbd5e1' }} />
                  <span>{prevMonthLabel} (전월)</span>
                </div>
              </div>
            </div>
          );
        };

        // ── Pie chart renderer ──
        const renderPieChart = (
          title: string,
          data: GroupSummary[],
          mode: 'fee' | 'weight',
        ) => {
          const getValue = (item: GroupSummary) => mode === 'fee' ? item.totalFee : item.totalWeight;
          const sorted = [...data].sort((a, b) => getValue(b) - getValue(a));
          const top8 = sorted.slice(0, 8);
          const rest = sorted.slice(8);
          const items: { name: string; value: number }[] = top8.map(d => ({ name: d.name, value: getValue(d) }));
          if (rest.length > 0) {
            items.push({ name: '기타', value: rest.reduce((s, d) => s + getValue(d), 0) });
          }
          const total = items.reduce((s, i) => s + i.value, 0);
          if (total === 0) return <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 20 }}>데이터 없음</div>;

          let cumPct = 0;
          const segments: string[] = [];
          items.forEach((item, i) => {
            const pct = (item.value / total) * 100;
            segments.push(`${CHART_COLORS[i % CHART_COLORS.length]} ${cumPct}% ${cumPct + pct}%`);
            cumPct += pct;
          });

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>{title}</div>
              <div style={{
                width: 140, height: 140, borderRadius: '50%',
                background: `conic-gradient(${segments.join(', ')})`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 10, maxWidth: 260, justifyContent: 'center' }}>
                {items.map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                    <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ color: '#9ca3af' }}>({((item.value / total) * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          );
        };

        const cardBoxStyle: React.CSSProperties = {
          background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        };

        return (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Filter Panel */}
            {renderStlFilterPanel()}

            {/* Main Content — Dashboard */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Title Bar */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}>
                  {stlFilterCollapsed && (
                    <button onClick={() => setStlFilterCollapsed(false)} style={{
                      fontSize: 13, padding: '5px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
                      borderRadius: 6, cursor: 'pointer', color: '#475569', fontWeight: 600,
                    }}>필터 ▶</button>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ width: 4, height: 18, borderRadius: 2, background: '#2563eb' }} />
                    <h1 style={{ fontSize: 16, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>정산 대시보드</h1>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                    borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
                      {stlDateRange.from} ~ {stlDateRange.to}
                    </span>
                  </div>
                  {stlLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        border: '2px solid #e5e7eb', borderTopColor: '#2563eb',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      <span style={{ fontSize: 12, color: '#6b7280' }}>로딩중...</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button onClick={handleExcelSettlement} style={btnOutline}>엑셀내보내기</button>
                </div>
              </div>

              {/* Scrollable Dashboard Area */}
              <div style={{ flex: 1, overflow: 'auto', padding: 16, backgroundColor: '#f8fafc' }}>

                {/* ── KPI Summary Cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: '총 건수', value: `${fmt(stlTotals.count)}건`, prev: `전월 ${fmt(prevTotals.count)}건`, color: '#2563eb', bg: '#eff6ff', icon: '📋' },
                    { label: '총 계근수량', value: `${stlTotals.totalWeight.toFixed(1)} 톤`, prev: `전월 ${prevTotals.totalWeight.toFixed(1)}톤`, color: '#16a34a', bg: '#f0fdf4', icon: '⚖️' },
                    { label: '총 운송료 (공급가액)', value: `${fmt(stlTotals.totalFee)} 원`, prev: `전월 ${fmt(prevTotals.totalFee)}원`, color: '#d97706', bg: '#fefce8', icon: '💰' },
                    { label: '총 합계 (세포함)', value: `${fmt(stlTotals.totalAll)} 원`, prev: `전월 ${fmt(prevTotals.totalAll)}원`, color: '#7c3aed', bg: '#f5f3ff', icon: '📊' },
                  ].map(card => (
                    <div key={card.label} style={{
                      padding: '14px 16px', borderRadius: 12, background: card.bg,
                      border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 16 }}>{card.icon}</span>
                        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{card.label}</span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: card.color, marginBottom: 2 }}>{card.value}</div>
                      {card.prev && (
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{card.prev}</div>
                      )}
                    </div>
                  ))}
                </div>

                {stlLoading ? renderSpinner() : (
                  <>
                    {/* ── Row 1: 운송사별 + 거래처별 Bar Charts ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      <div style={cardBoxStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>🚛</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>운송사별 정산현황</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>전월 대비</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          {renderHBarChart('운송사', dashCompany, prevCompany, 'fee')}
                          {renderHBarChart('운송사', dashCompany, prevCompany, 'weight')}
                        </div>
                      </div>

                      <div style={cardBoxStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>🏢</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>거래처별 정산현황</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>전월 대비 (상위 10)</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          {renderHBarChart('거래처', dashCustomer, prevCustomer, 'fee')}
                          {renderHBarChart('거래처', dashCustomer, prevCustomer, 'weight')}
                        </div>
                      </div>
                    </div>

                    {/* ── Row 2: 제품별 + 거래처 파이차트 ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      <div style={cardBoxStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>📦</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>제품별 정산현황</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>전월 대비</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          {renderHBarChart('제품', dashProduct, prevProduct, 'fee')}
                          {renderHBarChart('제품', dashProduct, prevProduct, 'weight')}
                        </div>
                      </div>

                      <div style={cardBoxStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>🥧</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>거래처별 구성비</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          {renderPieChart('정산금액 비율', dashCustomer, 'fee')}
                          {renderPieChart('계근수량 비율', dashCustomer, 'weight')}
                        </div>
                      </div>
                    </div>

                    {/* ── Detail Data Table (Collapsible) ── */}
                    <div style={{
                      background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
                    }}>
                      <div
                        onClick={() => setStlDetailOpen(!stlDetailOpen)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', cursor: 'pointer', background: '#f8fafc',
                          borderBottom: stlDetailOpen ? '1px solid #e5e7eb' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#6b7280' }}>{stlDetailOpen ? '▼' : '▶'}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>세부 데이터</span>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10,
                            background: '#eff6ff', color: '#1d4ed8', fontWeight: 600,
                          }}>{filteredSettlements.length}건</span>
                        </div>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{stlDetailOpen ? '접기' : '펼치기'}</span>
                      </div>

                      {stlDetailOpen && (
                        <div style={{ maxHeight: 500, overflow: 'auto' }}>
                          {filteredSettlements.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', fontSize: 13 }}>
                              조회된 데이터가 없습니다.
                            </div>
                          ) : (
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
                                  <th style={{ ...thStyle, minWidth: 120, textAlign: 'right' }}>운송료 합계(원)</th>
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
                                      <span style={{
                                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                        background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#334155',
                                      }}>{row.company}</span>
                                    </td>
                                    <td style={tdStyle}>{row.customer}</td>
                                    <td style={tdStyle}>
                                      <span style={{
                                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                                        background: row.transportType === '탱크' ? '#dbeafe' : row.transportType === '카고' ? '#fef3c7' : '#fce7f3',
                                        color: row.transportType === '탱크' ? '#1e40af' : row.transportType === '카고' ? '#92400e' : '#9d174d',
                                      }}>{row.transportType}</span>
                                    </td>
                                    <td style={tdStyle}>{row.product}</td>
                                    <td style={tdRightStyle}>{row.weightNet.toFixed(2)}</td>
                                    <td style={tdRightStyle}>{fmt(row.unitPrice)}</td>
                                    <td style={{ ...tdRightStyle, fontWeight: 600 }}>{fmt(row.transportFee)}</td>
                                    <td style={tdRightStyle}>{fmt(row.tax)}</td>
                                    <td style={{ ...tdRightStyle, fontWeight: 700, color: '#1d4ed8' }}>{fmt(row.totalFee)}</td>
                                  </tr>
                                ))}
                                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                                  <td colSpan={6} style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', color: '#334155' }}>
                                    합계 ({filteredSettlements.length}건)
                                  </td>
                                  <td style={{ ...tdRightStyle, fontWeight: 700 }}>{stlTotals.totalWeight.toFixed(2)}</td>
                                  <td style={tdRightStyle}></td>
                                  <td style={{ ...tdRightStyle, fontWeight: 700 }}>{fmt(stlTotals.totalFee)}</td>
                                  <td style={{ ...tdRightStyle, fontWeight: 700 }}>{fmt(stlTotals.totalTax)}</td>
                                  <td style={{ ...tdRightStyle, fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>{fmt(stlTotals.totalAll)}</td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
