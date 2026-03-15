'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, addDays, subDays, endOfMonth } from 'date-fns';
import ShipmentPrint from '@/components/modules/shipping/ShipmentPrint';
import InlineShipmentRow, { type EditableRowData } from '@/components/modules/shipping/InlineShipmentRow';
import MultiCustomerPanel from '@/components/modules/shipping/MultiCustomerPanel';
import { useShipmentCrud } from '@/components/modules/shipping/useShipmentCrud';
import { exportToExcel } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';

// ── Types ──────────────────────────────────────────────
interface Shipment {
  id: string;
  shipment_date: string;
  shipment_number: string;
  customer_id: string | null;
  customer_name: string | null;
  product_id: string | null;
  product_name: string | null;
  product_code: string | null;
  quantity: number;
  unit: string;
  delivery_address: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  company_id: string | null;
  company_name: string | null;
  transport_type: string | null;
  silo: string | null;
  is_shipped: boolean;
  weight_empty: number | null;
  weight_loaded: number | null;
  weight_net: number | null;
  certificate_time: string | null;
  has_attachment: boolean;
  dispatch_notified: boolean;
  is_confirmed: boolean;
  notes: string | null;
  status: string;
  memo: string | null;
  created_at: string;
}

interface LookupCustomer { id: string; name: string; }
interface LookupProduct { id: string; code: string; name: string; unit: string; }
interface LookupDriver { id: string; name: string; vehicle_number: string; company_id: string | null; }
interface LookupCompany { id: string; name: string; phone: string | null; email: string | null; }

type DateMode = 'year' | 'month' | 'day' | 'period';

const EXCEL_COLS = [
  { key: 'shipment_date', header: '출하일자' },
  { key: 'transport_type', header: '운송구분' },
  { key: 'customer_name', header: '거래처' },
  { key: 'product_name', header: '제품명' },
  { key: 'company_name', header: '운송사' },
  { key: 'vehicle_number', header: '차량정보' },
  { key: 'silo', header: '사일로' },
  { key: 'weight_net', header: '계근결과' },
  { key: 'notes', header: '기타' },
  { key: 'certificate_time', header: '출하증 발급시간' },
];

const TRANSPORT_TYPES = ['탱크', '벌크', '백(bag)', '기타'];

/** 대기화면 비밀번호 (모든 운송사 공통) */
const WAITING_SCREEN_PASSWORD = '1234';

/** 대기화면 운송사 표시 순서 */
const COMPANY_DISPLAY_ORDER = ['퍼스트', '성진', '대경', '강천', '우주', '성윤', '우신', '태윤', '동방', '진흥', '상차도'];

// ── Component ──────────────────────────────────────────
export default function ShippingPage() {
  const supabase = createClient();
  const toast = useToast();
  const crud = useShipmentCrud();

  // ── Data State ──
  const [data, setData] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<LookupCustomer[]>([]);
  const [products, setProducts] = useState<LookupProduct[]>([]);
  const [drivers, setDrivers] = useState<LookupDriver[]>([]);
  const [companies, setCompanies] = useState<LookupCompany[]>([]);

  // ── Filter State ──
  const [dateMode, setDateMode] = useState<DateMode>('day');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [periodFrom, setPeriodFrom] = useState(format(new Date(), 'yyyy-MM-01'));
  const [periodTo, setPeriodTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterTransportType, setFilterTransportType] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [filterCollapsed, setFilterCollapsed] = useState(false);

  // ── Selection State ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Inline Editing State ──
  const [editingRows, setEditingRows] = useState<Map<string, EditableRowData>>(new Map());
  const [newRows, setNewRows] = useState<Shipment[]>([]);

  // ── Modal State (kept: print, waiting, dispatch notify) ──
  const [showPrint, setShowPrint] = useState(false);
  const [printRow, setPrintRow] = useState<Shipment | null>(null);
  const [showWaitingScreen, setShowWaitingScreen] = useState(false);
  const [showDispatchNotify, setShowDispatchNotify] = useState(false);
  const [notifyMethod, setNotifyMethod] = useState<'email' | 'kakao'>('email');
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [showMultiCustomer, setShowMultiCustomer] = useState(false);
  const [waitingCompanyId, setWaitingCompanyId] = useState<string>('');
  const [waitingStep, setWaitingStep] = useState<'select' | 'password' | 'data'>('select');
  const [waitingPassword, setWaitingPassword] = useState('');
  const [waitingPasswordError, setWaitingPasswordError] = useState('');
  const [waitingCompanyName, setWaitingCompanyName] = useState('');

  // ── Date Range Calculation ──
  const getDateRange = useCallback(() => {
    switch (dateMode) {
      case 'year': {
        const year = selectedDate.slice(0, 4);
        return { from: `${year}-01-01`, to: `${year}-12-31` };
      }
      case 'month': {
        const ym = selectedDate.slice(0, 7);
        const lastDay = format(endOfMonth(new Date(selectedDate + 'T00:00:00')), 'yyyy-MM-dd');
        return { from: `${ym}-01`, to: lastDay };
      }
      case 'day':
        return { from: selectedDate, to: selectedDate };
      case 'period':
        return { from: periodFrom, to: periodTo };
    }
  }, [dateMode, selectedDate, periodFrom, periodTo]);

  // ── Data Fetching ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const range = getDateRange();
      let query = supabase
        .from('v_shipments')
        .select('*')
        .gte('shipment_date', range.from)
        .lte('shipment_date', range.to)
        .order('shipment_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (filterTransportType) query = query.eq('transport_type', filterTransportType);
      if (filterCustomerId) query = query.eq('customer_id', filterCustomerId);
      if (filterCompanyId) query = query.eq('company_id', filterCompanyId);

      const { data: result, error } = await query;
      if (error) throw error;
      setData(result || []);
      setSelectedIds(new Set());
      setEditingRows(new Map());
      setNewRows([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, getDateRange, filterTransportType, filterCustomerId, filterCompanyId, toast]);

  const fetchLookups = useCallback(async () => {
    const [custRes, prodRes, driverRes, compRes] = await Promise.all([
      supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('products').select('id, code, name, unit').eq('is_active', true).order('name'),
      supabase.from('drivers').select('id, name, vehicle_number, company_id').eq('is_active', true).order('name'),
      supabase.from('transport_companies').select('id, name, phone, email').eq('is_active', true).order('name'),
    ]);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);
    setDrivers(driverRes.data || []);
    setCompanies(compRes.data || []);
  }, [supabase]);

  useEffect(() => {
    fetchData();
    fetchLookups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection ──
  const allRows = useMemo(() => [...newRows, ...data], [newRows, data]);
  const toggleSelectAll = () => {
    if (selectedIds.size === allRows.length && allRows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allRows.map(d => d.id)));
    }
  };
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // ── Date Navigation ──
  const handlePrevDay = () => setSelectedDate(format(subDays(new Date(selectedDate + 'T00:00:00'), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setSelectedDate(format(addDays(new Date(selectedDate + 'T00:00:00'), 1), 'yyyy-MM-dd'));

  // ── Inline Editing ──
  const handleStartEdit = useCallback((id: string) => {
    // Check if it's a new row
    const newRow = newRows.find(r => r.id === id);
    const row = newRow || data.find(r => r.id === id);
    if (!row) return;

    setEditingRows(prev => {
      const next = new Map(prev);
      next.set(id, {
        shipment_date: row.shipment_date || selectedDate,
        transport_type: row.transport_type || '탱크',
        customer_id: row.customer_id || '',
        product_id: row.product_id || '',
        company_id: row.company_id || '',
        driver_id: row.driver_id || '',
        vehicle_number: row.vehicle_number || '',
        silo: row.silo || '',
        quantity: row.quantity || 0,
        unit: row.unit || 'ton',
        delivery_address: row.delivery_address || '',
        weight_empty: row.weight_empty,
        weight_loaded: row.weight_loaded,
        weight_net: row.weight_net,
        is_shipped: row.is_shipped || false,
        notes: row.notes || '',
        memo: row.memo || '',
        status: row.status || 'pending',
      });
      return next;
    });
  }, [data, newRows, selectedDate]);

  const handleCancelEdit = useCallback((id: string) => {
    // If it's a new (unsaved) row, remove it
    const isNew = newRows.some(r => r.id === id);
    if (isNew) {
      setNewRows(prev => prev.filter(r => r.id !== id));
    }
    setEditingRows(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, [newRows]);

  const handleSaveEdit = useCallback(async (id: string) => {
    const editData = editingRows.get(id);
    if (!editData) return;

    if (!editData.customer_id) { toast.warning('거래처를 선택해주세요.'); return; }
    if (!editData.product_id) { toast.warning('제품을 선택해주세요.'); return; }

    const isNew = newRows.some(r => r.id === id);
    const result = await crud.saveRow(editData, isNew ? null : id);

    if (result.success) {
      toast.success(isNew ? '등록되었습니다.' : '수정되었습니다.');
      setEditingRows(prev => { const next = new Map(prev); next.delete(id); return next; });
      if (isNew) {
        setNewRows(prev => prev.filter(r => r.id !== id));
      }
      fetchData();
    } else {
      toast.error(result.error || '저장 실패');
    }
  }, [editingRows, newRows, crud, toast, fetchData]);

  const handleUpdateEditData = useCallback((id: string, updates: Partial<EditableRowData>) => {
    setEditingRows(prev => {
      const next = new Map(prev);
      const current = next.get(id);
      if (current) {
        next.set(id, { ...current, ...updates });
      }
      return next;
    });
  }, []);

  const handleNewRow = useCallback(() => {
    const tempId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newRow: Shipment = {
      id: tempId,
      shipment_date: selectedDate,
      shipment_number: '',
      customer_id: null,
      customer_name: null,
      product_id: null,
      product_name: null,
      product_code: null,
      quantity: 0,
      unit: 'ton',
      delivery_address: null,
      driver_id: null,
      driver_name: null,
      vehicle_number: null,
      company_id: null,
      company_name: null,
      transport_type: '탱크',
      silo: null,
      is_shipped: false,
      weight_empty: null,
      weight_loaded: null,
      weight_net: null,
      certificate_time: null,
      has_attachment: false,
      dispatch_notified: false,
      is_confirmed: false,
      notes: null,
      status: 'pending',
      memo: null,
      created_at: new Date().toISOString(),
    };

    setNewRows(prev => [newRow, ...prev]);

    // Immediately enter edit mode
    setEditingRows(prev => {
      const next = new Map(prev);
      next.set(tempId, {
        shipment_date: selectedDate,
        transport_type: '탱크',
        customer_id: '',
        product_id: '',
        company_id: '',
        driver_id: '',
        vehicle_number: '',
        silo: '',
        quantity: 0,
        unit: 'ton',
        delivery_address: '',
        weight_empty: null,
        weight_loaded: null,
        weight_net: null,
        is_shipped: false,
        notes: '',
        memo: '',
        status: 'pending',
      });
      return next;
    });
  }, [selectedDate]);

  // ── Action Handlers ──
  const handleDelete = async () => {
    if (selectedIds.size === 0) { toast.warning('삭제할 항목을 선택해주세요.'); return; }
    // Remove any selected new (unsaved) rows without API call
    const newIds = newRows.filter(r => selectedIds.has(r.id)).map(r => r.id);
    const existingIds = Array.from(selectedIds).filter(id => !newIds.includes(id));

    if (newIds.length > 0) {
      setNewRows(prev => prev.filter(r => !newIds.includes(r.id)));
      setEditingRows(prev => {
        const next = new Map(prev);
        newIds.forEach(id => next.delete(id));
        return next;
      });
    }

    if (existingIds.length > 0) {
      if (!confirm(`선택한 ${existingIds.length}건을 삭제하시겠습니까?`)) return;
      const result = await crud.deleteRows(existingIds);
      if (result.success) {
        toast.success('삭제되었습니다.');
        fetchData();
      } else {
        toast.error(result.error || '삭제 실패');
      }
    }
    setSelectedIds(new Set());
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) { toast.warning('확정할 항목을 선택해주세요.'); return; }
    const result = await crud.batchUpdate(Array.from(selectedIds), { is_confirmed: true });
    if (result.success) { toast.success(`${selectedIds.size}건이 확정되었습니다.`); fetchData(); }
    else toast.error(result.error || '확정 실패');
  };

  const handleCancelConfirm = async () => {
    if (selectedIds.size === 0) { toast.warning('확정취소할 항목을 선택해주세요.'); return; }
    const result = await crud.batchUpdate(Array.from(selectedIds), { is_confirmed: false });
    if (result.success) { toast.success('확정이 취소되었습니다.'); fetchData(); }
    else toast.error(result.error || '확정취소 실패');
  };

  const openDispatchNotify = () => {
    if (selectedIds.size === 0) { toast.warning('배차통보할 항목을 선택해주세요.'); return; }
    setNotifyMethod('email');
    setShowDispatchNotify(true);
  };

  const handleDispatchNotifyConfirm = async () => {
    setNotifyLoading(true);
    const result = await crud.batchUpdate(Array.from(selectedIds), { dispatch_notified: true });
    if (result.success) {
      const methodLabel = notifyMethod === 'email' ? '이메일' : '카카오톡';
      toast.success(`배차통보가 완료되었습니다. (${methodLabel} 발송)`);
      setShowDispatchNotify(false);
      fetchData();
    } else {
      toast.error(result.error || '배차통보 실패');
    }
    setNotifyLoading(false);
  };

  const handleShipToggle = async (id: string, currentValue: boolean) => {
    const result = await crud.toggleShip(id, currentValue);
    if (result.success) fetchData();
    else toast.error(result.error || '출하 상태 변경 실패');
  };

  const handlePrint = () => {
    if (selectedIds.size === 0) { toast.warning('출력할 출하건을 선택해주세요.'); return; }
    const row = allRows.find(d => selectedIds.has(d.id));
    if (row) { setPrintRow(row); setShowPrint(true); }
  };

  // ── 출하증 대기화면 헬퍼 ──
  const openWaitingScreen = () => {
    setWaitingStep('select');
    setWaitingCompanyId('');
    setWaitingCompanyName('');
    setWaitingPassword('');
    setWaitingPasswordError('');
    setShowWaitingScreen(true);
  };
  const closeWaitingScreen = () => {
    setShowWaitingScreen(false);
    setWaitingStep('select');
    setWaitingCompanyId('');
    setWaitingCompanyName('');
    setWaitingPassword('');
    setWaitingPasswordError('');
  };

  const handleExcel = () => {
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLS, '출하관리');
  };

  const handleMultiCustomerRegister = async (multiData: {
    shipment_date: string;
    transport_type: string;
    product_id: string;
    silo: string;
    customerIds: string[];
  }) => {
    const rows = multiData.customerIds.map(cid => ({
      shipment_date: multiData.shipment_date,
      transport_type: multiData.transport_type,
      customer_id: cid,
      product_id: multiData.product_id,
      silo: multiData.silo || null,
    }));
    const result = await crud.batchInsert(rows);
    if (result.success) {
      toast.success(`${multiData.customerIds.length}건의 출하가 등록되었습니다.`);
      setShowMultiCustomer(false);
      fetchData();
    } else {
      toast.error(result.error || '등록 실패');
    }
  };

  // ── Totals ──
  const totalWeight = allRows.reduce((sum, d) => sum + (d.weight_net || 0), 0);
  const shippedCount = useMemo(() => allRows.filter(r => r.is_shipped).length, [allRows]);
  const pendingCount = useMemo(() => allRows.filter(r => !r.is_shipped).length, [allRows]);
  const companyCount = useMemo(() => new Set(allRows.map(r => r.company_name).filter(Boolean)).size, [allRows]);

  // ── Render ──
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 7.5rem)' }}>
      {/* ═══ Left Filter Panel ═══ */}
      {!filterCollapsed && (
        <div style={{
          width: 220, minWidth: 220,
          borderRight: '1px solid #e5e7eb',
          backgroundColor: '#fafafa',
          display: 'flex', flexDirection: 'column', overflow: 'auto',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#f1f5f9',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>조회 조건</span>
            <button
              onClick={() => setFilterCollapsed(true)}
              style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              접기 ◀
            </button>
          </div>

          <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Date Mode Radio */}
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                {([
                  { value: 'year', label: '년도별' },
                  { value: 'month', label: '월별' },
                  { value: 'day', label: '일자별' },
                  { value: 'period', label: '기간별' },
                ] as const).map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="radio" name="dateMode"
                      checked={dateMode === opt.value}
                      onChange={() => setDateMode(opt.value)}
                      style={{ width: 13, height: 13, accentColor: '#2563eb' }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Date Selector */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>날짜선택</label>
              {dateMode === 'period' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="form-input" style={{ fontSize: 12 }} />
                  <span style={{ fontSize: 11, textAlign: 'center', color: '#9ca3af' }}>~</span>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="form-input" style={{ fontSize: 12 }} />
                </div>
              ) : dateMode === 'year' ? (
                <input
                  type="number"
                  value={parseInt(selectedDate.slice(0, 4))}
                  onChange={e => setSelectedDate(`${e.target.value}-01-01`)}
                  className="form-input" style={{ fontSize: 12 }}
                  min={2020} max={2035}
                />
              ) : dateMode === 'month' ? (
                <input
                  type="month"
                  value={selectedDate.slice(0, 7)}
                  onChange={e => setSelectedDate(`${e.target.value}-01`)}
                  className="form-input" style={{ fontSize: 12 }}
                />
              ) : (
                <>
                  <input
                    type="date" value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="form-input" style={{ fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button onClick={handlePrevDay} className="btn btn-secondary" style={{ flex: 1, fontSize: 11, padding: '4px 0' }}>◀ 전날</button>
                    <button onClick={handleNextDay} className="btn btn-secondary" style={{ flex: 1, fontSize: 11, padding: '4px 0' }}>다음날 ▶</button>
                  </div>
                </>
              )}
            </div>

            {/* Transport Type */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>운송구분</label>
              <select
                value={filterTransportType} onChange={e => setFilterTransportType(e.target.value)}
                className="form-input" style={{ fontSize: 12 }}
              >
                <option value="">[선택]</option>
                {TRANSPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Customer */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>거래처</label>
              <select
                value={filterCustomerId} onChange={e => setFilterCustomerId(e.target.value)}
                className="form-input" style={{ fontSize: 12 }}
              >
                <option value="">[선택]</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Transport Company */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>운송사</label>
              <select
                value={filterCompanyId} onChange={e => setFilterCompanyId(e.target.value)}
                className="form-input" style={{ fontSize: 12 }}
              >
                <option value="">[선택]</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <button onClick={() => fetchData()} className="btn btn-primary" style={{ width: '100%', fontSize: 13, padding: '8px 0' }}>
              조회
            </button>
          </div>
        </div>
      )}

      {/* ═══ Main Content Area ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Title + KPI + Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff', gap: 8,
        }}>
          {/* Left: Title + KPI chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
            {filterCollapsed && (
              <button onClick={() => setFilterCollapsed(false)} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}>
                필터 ▶
              </button>
            )}
            <h1 style={{ fontSize: 15, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', flexShrink: 0 }}>출하 관리</h1>

            {/* KPI Chips */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <svg style={{ width: 13, height: 13, color: '#3b82f6', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>{allRows.length}</span>
                <span style={{ fontSize: 10, color: '#3b82f6' }}>건</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <svg style={{ width: 13, height: 13, color: '#16a34a', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>{shippedCount}</span>
                <span style={{ fontSize: 10, color: '#16a34a' }}>출하</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a' }}>
                <svg style={{ width: 13, height: 13, color: '#d97706', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309' }}>{pendingCount}</span>
                <span style={{ fontSize: 10, color: '#d97706' }}>대기</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#f5f3ff', border: '1px solid #c4b5fd' }}>
                <svg style={{ width: 13, height: 13, color: '#7c3aed', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9' }}>{totalWeight.toFixed(1)}</span>
                <span style={{ fontSize: 10, color: '#7c3aed' }}>톤</span>
              </div>
            </div>
          </div>

          {/* Right: Toolbar buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => fetchData()} className="btn btn-primary" style={{ fontSize: 12 }}>
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              조회
            </button>
            <button onClick={handleNewRow} className="btn btn-primary" style={{ fontSize: 12 }}>
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              신규
            </button>
            <button onClick={handleDelete} className="btn btn-danger" style={{ fontSize: 12 }}>삭제</button>
            <div className="toolbar-separator" />
            <button onClick={() => toast.info('엑셀 가져오기 기능은 준비 중입니다.')} className="btn btn-secondary" style={{ fontSize: 12 }}>엑셀가져오기</button>
            <button onClick={handleExcel} className="btn btn-secondary" style={{ fontSize: 12 }}>엑셀내보내기</button>
          </div>
        </div>

        {/* ── Action Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', gap: 4,
        }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={toggleSelectAll} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>전체선택/해제</button>
            <button onClick={openDispatchNotify} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px', fontWeight: 700, borderColor: '#374151' }}>배차통보</button>
            <button onClick={openWaitingScreen} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>출하증대기화면</button>
            <button
              onClick={() => setShowMultiCustomer(true)}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              거래처 다중 등록
            </button>
            <button onClick={handleConfirm} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>확정</button>
            <button onClick={handleCancelConfirm} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>확정취소</button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => toast.info('위하고 양식 기능은 준비 중입니다.')} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>위하고 양식</button>
            <button onClick={handlePrint} className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>인쇄</button>
          </div>
        </div>

        {/* ── Sub Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 16px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>● 출하내역</span>
          <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{allRows.length}건</span>
        </div>

        {/* ── Multi-Customer Panel ── */}
        {showMultiCustomer && (
          <MultiCustomerPanel
            customers={customers}
            products={products}
            defaultDate={selectedDate}
            onRegister={handleMultiCustomerRegister}
            onClose={() => setShowMultiCustomer(false)}
          />
        )}

        {/* ── Data Grid ── */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#6b7280', fontSize: 13 }}>
              데이터를 불러오는 중...
            </div>
          ) : allRows.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9ca3af', fontSize: 13 }}>
              조회된 데이터가 없습니다.
            </div>
          ) : (
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 32, textAlign: 'center', padding: '6px 4px' }}>#</th>
                  <th style={{ width: 32, textAlign: 'center', padding: '6px 4px' }}>
                    <input type="checkbox" checked={selectedIds.size === allRows.length && allRows.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ minWidth: 90, padding: '6px 4px' }}>출하일자</th>
                  <th style={{ minWidth: 60, padding: '6px 4px' }}>운송구분</th>
                  <th style={{ minWidth: 140, padding: '6px 4px' }}>거래처</th>
                  <th style={{ minWidth: 130, padding: '6px 4px' }}>제품명</th>
                  <th style={{ minWidth: 80, padding: '6px 4px' }}>운송사</th>
                  <th style={{ minWidth: 100, padding: '6px 4px' }}>차량정보</th>
                  <th style={{ minWidth: 60, padding: '6px 4px' }}>사일로</th>
                  <th style={{ width: 36, textAlign: 'center', padding: '6px 4px' }}>출하</th>
                  <th style={{ minWidth: 72, textAlign: 'right', padding: '6px 4px' }}>계근결과</th>
                  <th style={{ minWidth: 120, padding: '6px 4px' }}>기타</th>
                  <th style={{ minWidth: 140, padding: '6px 4px' }}>출하증 발급시간</th>
                  <th style={{ width: 44, textAlign: 'center', padding: '6px 4px' }}>첨부파일</th>
                  <th style={{ width: 56, textAlign: 'center', padding: '6px 4px' }}>배차통보</th>
                  <th style={{ width: 50, textAlign: 'center', padding: '6px 4px' }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row, idx) => {
                  const isNew = newRows.some(r => r.id === row.id);
                  const isEditing = editingRows.has(row.id);
                  return (
                    <InlineShipmentRow
                      key={row.id}
                      row={row}
                      index={idx}
                      isSelected={selectedIds.has(row.id)}
                      isEditing={isEditing}
                      isNew={isNew}
                      isSaving={crud.savingIds.has(isNew ? 'new' : row.id)}
                      editData={editingRows.get(row.id) || null}
                      customers={customers}
                      products={products}
                      drivers={drivers}
                      companies={companies}
                      onToggleSelect={toggleSelect}
                      onStartEdit={handleStartEdit}
                      onCancelEdit={handleCancelEdit}
                      onSaveEdit={handleSaveEdit}
                      onUpdateEditData={handleUpdateEditData}
                      onShipToggle={handleShipToggle}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Bottom Summary Cards ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
          padding: '10px 16px', borderTop: '2px solid #d1d5db', backgroundColor: '#f8fafc',
        }}>
          {/* 총건수 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>총 건수</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{allRows.length}<span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}> 건</span></div>
            </div>
          </div>

          {/* 출하완료 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>출하완료</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d', lineHeight: 1 }}>{shippedCount}<span style={{ fontSize: 11, fontWeight: 500, color: '#16a34a' }}> 건</span></div>
            </div>
          </div>

          {/* 출하대기 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fcd34d' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>출하대기</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#b45309', lineHeight: 1 }}>{pendingCount}<span style={{ fontSize: 11, fontWeight: 500, color: '#d97706' }}> 건</span></div>
            </div>
          </div>

          {/* 운송사 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #93c5fd' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>운송사</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8', lineHeight: 1 }}>{companyCount}<span style={{ fontSize: 11, fontWeight: 500, color: '#2563eb' }}> 개사</span></div>
            </div>
          </div>

          {/* 계근합계 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#f5f3ff', border: '1px solid #a78bfa' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>계근합계</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#6d28d9', lineHeight: 1 }}>{totalWeight.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 500, color: '#7c3aed' }}> 톤</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 배차통보 Popup ═══ */}
      {showDispatchNotify && (() => {
        const selected = data.filter(d => selectedIds.has(d.id));
        const alreadyNotified = selected.filter(d => d.dispatch_notified);
        const toNotify = selected.filter(d => !d.dispatch_notified);
        return (
          <div className="modal-overlay" style={{ zIndex: 150 }}>
            <div className="modal-content" style={{ maxWidth: 720, margin: '20px auto', maxHeight: 'calc(100vh - 40px)' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>배차통보</h2>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>선택한 출하건에 대해 배차 통보를 발송합니다</p>
                  </div>
                </div>
                <button onClick={() => setShowDispatchNotify(false)} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ padding: '14px 16px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>선택 건수</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8' }}>{selected.length}<span style={{ fontSize: 13, fontWeight: 500 }}>건</span></div>
                  </div>
                  <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>통보 대상</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{toNotify.length}<span style={{ fontSize: 13, fontWeight: 500 }}>건</span></div>
                  </div>
                  <div style={{ padding: '14px 16px', borderRadius: 10, background: '#fefce8', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 11, color: '#ca8a04', fontWeight: 600, marginBottom: 4 }}>통보완료</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#a16207' }}>{alreadyNotified.length}<span style={{ fontSize: 13, fontWeight: 500 }}>건</span></div>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>통보 대상 목록</div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>거래처</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>제품명</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>운송사</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>차량</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.map((row, i) => (
                          <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.customer_name || '-'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.product_name || '-'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.company_name || '-'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.vehicle_number || '-'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                              {row.dispatch_notified ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 600 }}>
                                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                                  완료
                                </span>
                              ) : (
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600 }}>대기</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ padding: '16px 20px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>통보 방법 선택</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                      border: notifyMethod === 'email' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                      background: notifyMethod === 'email' ? '#eff6ff' : '#fff', transition: 'all 0.15s',
                    }}>
                      <input type="radio" name="notifyMethod" value="email" checked={notifyMethod === 'email'} onChange={() => setNotifyMethod('email')} style={{ display: 'none' }} />
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: notifyMethod === 'email' ? '#3b82f6' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={notifyMethod === 'email' ? 'white' : '#6b7280'} strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: notifyMethod === 'email' ? '#1d4ed8' : '#374151' }}>이메일</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>거래처 등록 이메일로 발송</div>
                      </div>
                    </label>
                    <label style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                      border: notifyMethod === 'kakao' ? '2px solid #fbbf24' : '2px solid #e5e7eb',
                      background: notifyMethod === 'kakao' ? '#fefce8' : '#fff', transition: 'all 0.15s',
                    }}>
                      <input type="radio" name="notifyMethod" value="kakao" checked={notifyMethod === 'kakao'} onChange={() => setNotifyMethod('kakao')} style={{ display: 'none' }} />
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: notifyMethod === 'kakao' ? '#fbbf24' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={notifyMethod === 'kakao' ? '#3C1E1E' : '#6b7280'}>
                          <path d="M12 3C6.48 3 2 6.58 2 10.9c0 2.78 1.86 5.22 4.65 6.6l-.96 3.56c-.08.28.24.5.48.34l4.16-2.74c.55.06 1.1.1 1.67.1 5.52 0 10-3.58 10-7.96S17.52 3 12 3Z"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: notifyMethod === 'kakao' ? '#92400e' : '#374151' }}>카카오톡</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>거래처 등록 번호로 발송</div>
                      </div>
                    </label>
                  </div>
                </div>

                {alreadyNotified.length > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    이미 통보된 {alreadyNotified.length}건이 포함되어 있습니다. 재통보됩니다.
                  </div>
                )}
              </div>

              <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowDispatchNotify(false)} className="btn btn-secondary" style={{ fontSize: 13, padding: '8px 20px' }}>취소</button>
                <button
                  onClick={handleDispatchNotifyConfirm}
                  disabled={notifyLoading || (toNotify.length === 0 && alreadyNotified.length === 0)}
                  style={{
                    fontSize: 13, padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700,
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff',
                    opacity: notifyLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {notifyLoading ? (
                    <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />발송 중...</>
                  ) : (
                    <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>통보 확인</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ 출하증대기화면 — 3단계 플로우 ═══ */}
      {showWaitingScreen && (() => {
        // 정렬된 운송사 목록
        const sortedCompanies = [...companies].sort((a, b) => {
          const ai = COMPANY_DISPLAY_ORDER.indexOf(a.name);
          const bi = COMPANY_DISPLAY_ORDER.indexOf(b.name);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        // Step 3용 필터링 데이터
        const waitingRows = waitingCompanyId
          ? allRows.filter(r => r.company_id === waitingCompanyId)
          : [];

        // 버튼 배경색 팔레트
        const btnColors = [
          { bg: '#ecfdf5', border: '#86efac', hover: '#d1fae5' },
          { bg: '#eff6ff', border: '#93c5fd', hover: '#dbeafe' },
          { bg: '#fffbeb', border: '#fcd34d', hover: '#fef3c7' },
          { bg: '#fdf2f8', border: '#f9a8d4', hover: '#fce7f3' },
          { bg: '#f0fdf4', border: '#86efac', hover: '#dcfce7' },
          { bg: '#eef2ff', border: '#a5b4fc', hover: '#e0e7ff' },
          { bg: '#fefce8', border: '#fde047', hover: '#fef9c3' },
          { bg: '#fff1f2', border: '#fda4af', hover: '#ffe4e6' },
          { bg: '#f0fdfa', border: '#5eead4', hover: '#ccfbf1' },
          { bg: '#faf5ff', border: '#c4b5fd', hover: '#ede9fe' },
          { bg: '#f7fee7', border: '#bef264', hover: '#ecfccb' },
        ];

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>

            {/* ════ Step 1: 운송사 선택 ════ */}
            {(waitingStep === 'select' || waitingStep === 'password') && (
              <div style={{
                position: 'absolute', inset: 0,
                backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column',
                filter: waitingStep === 'password' ? 'blur(3px)' : 'none',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 32px', height: 70, backgroundColor: '#1e293b', color: '#fff', flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <svg style={{ width: 28, height: 28, color: '#38bdf8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
                    </svg>
                    <h2 style={{ fontSize: 22, fontWeight: 700 }}>출하증 대기화면</h2>
                    <span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 8 }}>운송사를 선택하세요</span>
                  </div>
                  <button
                    onClick={closeWaitingScreen}
                    style={{
                      padding: '10px 24px', fontSize: 16, fontWeight: 600,
                      backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    닫기
                  </button>
                </div>

                {/* Company Buttons Grid */}
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '40px 60px',
                }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20,
                    width: '100%', maxWidth: 900,
                  }}>
                    {sortedCompanies.map((company, idx) => {
                      const color = btnColors[idx % btnColors.length];
                      return (
                        <button
                          key={company.id}
                          onClick={() => {
                            setWaitingCompanyId(company.id);
                            setWaitingCompanyName(company.name);
                            setWaitingStep('password');
                            setWaitingPassword('');
                            setWaitingPasswordError('');
                          }}
                          style={{
                            padding: '36px 24px',
                            backgroundColor: color.bg,
                            border: `2px solid ${color.border}`,
                            borderRadius: 16,
                            fontSize: 22, fontWeight: 700, color: '#1e293b',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.15s',
                          }}
                          onMouseOver={e => {
                            (e.currentTarget).style.backgroundColor = color.hover;
                            (e.currentTarget).style.transform = 'scale(1.03)';
                            (e.currentTarget).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                          }}
                          onMouseOut={e => {
                            (e.currentTarget).style.backgroundColor = color.bg;
                            (e.currentTarget).style.transform = 'scale(1)';
                            (e.currentTarget).style.boxShadow = 'none';
                          }}
                        >
                          {company.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ════ Step 2: 비밀번호 입력 (오버레이) ════ */}
            {waitingStep === 'password' && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 210,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  backgroundColor: '#fff', borderRadius: 20, padding: '40px 48px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center',
                  minWidth: 380,
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', backgroundColor: '#1e40af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <svg style={{ width: 28, height: 28, color: '#fff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                    {waitingCompanyName}
                  </h3>
                  <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28 }}>비밀번호를 입력하세요</p>

                  <form onSubmit={e => {
                    e.preventDefault();
                    if (waitingPassword === WAITING_SCREEN_PASSWORD) {
                      setWaitingStep('data');
                      setWaitingPasswordError('');
                    } else {
                      setWaitingPasswordError('비밀번호가 틀립니다.');
                    }
                  }}>
                    <input
                      type="password"
                      value={waitingPassword}
                      onChange={e => { setWaitingPassword(e.target.value); setWaitingPasswordError(''); }}
                      placeholder="●●●●"
                      autoFocus
                      style={{
                        width: '100%', padding: '16px 20px',
                        fontSize: 28, fontWeight: 700, textAlign: 'center',
                        border: `2px solid ${waitingPasswordError ? '#ef4444' : '#d1d5db'}`,
                        borderRadius: 12, outline: 'none',
                        letterSpacing: '0.3em',
                      }}
                      maxLength={10}
                    />

                    {waitingPasswordError && (
                      <div style={{
                        marginTop: 12, padding: '10px 16px',
                        backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                        borderRadius: 8, fontSize: 14, color: '#dc2626', fontWeight: 600,
                      }}>
                        {waitingPasswordError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setWaitingStep('select');
                          setWaitingPassword('');
                          setWaitingPasswordError('');
                        }}
                        style={{
                          flex: 1, padding: '14px 0', fontSize: 16, fontWeight: 600,
                          backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                          borderRadius: 10, cursor: 'pointer',
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        style={{
                          flex: 1, padding: '14px 0', fontSize: 16, fontWeight: 700,
                          backgroundColor: '#1e40af', color: '#fff', border: 'none',
                          borderRadius: 10, cursor: 'pointer',
                        }}
                      >
                        확인
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ════ Step 3: 배차 목록 (큰 폰트) ════ */}
            {waitingStep === 'data' && (
              <div style={{
                position: 'absolute', inset: 0,
                backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 32px', height: 70, backgroundColor: '#1e293b', color: '#fff', flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <svg style={{ width: 28, height: 28, color: '#38bdf8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
                    </svg>
                    <h2 style={{ fontSize: 22, fontWeight: 700 }}>{waitingCompanyName}</h2>
                    <span style={{ fontSize: 15, color: '#94a3b8', marginLeft: 4 }}>출하 대기 목록</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 16, color: '#94a3b8' }}>{selectedDate}</span>
                    <button
                      onClick={() => {
                        setWaitingStep('select');
                        setWaitingCompanyId('');
                        setWaitingCompanyName('');
                        setWaitingPassword('');
                      }}
                      style={{
                        padding: '10px 24px', fontSize: 16, fontWeight: 600,
                        backgroundColor: '#475569', color: '#fff', border: 'none', borderRadius: 8,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                      </svg>
                      뒤로
                    </button>
                  </div>
                </div>

                {/* Data Table — 큰 폰트 */}
                <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
                  {waitingRows.length === 0 ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      height: '100%', color: '#94a3b8', fontSize: 20,
                    }}>
                      배정된 출하 내역이 없습니다.
                    </div>
                  ) : (
                    <table style={{
                      width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff',
                      borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '3px solid #e2e8f0' }}>
                          <th style={{ padding: '16px 14px', fontSize: 16, fontWeight: 700, color: '#475569', textAlign: 'center', width: 50 }}>#</th>
                          <th style={{ padding: '16px 14px', fontSize: 16, fontWeight: 700, color: '#475569', textAlign: 'left' }}>거래처</th>
                          <th style={{ padding: '16px 14px', fontSize: 16, fontWeight: 700, color: '#475569', textAlign: 'left' }}>제품명</th>
                          <th style={{ padding: '16px 14px', fontSize: 16, fontWeight: 700, color: '#475569', textAlign: 'left' }}>차량정보</th>
                          <th style={{ padding: '16px 14px', fontSize: 16, fontWeight: 700, color: '#475569', textAlign: 'left' }}>기타</th>
                          <th style={{ padding: '16px 14px', fontSize: 16, fontWeight: 700, color: '#475569', textAlign: 'center', minWidth: 280 }}>출하증 / 성적서</th>
                        </tr>
                      </thead>
                      <tbody>
                        {waitingRows.map((row, idx) => (
                          <tr
                            key={row.id}
                            style={{
                              borderBottom: '2px solid #f1f5f9',
                              backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc',
                            }}
                          >
                            <td style={{ padding: '18px 14px', fontSize: 18, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ padding: '18px 14px', fontSize: 18, color: '#1e293b', fontWeight: 600 }}>{row.customer_name || '-'}</td>
                            <td style={{ padding: '18px 14px', fontSize: 18, color: '#374151' }}>{row.product_name || '-'}</td>
                            <td style={{ padding: '18px 14px', fontSize: 18, color: '#374151', fontWeight: 500 }}>{row.vehicle_number || '-'}</td>
                            <td style={{ padding: '18px 14px', fontSize: 16, color: '#6b7280' }}>{row.notes || ''}</td>
                            <td style={{ padding: '14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                                {row.certificate_time ? (
                                  <>
                                    <button
                                      onClick={async () => {
                                        await crud.issueCertificate(row.id);
                                        setPrintRow(row);
                                        setShowPrint(true);
                                        fetchData();
                                      }}
                                      style={{
                                        padding: '12px 24px', fontSize: 16, fontWeight: 700,
                                        backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: 10,
                                        cursor: 'pointer', whiteSpace: 'nowrap',
                                      }}
                                    >
                                      재발급
                                    </button>
                                    <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                      {new Date(row.certificate_time).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      await crud.issueCertificate(row.id);
                                      setPrintRow(row);
                                      setShowPrint(true);
                                      fetchData();
                                    }}
                                    style={{
                                      padding: '12px 24px', fontSize: 16, fontWeight: 700,
                                      backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 10,
                                      cursor: 'pointer', whiteSpace: 'nowrap',
                                      boxShadow: '0 3px 10px rgba(22,163,74,0.35)',
                                    }}
                                  >
                                    출하증발급
                                  </button>
                                )}
                                <button
                                  onClick={() => toast.info('성적서 출력 기능은 준비 중입니다.')}
                                  style={{
                                    padding: '12px 24px', fontSize: 16, fontWeight: 700,
                                    backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 10,
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                  }}
                                >
                                  성적서
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Footer */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
                  padding: '16px 32px', backgroundColor: '#1e293b', color: '#fff', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>총 {waitingRows.length}건</span>
                </div>
              </div>
            )}

          </div>
        );
      })()}

      {/* ═══ Print Modal ═══ */}
      {showPrint && printRow && (
        <ShipmentPrint
          shipment={{
            shipment_date: printRow.shipment_date,
            shipment_number: printRow.shipment_number,
            customer_name: printRow.customer_name || undefined,
            product_name: printRow.product_name || undefined,
            product_code: printRow.product_code || undefined,
            quantity: printRow.quantity,
            unit: printRow.unit,
            driver_name: printRow.driver_name || undefined,
            vehicle_number: printRow.vehicle_number || undefined,
            company_name: printRow.company_name || undefined,
            weight_empty: printRow.weight_empty || undefined,
            weight_loaded: printRow.weight_loaded || undefined,
            weight_net: printRow.weight_net || undefined,
            delivery_address: printRow.delivery_address || undefined,
            memo: printRow.memo || undefined,
            certificate_time: printRow.certificate_time || undefined,
            notes: printRow.notes || undefined,
          }}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}
