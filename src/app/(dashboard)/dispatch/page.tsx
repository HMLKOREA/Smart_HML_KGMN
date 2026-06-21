'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, addDays, subDays, endOfMonth } from 'date-fns';
import { exportToExcel } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';

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

interface LookupCompany { id: string; name: string; phone: string | null; email: string | null; }
interface LookupDriver { id: string; name: string; vehicle_number: string; phone?: string; company_id: string | null; }

/** 차량번호에서 뒤 4자리 숫자 추출 */
function extractLast4(vehicleNumber: string): string {
  const nums = vehicleNumber.replace(/[^0-9]/g, '');
  return nums.length >= 4 ? nums.slice(-4) : nums;
}

/** 뒤 4자리로 기사 검색 */
function findDriverByLast4(drivers: LookupDriver[], last4: string): LookupDriver | null {
  if (last4.length < 4) return null;
  return drivers.find(d => extractLast4(d.vehicle_number) === last4) || null;
}

type DateMode = 'month' | 'day' | 'period';

const EXCEL_COLS = [
  { key: 'shipment_date', header: '상차요청일' },
  { key: 'company_name', header: '운송사' },
  { key: 'customer_name', header: '거래처' },
  { key: 'product_name', header: '제품명' },
  { key: 'silo', header: '사일로' },
  { key: 'transport_type', header: '차량종류' },
  { key: 'vehicle_number', header: '차량번호' },
  { key: 'driver_name', header: '기사성명' },
  { key: 'driver_phone', header: '기사연락처' },
  { key: 'weight_net', header: '계근수량' },
  { key: 'notes', header: '비고' },
  { key: 'certificate_time', header: '출하증발급시간' },
];

// ── Component ──────────────────────────────────────────
export default function DispatchPage() {
  const supabase = createClient();
  const toast = useToast();

  // ── Auth / Role ──
  const [userRole, setUserRole] = useState<string>('admin');
  const [userCompanyId, setUserCompanyId] = useState<string>('');

  useEffect(() => {
    const session = getSession();
    if (session?.profile) {
      setUserRole(session.profile.role || 'admin');
      setUserCompanyId(session.profile.company_id || '');
    }
  }, []);

  const isAdmin = userRole === 'admin' || userRole === 'monitor';
  const isTransporter = userRole === 'transporter';

  // ── Data State ──
  const [data, setData] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<LookupCompany[]>([]);
  const [drivers, setDrivers] = useState<LookupDriver[]>([]);

  // ── Filter State ──
  const [dateMode, setDateMode] = useState<DateMode>('day');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [periodFrom, setPeriodFrom] = useState(format(new Date(), 'yyyy-MM-01'));
  const [periodTo, setPeriodTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Auto-collapse filter on mobile
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) setFilterCollapsed(true);
    };
    checkMobile();
  }, []);

  // ── Editing State ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    company_id: string;
    driver_id: string;
    driver_name: string;
    driver_phone: string;
    vehicle_number: string;
    vehicleSearch: string;  // 뒤4자리 검색어
    weight_net: number | null;
    notes: string;
    memo: string;
  } | null>(null);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // ── Date Range ──
  const getDateRange = useCallback(() => {
    switch (dateMode) {
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

      // 운송사 필터 (관리자) 또는 운송사 자동필터
      const compFilter = isTransporter ? userCompanyId : filterCompanyId;
      if (compFilter) query = query.eq('company_id', compFilter);

      const { data: result, error } = await query;
      if (error) throw error;
      setData(result || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, getDateRange, filterCompanyId, isTransporter, userCompanyId, toast]);

  const fetchLookups = useCallback(async () => {
    const [compRes, driverRes] = await Promise.all([
      supabase.from('transport_companies').select('id, name, phone, email').eq('is_active', true).order('name'),
      supabase.from('drivers').select('id, name, vehicle_number, phone, company_id').eq('is_active', true).order('name'),
    ]);
    setCompanies(compRes.data || []);
    setDrivers(driverRes.data || []);
  }, [supabase]);

  useEffect(() => {
    fetchData();
    fetchLookups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──
  const handlePrevDay = () => setSelectedDate(format(subDays(new Date(selectedDate + 'T00:00:00'), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setSelectedDate(format(addDays(new Date(selectedDate + 'T00:00:00'), 1), 'yyyy-MM-dd'));

  // ── Inline Editing ──
  const startEdit = (row: Shipment) => {
    const driver = drivers.find(d => d.id === row.driver_id);
    setEditingId(row.id);
    setEditData({
      company_id: row.company_id || '',
      driver_id: row.driver_id || '',
      driver_name: row.driver_name || driver?.name || '',
      driver_phone: driver?.phone || '',
      vehicle_number: row.vehicle_number || '',
      vehicleSearch: row.vehicle_number ? extractLast4(row.vehicle_number) : '',
      weight_net: row.weight_net,
      notes: row.notes || '',
      memo: row.memo || '',
    });
    setShowVehicleDropdown(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editData) return;

    // D+3 제한: 운송사는 출하일 +3일까지만 계근수량 수정 가능
    const row = data.find(r => r.id === editingId);
    if (isTransporter && row) {
      const shipDate = new Date(row.shipment_date + 'T00:00:00');
      const deadline = addDays(shipDate, 3);
      const now = new Date();
      if (now > deadline && editData.weight_net !== row.weight_net) {
        toast.error('계근수량은 출하일 +3일까지만 수정 가능합니다.');
        return;
      }
    }

    try {
      const updatePayload: Record<string, unknown> = {
        notes: editData.notes || null,
        memo: editData.memo || null,
      };

      if (isAdmin) {
        updatePayload.company_id = editData.company_id || null;
      }

      // 기사/차량/계근 — 운송사 또는 관리자
      updatePayload.driver_id = editData.driver_id || null;
      updatePayload.vehicle_number = editData.vehicle_number || null;
      updatePayload.weight_net = editData.weight_net;

      const { error } = await supabase.from('shipments').update(updatePayload).eq('id', editingId);
      if (error) throw error;

      toast.success('저장되었습니다.');
      cancelEdit();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패');
    }
  };

  const handleDriverSelect = (driverId: string) => {
    if (!editData) return;
    const driver = drivers.find(d => d.id === driverId);
    setEditData({
      ...editData,
      driver_id: driverId,
      driver_name: driver?.name || '',
      driver_phone: driver?.phone || '',
      vehicle_number: driver?.vehicle_number || editData.vehicle_number,
      vehicleSearch: driver?.vehicle_number ? extractLast4(driver.vehicle_number) : editData.vehicleSearch,
    });
    setShowVehicleDropdown(false);
  };

  /** 차량번호 뒤4자리 입력 시 자동매칭 */
  const handleVehicleSearch = (value: string) => {
    if (!editData) return;
    // 숫자만 허용, 최대 4자리
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 4);
    setEditData({ ...editData, vehicleSearch: cleaned });
    setShowVehicleDropdown(true);

    // 4자리 완성 시 자동매칭
    if (cleaned.length === 4) {
      const matchedDriver = findDriverByLast4(
        editData.company_id ? drivers.filter(d => d.company_id === editData.company_id) : drivers,
        cleaned
      );
      if (matchedDriver) {
        setEditData({
          ...editData,
          vehicleSearch: cleaned,
          driver_id: matchedDriver.id,
          driver_name: matchedDriver.name,
          driver_phone: matchedDriver.phone || '',
          vehicle_number: matchedDriver.vehicle_number,
        });
        setShowVehicleDropdown(false);
      }
    }
  };

  /** 드롭다운에서 차량 선택 */
  const handleVehicleSelect = (driver: LookupDriver) => {
    if (!editData) return;
    setEditData({
      ...editData,
      driver_id: driver.id,
      driver_name: driver.name,
      driver_phone: driver.phone || '',
      vehicle_number: driver.vehicle_number,
      vehicleSearch: extractLast4(driver.vehicle_number),
    });
    setShowVehicleDropdown(false);
  };

  // ── Helpers ──
  const filteredDrivers = useMemo(() => {
    if (!editData?.company_id) return drivers;
    return drivers.filter(d => d.company_id === editData.company_id);
  }, [drivers, editData?.company_id]);

  /** 차량번호 드롭다운용 필터 (뒤4자리 검색) */
  const vehicleDropdownList = useMemo(() => {
    const base = editData?.company_id ? drivers.filter(d => d.company_id === editData.company_id) : drivers;
    if (!editData?.vehicleSearch) return base.slice(0, 20);
    return base.filter(d => extractLast4(d.vehicle_number).includes(editData.vehicleSearch)).slice(0, 15);
  }, [drivers, editData?.company_id, editData?.vehicleSearch]);

  const handleExcel = () => {
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLS, '배차관리');
  };

  const formatCertTime = (t: string | null) => {
    if (!t) return '';
    try {
      const d = new Date(t);
      return `${format(d, 'yyyy-MM-dd')} ${format(d, 'HH:mm')}`;
    } catch { return ''; }
  };

  // ── Totals ──
  const totalWeight = data.reduce((sum, d) => sum + (d.weight_net || 0), 0);
  const assignedCount = data.filter(d => d.company_name).length;
  const driverAssignedCount = data.filter(d => d.driver_name || d.vehicle_number).length;

  // ── Render ──
  return (
    <div className="flex h-full overflow-hidden relative">

      {/* ═══ Mobile Filter Overlay ═══ */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setMobileFilterOpen(false)}
        />
      )}

      {/* ═══ Filter Panel (Left) ═══ */}
      {/* Desktop: hidden when filterCollapsed; Mobile: slide-in overlay */}
      {(!filterCollapsed || mobileFilterOpen) && (
        <div
          className={
            mobileFilterOpen
              ? 'fixed top-0 left-0 h-full z-50 md:hidden flex flex-col overflow-auto'
              : 'hidden md:flex flex-col overflow-auto'
          }
          style={{
            width: 220, flexShrink: 0, borderRight: '1px solid #e5e7eb',
            backgroundColor: '#fff',
          }}>
          {/* Filter Header */}
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
              onClick={() => { setFilterCollapsed(true); setMobileFilterOpen(false); }}
              style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 600 }}
            >접기 ◀</button>
          </div>

          <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Date Mode */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {([
                { value: 'month', label: '월별' },
                { value: 'day', label: '일자별' },
                { value: 'period', label: '기간별' },
              ] as const).map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, cursor: 'pointer',
                  color: dateMode === opt.value ? '#1d4ed8' : '#6b7280', fontWeight: dateMode === opt.value ? 700 : 400,
                }}>
                  <input type="radio" name="dateMode" checked={dateMode === opt.value} onChange={() => setDateMode(opt.value)}
                    style={{ width: 12, height: 12, accentColor: '#2563eb' }} />
                  {opt.label}
                </label>
              ))}
            </div>

            {/* Date Selector */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>날짜선택</label>
              {dateMode === 'period' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="form-input" style={{ fontSize: 13, padding: '6px 8px' }} />
                  <span style={{ fontSize: 12, textAlign: 'center', color: '#9ca3af' }}>~</span>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="form-input" style={{ fontSize: 13, padding: '6px 8px' }} />
                </div>
              ) : dateMode === 'month' ? (
                <input type="month" value={selectedDate.slice(0, 7)} onChange={e => setSelectedDate(`${e.target.value}-01`)}
                  className="form-input" style={{ fontSize: 13, padding: '6px 8px' }} />
              ) : (
                <>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="form-input" style={{ fontSize: 13, padding: '6px 8px' }} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                    <button onClick={handlePrevDay} style={{
                      flex: 1, fontSize: 12, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
                      background: '#f8fafc', color: '#475569', border: '1px solid #d1d5db', fontWeight: 600,
                    }}>◀ 전날</button>
                    <button onClick={handleNextDay} style={{
                      flex: 1, fontSize: 12, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
                      background: '#f8fafc', color: '#475569', border: '1px solid #d1d5db', fontWeight: 600,
                    }}>다음날 ▶</button>
                  </div>
                </>
              )}
            </div>

            {/* 운송사 필터 — 관리자만 */}
            {isAdmin && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>운송사</label>
                <select value={filterCompanyId} onChange={e => setFilterCompanyId(e.target.value)}
                  className="form-input" style={{ fontSize: 13, padding: '6px 8px' }}>
                  <option value="">[전체]</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <button onClick={() => fetchData()} style={{
              width: '100%', fontSize: 13, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontWeight: 700, background: '#2563eb', color: '#fff',
            }}>조회</button>
          </div>
        </div>
      )}

      {/* ═══ Main Content ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Title Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff', gap: 8,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}>
            {/* Mobile: show filter toggle always; Desktop: show only when collapsed */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileFilterOpen(true);
                } else {
                  setFilterCollapsed(false);
                }
              }}
              className={filterCollapsed ? 'flex md:flex' : 'flex md:hidden'}
              style={{
                fontSize: 13, padding: '5px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
                borderRadius: 6, cursor: 'pointer', color: '#475569', fontWeight: 600,
              }}
            >필터 ▶</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 4, height: 18, borderRadius: 2, background: '#d97706' }} />
              <h1 style={{ fontSize: 16, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>배차 관리</h1>
            </div>

            {/* KPI — hidden on mobile, visible on tablet+ */}
            <div className="hidden sm:flex" style={{ gap: 5, flexShrink: 0, marginLeft: 4 }}>
              {[
                { label: '전체', value: data.length, unit: '건', bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', accent: '#3b82f6' },
                { label: '배차', value: assignedCount, unit: '건', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', accent: '#16a34a' },
                { label: '기사', value: driverAssignedCount, unit: '건', bg: '#fefce8', border: '#fde68a', color: '#b45309', accent: '#d97706' },
                { label: '계근', value: totalWeight.toFixed(1), unit: '톤', bg: '#f5f3ff', border: '#c4b5fd', color: '#6d28d9', accent: '#7c3aed' },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                  borderRadius: 6, background: kpi.bg, border: `1px solid ${kpi.border}`,
                }}>
                  <span style={{ fontSize: 12, color: kpi.accent, fontWeight: 600 }}>{kpi.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: kpi.color }}>{kpi.value}</span>
                  <span style={{ fontSize: 11, color: kpi.accent }}>{kpi.unit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap" style={{ gap: 5, flexShrink: 0 }}>
            <button onClick={() => fetchData()} style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600,
              background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              조회
            </button>
            {isAdmin && (
              <button onClick={() => toast.info('저장 기능: 편집 후 행별 저장 버튼을 사용하세요.')} style={{
                fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600,
                background: '#f59e0b', color: '#fff',
              }}>저장</button>
            )}
            <button onClick={handleExcel} style={{
              fontSize: 13, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontWeight: 500,
              background: '#fff', color: '#374151', border: '1px solid #d1d5db',
            }}>엑셀내보내기</button>
          </div>
        </div>

        {/* ── Data Grid ── */}
        <div style={{ flex: 1, overflow: 'auto', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#6b7280', fontSize: 13 }}>
              데이터를 불러오는 중...
            </div>
          ) : data.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9ca3af', fontSize: 13 }}>
              조회된 데이터가 없습니다.
            </div>
          ) : (
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 32, textAlign: 'center', padding: '7px 6px' }}>#</th>
                  <th style={{ minWidth: 70, padding: '7px 6px' }}>운송사</th>
                  <th style={{ minWidth: 90, padding: '7px 6px' }}>상차요청일</th>
                  <th style={{ minWidth: 130, padding: '7px 6px' }}>거래처</th>
                  <th style={{ minWidth: 120, padding: '7px 6px' }}>제품명</th>
                  <th style={{ minWidth: 60, padding: '7px 6px' }}>사일로</th>
                  <th style={{ minWidth: 120, padding: '7px 6px' }}>비고</th>
                  <th style={{ minWidth: 60, padding: '7px 6px' }}>차량종류</th>
                  <th style={{ minWidth: 100, padding: '7px 6px' }}>차량번호</th>
                  <th style={{ minWidth: 80, padding: '7px 6px' }}>기사성명</th>
                  <th style={{ minWidth: 110, padding: '7px 6px' }}>기사연락처</th>
                  <th style={{ minWidth: 80, textAlign: 'right', padding: '7px 6px' }}>계근수량(D+1)</th>
                  <th style={{ minWidth: 140, padding: '7px 6px' }}>출하증발급시간</th>
                  <th style={{ width: 50, textAlign: 'center', padding: '7px 6px' }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => {
                  const isEditingRow = editingId === row.id;

                  if (isEditingRow && editData) {
                    const companyDrivers = editData.company_id
                      ? drivers.filter(d => d.company_id === editData.company_id)
                      : drivers;

                    return (
                      <tr key={row.id} style={{ backgroundColor: '#eff6ff', borderLeft: '2px solid #3b82f6' }}>
                        <td style={{ textAlign: 'center', color: '#9ca3af', padding: '6px 8px', fontSize: 13 }}>{idx + 1}</td>
                        {/* 운송사 — 관리자만 수정 */}
                        <td style={{ padding: '2px 3px' }}>
                          {isAdmin ? (
                            <select value={editData.company_id}
                              onChange={e => setEditData({ ...editData, company_id: e.target.value, driver_id: '' })}
                              style={{ width: '100%', fontSize: 12, padding: '4px 4px', border: '1px solid #d1d5db', borderRadius: 4 }}>
                              <option value="">-</option>
                              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          ) : (
                            <span style={{ padding: '6px 8px', fontSize: 13 }}>{row.company_name || '-'}</span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: 13, whiteSpace: 'nowrap' }}>{row.shipment_date?.slice(2)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.customer_name || '-'}</td>
                        <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.product_name || '-'}</td>
                        <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.silo || '-'}</td>
                        {/* 비고 */}
                        <td style={{ padding: '2px 3px' }}>
                          <input value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })}
                            style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4 }}
                            placeholder="비고" />
                        </td>
                        {/* 차량종류 (read-only) */}
                        <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.transport_type || '-'}</td>
                        {/* 차량번호 — 뒤4자리 자동완성 */}
                        <td style={{ padding: '2px 3px', position: 'relative' }}>
                          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <input
                              value={editData.vehicleSearch}
                              onChange={e => handleVehicleSearch(e.target.value)}
                              onFocus={() => setShowVehicleDropdown(true)}
                              onBlur={() => setTimeout(() => setShowVehicleDropdown(false), 200)}
                              placeholder="뒤4자리"
                              maxLength={4}
                              style={{
                                width: 52, fontSize: 13, padding: '4px 6px', border: '1px solid #3b82f6',
                                borderRadius: 4, textAlign: 'center', fontWeight: 700,
                                background: '#eff6ff', color: '#1d4ed8',
                              }}
                            />
                            <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                              {editData.vehicle_number || ''}
                            </span>
                          </div>
                          {/* 드롭다운 */}
                          {showVehicleDropdown && vehicleDropdownList.length > 0 && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 100,
                              background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
                              minWidth: 260,
                            }}>
                              {vehicleDropdownList.map(d => (
                                <div key={d.id}
                                  onMouseDown={() => handleVehicleSelect(d)}
                                  style={{
                                    padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                                    display: 'flex', justifyContent: 'space-between', gap: 8,
                                    borderBottom: '1px solid #f3f4f6',
                                    background: editData.driver_id === d.id ? '#eff6ff' : '#fff',
                                  }}
                                >
                                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{extractLast4(d.vehicle_number)}</span>
                                  <span style={{ color: '#374151' }}>{d.vehicle_number}</span>
                                  <span style={{ color: '#6b7280' }}>{d.name}</span>
                                  <span style={{ color: '#94a3b8', fontSize: 11 }}>{d.phone || ''}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        {/* 기사성명 */}
                        <td style={{ padding: '2px 3px' }}>
                          {editData.driver_name ? (
                            <span style={{ padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                              {editData.driver_name}
                            </span>
                          ) : (
                            <select value={editData.driver_id}
                              onChange={e => handleDriverSelect(e.target.value)}
                              style={{ width: '100%', fontSize: 12, padding: '4px 4px', border: '1px solid #d1d5db', borderRadius: 4 }}>
                              <option value="">-</option>
                              {companyDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          )}
                        </td>
                        {/* 기사연락처 */}
                        <td style={{ padding: '6px 8px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                          {editData.driver_phone || '-'}
                        </td>
                        {/* 계근수량 */}
                        <td style={{ padding: '2px 3px' }}>
                          <input type="number" step="0.01"
                            value={editData.weight_net ?? ''}
                            onChange={e => setEditData({ ...editData, weight_net: e.target.value ? parseFloat(e.target.value) : null })}
                            style={{ width: 70, fontSize: 12, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap', color: '#6b7280' }}>
                          {formatCertTime(row.certificate_time)}
                        </td>
                        {/* 작업 */}
                        <td style={{ textAlign: 'center', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          <button onClick={saveEdit} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 2,
                          }} title="저장">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          </button>
                          <button onClick={cancelEdit} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2, marginLeft: 2,
                          }} title="취소">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // ── Display Mode ──
                  // 관리자(하멜코리아)는 원클릭, 운송사는 더블클릭
                  const driverInfo = drivers.find(d => d.id === row.driver_id);
                  return (
                    <tr key={row.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { if (isAdmin) startEdit(row); }}
                      onDoubleClick={() => { if (!isAdmin) startEdit(row); }}
                    >
                      <td style={{ textAlign: 'center', color: '#9ca3af', padding: '6px 8px', fontSize: 13 }}>{idx + 1}</td>
                      <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: row.company_name ? 600 : 400, color: row.company_name ? '#1d4ed8' : '#d1d5db' }}>
                        {row.company_name || '-'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '6px 8px', fontSize: 13 }}>{row.shipment_date?.slice(2)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.customer_name || '-'}</td>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.product_name || '-'}</td>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.silo || '-'}</td>
                      <td style={{ padding: '6px 8px', fontSize: 13, color: '#6b7280', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.notes || ''}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.transport_type || '-'}</td>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>
                        {row.vehicle_number ? (
                          <span>
                            {row.vehicle_number}
                            <span style={{ marginLeft: 4, fontWeight: 700, color: '#2563eb', fontSize: 12 }}>
                              ({extractLast4(row.vehicle_number)})
                            </span>
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>{row.driver_name || '-'}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {driverInfo?.phone || '-'}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}>
                        {row.weight_net != null ? row.weight_net.toFixed(2) : '0.00'}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap', color: row.certificate_time ? '#b45309' : '#d1d5db',
                        backgroundColor: row.certificate_time ? '#fef9c3' : undefined }}>
                        {formatCertTime(row.certificate_time)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                        <button onClick={(e) => { e.stopPropagation(); startEdit(row); }} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 2,
                        }} title="편집">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Bottom Summary ── */}
        <div className="hidden sm:flex" style={{
          alignItems: 'center', gap: 0,
          padding: '0 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', height: 48,
        }}>
          {[
            { label: '총 건수', value: data.length, unit: '건', color: '#1d4ed8', bg: '#eff6ff', borderColor: '#93c5fd' },
            { label: '배차완료', value: assignedCount, unit: '건', color: '#15803d', bg: '#f0fdf4', borderColor: '#bbf7d0' },
            { label: '기사배정', value: driverAssignedCount, unit: '건', color: '#b45309', bg: '#fffbeb', borderColor: '#fcd34d' },
            { label: '운송사', value: new Set(data.map(r => r.company_name).filter(Boolean)).size, unit: '개사', color: '#1d4ed8', bg: '#eff6ff', borderColor: '#93c5fd' },
            { label: '계근합계', value: totalWeight.toFixed(2), unit: '톤', color: '#6d28d9', bg: '#f5f3ff', borderColor: '#a78bfa' },
          ].map((item, i) => (
            <div key={item.label} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: '100%', borderRight: i < 4 ? '1px solid #e2e8f0' : 'none',
            }}>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: item.color }}>{item.value}</span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{item.unit}</span>
            </div>
          ))}
        </div>

        {/* ── Mobile-only compact summary ── */}
        <div className="flex sm:hidden" style={{
          padding: '6px 12px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
          gap: 12, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            총 <strong style={{ color: '#1d4ed8' }}>{data.length}</strong>건 &nbsp;·&nbsp;
            배차 <strong style={{ color: '#15803d' }}>{assignedCount}</strong>건 &nbsp;·&nbsp;
            계근 <strong style={{ color: '#6d28d9' }}>{totalWeight.toFixed(1)}</strong>톤
          </span>
        </div>
      </div>
    </div>
  );
}
