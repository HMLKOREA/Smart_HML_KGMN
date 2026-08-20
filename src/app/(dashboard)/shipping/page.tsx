'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, addDays, subDays, endOfMonth } from 'date-fns';
import ShipmentPrint from '@/components/modules/shipping/ShipmentPrint';
import ShipmentListPrint from '@/components/modules/shipping/ShipmentListPrint';
import InlineShipmentRow, { type EditableRowData } from '@/components/modules/shipping/InlineShipmentRow';
import MultiCustomerPanel, { type CustomerProductMaster } from '@/components/modules/shipping/MultiCustomerPanel';
import { useShipmentCrud } from '@/components/modules/shipping/useShipmentCrud';
import { exportToExcel } from '@/lib/utils/exportExcel';
import { parseCsv, readFileText } from '@/lib/utils/importCsv';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import MultiSelectFilter from '@/components/ui/MultiSelectFilter';
import { smartCompare } from '@/lib/utils/sortCompare';

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
  { key: 'shipment_number', header: '출하번호' },
  { key: 'shipment_date', header: '출하일자' },
  { key: 'transport_type', header: '운송구분' },
  { key: 'customer_name', header: '거래처' },
  { key: 'product_name', header: '제품명' },
  { key: 'company_name', header: '운송사' },
  { key: 'driver_name', header: '기사명' },
  { key: 'vehicle_number', header: '차량정보' },
  { key: 'silo', header: '사일로' },
  { key: 'weight_empty', header: '공차중량' },
  { key: 'weight_loaded', header: '적재중량' },
  { key: 'weight_net', header: '계근결과' },
  { key: 'status', header: '상태' },
  { key: 'notes', header: '기타' },
  { key: 'certificate_time', header: '출하증 발급시간' },
];

const TRANSPORT_TYPES = ['탱크', '덤프', '카고'];

// 출하내역 그리드 컬럼(순서/기본너비) — 컬럼 너비 드래그 조절용
const SHIP_COLS: { key: string; w: number }[] = [
  { key: 'rownum', w: 34 },
  { key: 'check', w: 34 },
  { key: 'shipment_date', w: 92 },
  { key: 'transport_type', w: 66 },
  { key: 'customer_name', w: 150 },
  { key: 'product_name', w: 140 },
  { key: 'company_name', w: 84 },
  { key: 'vehicle_number', w: 110 },
  { key: 'silo', w: 66 },
  { key: 'shipped', w: 40 },
  { key: 'weight_net', w: 82 },
  { key: 'notes', w: 130 },
  { key: 'certificate_time', w: 150 },
  { key: 'dispatch_notified', w: 60 },
  { key: 'action', w: 54 },
];
const SHIP_COLS_LS_KEY = 'smarthml_ship_col_widths_v1';

/** 대기화면 비밀번호 (모든 운송사 공통) */
const WAITING_SCREEN_PASSWORD = '1234';

/** 대기화면 운송사 표시 순서 */
const COMPANY_DISPLAY_ORDER = ['퍼스트', '성진', '대경', '강천', '우주', '성윤', '우신', '태윤', '동방', '진흥', '상차도'];

// ── Component ──────────────────────────────────────────
export default function ShippingPage() {
  const supabase = createClient();
  const toast = useToast();
  const crud = useShipmentCrud();
  const session = useMemo(() => getSession(), []);
  const isTransporter = session?.profile?.role === 'transporter';
  const isAdmin = session?.profile?.role === 'admin';

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
  const [filterTransportTypes, setFilterTransportTypes] = useState<string[]>([]);
  const [filterCustomerNames, setFilterCustomerNames] = useState<string[]>([]);
  const [filterCompanyNames, setFilterCompanyNames] = useState<string[]>([]);
  const [filterCollapsed, setFilterCollapsed] = useState(false);

  // ── Selection State ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Inline Editing State ──
  const [editingRows, setEditingRows] = useState<Map<string, EditableRowData>>(new Map());
  const [newRows, setNewRows] = useState<Shipment[]>([]);

  // ── Modal State (kept: print, waiting, dispatch notify) ──
  const [showPrint, setShowPrint] = useState(false);
  const [printRow, setPrintRow] = useState<Shipment | null>(null);
  const [showListPrint, setShowListPrint] = useState(false);
  const [showWaitingScreen, setShowWaitingScreen] = useState(false);
  const [showDispatchNotify, setShowDispatchNotify] = useState(false);
  const [notifyMethod, setNotifyMethod] = useState<'email' | 'kakao'>('email');
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [showMultiCustomer, setShowMultiCustomer] = useState(false);
  const [multiCustomerMaster, setMultiCustomerMaster] = useState<CustomerProductMaster[]>([]);

  // ── 출하내역 컬럼 너비(드래그 조절, localStorage 저장) ──
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {};
    SHIP_COLS.forEach(c => { base[c.key] = c.w; });
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(localStorage.getItem(SHIP_COLS_LS_KEY) || '{}');
        for (const k of Object.keys(saved)) if (typeof saved[k] === 'number') base[k] = saved[k];
      } catch { /* ignore */ }
    }
    return base;
  });
  const startColResize = useCallback((key: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key] ?? (SHIP_COLS.find(c => c.key === key)?.w ?? 100);
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(36, startW + (ev.clientX - startX));
      setColWidths(prev => ({ ...prev, [key]: next }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setColWidths(prev => {
        try { localStorage.setItem(SHIP_COLS_LS_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
        return prev;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [colWidths]);
  const resetColWidths = useCallback(() => {
    const base: Record<string, number> = {};
    SHIP_COLS.forEach(c => { base[c.key] = c.w; });
    setColWidths(base);
    try { localStorage.removeItem(SHIP_COLS_LS_KEY); } catch { /* ignore */ }
  }, []);
  const [waitingCompanyId, setWaitingCompanyId] = useState<string>('');
  const [waitingStep, setWaitingStep] = useState<'select' | 'password' | 'data'>('select');
  const [waitingPassword, setWaitingPassword] = useState('');
  const [waitingPasswordError, setWaitingPasswordError] = useState('');
  const [waitingCompanyName, setWaitingCompanyName] = useState('');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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
      const PAGE_SIZE = 1000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let allData: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const start = page * PAGE_SIZE;
        const end = start + PAGE_SIZE - 1;
        let query = supabase
          .from('v_shipments')
          .select('*')
          .gte('shipment_date', range.from)
          .lte('shipment_date', range.to)
          .order('shipment_date', { ascending: true })
          .order('created_at', { ascending: true })
          .range(start, end);

        if (filterTransportTypes.length) query = query.in('transport_type', filterTransportTypes);
        if (filterCustomerNames.length) {
          const ids = filterCustomerNames.map(n => customers.find(c => c.name === n)?.id).filter(Boolean) as string[];
          query = query.in('customer_id', ids.length ? ids : ['__none__']);
        }
        if (filterCompanyNames.length) {
          const ids = filterCompanyNames.map(n => companies.find(c => c.name === n)?.id).filter(Boolean) as string[];
          query = query.in('company_id', ids.length ? ids : ['__none__']);
        }

        const { data: chunk, error } = await query;
        if (error) throw error;

        const rows = chunk || [];
        allData = [...allData, ...rows];
        hasMore = rows.length === PAGE_SIZE;
        page++;
      }

      setData(allData);
      setSelectedIds(new Set());
      setEditingRows(new Map());
      setNewRows([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, getDateRange, filterTransportTypes, filterCustomerNames, filterCompanyNames, customers, companies, toast]);

  const fetchLookups = useCallback(async () => {
    try {
      // Supabase 1000행 제한 → 페이징 조회 (lookups)
      const LK_PAGE = 1000;
      const fetchAll = async (table: string, select: string) => {
        let all: Record<string, unknown>[] = [];
        let pg = 0;
        let more = true;
        while (more) {
          const { data } = await supabase.from(table).select(select).eq('is_active', true).order('name').range(pg * LK_PAGE, (pg + 1) * LK_PAGE - 1);
          const rows = (data || []) as unknown as Record<string, unknown>[];
          all = [...all, ...rows];
          more = rows.length === LK_PAGE;
          pg++;
        }
        return all;
      };

      const [custRes, prodRes, driverRes, compRes] = await Promise.allSettled([
        fetchAll('customers', 'id, name'),
        fetchAll('products', 'id, code, name, unit'),
        fetchAll('drivers', 'id, name, vehicle_number, company_id'),
        fetchAll('transport_companies', 'id, name, phone, email'),
      ]);
      setCustomers(custRes.status === 'fulfilled' ? custRes.value as unknown as LookupCustomer[] : []);
      setProducts(prodRes.status === 'fulfilled' ? prodRes.value as unknown as LookupProduct[] : []);
      setDrivers(driverRes.status === 'fulfilled' ? driverRes.value as unknown as LookupDriver[] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value as unknown as LookupCompany[] : []);

      const failedLookups = [
        custRes.status === 'rejected' ? '거래처' : null,
        prodRes.status === 'rejected' ? '제품' : null,
        driverRes.status === 'rejected' ? '기사' : null,
        compRes.status === 'rejected' ? '운송사' : null,
      ].filter(Boolean);
      if (failedLookups.length > 0) {
        toast.error(`기초 데이터 로딩 실패: ${failedLookups.join(', ')}`);
      }
    } catch (err) {
      toast.error('기초 데이터 로딩 중 오류가 발생했습니다.');
    }
  }, [supabase, toast]);

  useEffect(() => { fetchLookups(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 날짜/모드 변경 시 자동 조회
  useEffect(() => { fetchData(); }, [selectedDate, dateMode, periodFrom, periodTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 정렬 (헤더 클릭: 오름차순 → 내림차순 → 해제) ──
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const toggleSort = useCallback((key: string) => {
    setSort(prev =>
      !prev || prev.key !== key ? { key, dir: 'asc' }
        : prev.dir === 'asc' ? { key, dir: 'desc' }
          : null
    );
  }, []);
  const sortedData = useMemo(() => {
    if (!sort) return data;
    const arr = [...data];
    arr.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.key];
      const bv = (b as unknown as Record<string, unknown>)[sort.key];
      const cmp = smartCompare(av, bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sort]);

  // ── Selection ──
  const allRows = useMemo(() => [...newRows, ...sortedData], [newRows, sortedData]);
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

  const handleSaveAll = useCallback(async () => {
    const ids = Array.from(editingRows.keys());
    if (ids.length === 0) { toast.info('저장할 편집 항목이 없습니다.'); return; }
    let successCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const editData = editingRows.get(id);
      if (!editData) continue;
      if (!editData.customer_id || !editData.product_id) { failCount++; continue; }
      const isNew = newRows.some(r => r.id === id);
      const result = await crud.saveRow(editData, isNew ? null : id);
      if (result.success) {
        successCount++;
        setEditingRows(prev => { const next = new Map(prev); next.delete(id); return next; });
        if (isNew) setNewRows(prev => prev.filter(r => r.id !== id));
      } else {
        failCount++;
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount}건 저장 완료${failCount > 0 ? `, ${failCount}건 실패` : ''}`);
      fetchData();
    } else if (failCount > 0) {
      toast.error(`${failCount}건 저장 실패 (거래처/제품 미입력 확인)`);
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
    setNotifyMethod('kakao'); // 배차통보는 운송사 담당자에게 문자/카카오
    setShowDispatchNotify(true);
  };

  const handleDispatchNotifyConfirm = async () => {
    setNotifyLoading(true);
    try {
      const selected = data.filter(d => selectedIds.has(d.id));
      if (selected.length === 0) { toast.warning('통보 대상이 없습니다.'); setNotifyLoading(false); return; }

      // 배차통보 수신자 = 운송사 담당자 (운송사별 연락처/휴대폰)
      const companyIds = [...new Set(selected.map(s => s.company_id).filter((id): id is string => !!id))];
      if (companyIds.length === 0) { toast.warning('운송사가 지정되지 않은 출하는 통보할 수 없습니다.'); setNotifyLoading(false); return; }
      const { data: coData } = await supabase
        .from('transport_companies')
        .select('id, name, email, phone')
        .in('id', companyIds);

      // 그룹 키를 운송사로 사용 (라우트는 customer_id 기준 그룹핑 → 운송사 id를 넣어 재사용)
      const contactMap: Record<string, { name: string; email: string; phone: string }> = {};
      (coData || []).forEach((c: { id: string; name: string; email?: string; phone?: string }) => {
        contactMap[c.id] = { name: c.name, email: c.email || '', phone: c.phone || '' };
      });

      // 발송 대상 정보 구성 (수신 그룹 = 운송사)
      const shipmentPayload = selected.filter(s => s.company_id).map(s => ({
        id: s.id,
        shipment_date: s.shipment_date,
        customer_id: s.company_id as string,   // 그룹 키 = 운송사
        customer_name: s.company_name,          // 수신자명 = 운송사명
        product_name: s.product_name,
        company_name: s.company_name,
        vehicle_number: s.vehicle_number,
        driver_name: s.driver_name,
        quantity: s.quantity,
        unit: s.unit,
        delivery_address: s.delivery_address,
        notes: s.notes,
      }));

      // 선택된 방법으로 발송 (배차통보는 문자/카카오 권장)
      const endpoint = notifyMethod === 'email' ? '/api/notify/email' : '/api/notify/kakao';

      const notifyRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipments: shipmentPayload, customerMap: contactMap }),
      });

      const notifyResult = await notifyRes.json();

      if (!notifyRes.ok && notifyRes.status === 400) {
        // 설정 미완료
        const methodLabel = notifyMethod === 'email' ? 'SMTP' : 'Solapi';
        toast.error(`${methodLabel} 설정이 필요합니다. 관리자에게 문의하세요.`);
        setNotifyLoading(false);
        return;
      }

      // 발송이 성공했을 때만 '통보완료' 플래그 설정 (실패건이 통보완료로 표기되지 않도록)
      const sendOk = notifyRes.ok && notifyResult.success !== false;
      if (sendOk) {
        const dbResult = await crud.batchUpdate(Array.from(selectedIds), { dispatch_notified: true });
        if (!dbResult.success) toast.error('통보는 발송됐으나 상태 업데이트에 실패했습니다.');
        else toast.success(notifyResult.message || '배차통보가 완료되었습니다.');
      } else {
        // 미발송 → 상태는 '미통보'로 유지
        toast.warning(notifyResult.message || notifyResult.error || '통보 발송에 실패했습니다. 연락처를 확인해주세요. (미통보 상태 유지)');
      }

      setShowDispatchNotify(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '배차통보 중 오류가 발생했습니다.');
    }
    setNotifyLoading(false);
  };

  const handleShipToggle = async (id: string, currentValue: boolean) => {
    const result = await crud.toggleShip(id, currentValue);
    if (result.success) fetchData();
    else toast.error(result.error || '출하 상태 변경 실패');
  };

  const handlePrint = () => {
    setShowListPrint(true);
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
  // 팝업(?waiting=1)으로 열리면 자동으로 대기화면 표시
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('waiting') === '1') {
      openWaitingScreen();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closeWaitingScreen = () => {
    // 팝업(새 창)으로 열린 대기화면이면 창을 닫는다 (독립 실행)
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('waiting') === '1') {
      window.close();
      return;
    }
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

  // ── 위하고(Wehago) 매출자료 양식 내보내기 ──
  const handleWehagoExport = () => {
    if (data.length === 0) { toast.warning('내보낼 출하 내역이 없습니다.'); return; }
    exportToExcel(
      data as unknown as Record<string, unknown>[],
      [
        { key: 'shipment_date', header: '작성일자' },
        { key: 'customer_name', header: '거래처명' },
        { key: 'product_name', header: '품목' },
        { key: 'transport_type', header: '규격' },
        { key: 'weight_net', header: '수량', formatter: (v) => (v == null ? '' : String(v)) },
        { key: 'unit', header: '단위', formatter: () => 'ton' },
        { key: 'vehicle_number', header: '차량번호' },
        { key: 'notes', header: '비고' },
      ],
      `위하고_매출자료_${selectedDate}`,
    );
    toast.success('위하고 매출자료 양식(CSV)을 내려받았습니다.');
  };

  // ── 엑셀(CSV) 가져오기: 출하 일괄등록 ──
  const handleExcelImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const rows = parseCsv(await readFileText(file));
        if (rows.length === 0) { toast.warning('데이터가 없습니다. (헤더 행 포함 CSV)'); return; }

        // 이름 → id 매핑 (대소문자/공백 무시)
        const norm = (s: string) => (s || '').trim().toLowerCase();
        const custMap = new Map(customers.map(c => [norm(c.name), c.id]));
        const prodMap = new Map(products.map(p => [norm(p.name), p.id]));
        const compMap = new Map(companies.map(c => [norm(c.name), c.id]));

        const pick = (r: Record<string, string>, ...keys: string[]) => {
          for (const k of keys) if (r[k] != null && r[k] !== '') return r[k];
          return '';
        };
        const ts = Date.now();
        const records: Record<string, unknown>[] = [];
        let skipped = 0;
        rows.forEach((r, i) => {
          const custName = pick(r, '거래처', '거래처명', 'customer');
          const prodName = pick(r, '제품명', '제품', 'product');
          const compName = pick(r, '운송사', 'company');
          const dateRaw = pick(r, '출하일자', '일자', 'shipment_date');
          const custId = custMap.get(norm(custName));
          const prodId = prodMap.get(norm(prodName));
          if (!custId || !prodId) { skipped++; return; } // 거래처/제품 필수
          const m = dateRaw.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
          const shipDate = m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : selectedDate;
          const w = parseFloat(pick(r, '계근결과', '중량', 'weight_net'));
          records.push({
            shipment_number: `WEB-${ts}-${i + 1}`,
            shipment_date: shipDate,
            transport_type: pick(r, '운송구분', 'transport_type') || null,
            customer_id: custId,
            product_id: prodId,
            company_id: compMap.get(norm(compName)) || null,
            vehicle_number: pick(r, '차량번호', '차량정보', 'vehicle_number') || null,
            silo: pick(r, '사일로', 'silo') || null,
            weight_net: isNaN(w) ? null : w,
            notes: pick(r, '기타', '비고', 'notes') || null,
            status: 'pending',
            is_shipped: false,
          });
        });

        if (records.length === 0) { toast.error(`등록 가능한 행이 없습니다. (거래처·제품명이 마스터와 일치해야 함, 건너뜀 ${skipped})`); return; }
        const { error } = await supabase.from('shipments').insert(records);
        if (error) { toast.error(`가져오기 실패: ${error.message}`); return; }
        toast.success(`${records.length}건 가져오기 완료${skipped ? ` (건너뜀 ${skipped}건)` : ''}`);
        fetchData();
      } catch (err) {
        toast.error(`가져오기 오류: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    input.click();
  };

  const handleMultiCustomerRegister = async (multiData: {
    shipment_date: string;
    entries: Array<{
      transport_type: string;
      customer_id: string;
      product_id: string;
      silo: string;
      count: number;
    }>;
  }) => {
    const rows: Array<{
      shipment_date: string;
      transport_type: string;
      customer_id: string;
      product_id: string;
      silo: string | null;
    }> = [];
    for (const entry of multiData.entries) {
      for (let i = 0; i < entry.count; i++) {
        rows.push({
          shipment_date: multiData.shipment_date,
          transport_type: entry.transport_type,
          customer_id: entry.customer_id,
          product_id: entry.product_id,
          silo: entry.silo || null,
        });
      }
    }
    const result = await crud.batchInsert(rows);
    if (result.success) {
      toast.success(`${rows.length}건의 출하가 등록되었습니다.`);
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
  if (isTransporter) return <AccessDenied />;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 7.5rem)', position: 'relative' }}>
      {/* ═══ Mobile Filter Overlay Backdrop ═══ */}
      {mobileFilterOpen && (
        <div
          onClick={() => setMobileFilterOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
          className="md:hidden"
        />
      )}

      {/* ═══ Left Filter Panel ═══ */}
      {/* On desktop: shown/hidden via filterCollapsed. On mobile: slide-in overlay */}
      {(!filterCollapsed || mobileFilterOpen) && (
        <div style={{
          width: 210, minWidth: 210,
          borderRight: '1px solid #e5e7eb',
          backgroundColor: '#fff',
          display: 'flex', flexDirection: 'column', overflow: 'auto',
        }}
          className={mobileFilterOpen ? 'fixed top-0 bottom-0 left-0 z-[95] shadow-xl md:relative md:z-auto md:shadow-none' : ''}
        >
          <div style={{
            padding: '9px 14px', borderBottom: '1px solid #e5e7eb',
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
            >
              접기 ◀
            </button>
          </div>

          <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Date Mode Radio */}
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                {([
                  { value: 'year', label: '년도별' },
                  { value: 'month', label: '월별' },
                  { value: 'day', label: '일자별' },
                  { value: 'period', label: '기간별' },
                ] as const).map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, cursor: 'pointer',
                    color: dateMode === opt.value ? '#1d4ed8' : '#6b7280', fontWeight: dateMode === opt.value ? 700 : 400,
                  }}>
                    <input
                      type="radio" name="dateMode"
                      checked={dateMode === opt.value}
                      onChange={() => setDateMode(opt.value)}
                      style={{ width: 12, height: 12, accentColor: '#2563eb' }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Date Selector */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>날짜선택</label>
              {dateMode === 'period' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <input type="date" value={periodFrom} max={periodTo} onChange={e => setPeriodFrom(e.target.value)} className="form-input" style={{ fontSize: 13, padding: '6px 8px' }} />
                  <span style={{ fontSize: 12, textAlign: 'center', color: '#9ca3af' }}>~</span>
                  <input type="date" value={periodTo} min={periodFrom} onChange={e => setPeriodTo(e.target.value)} className="form-input" style={{ fontSize: 13, padding: '6px 8px' }} />
                </div>
              ) : dateMode === 'year' ? (
                <input
                  type="number"
                  value={parseInt(selectedDate.slice(0, 4))}
                  onChange={e => setSelectedDate(`${e.target.value}-01-01`)}
                  className="form-input" style={{ fontSize: 13, padding: '6px 8px' }}
                  min={2020} max={2035}
                />
              ) : dateMode === 'month' ? (
                <input
                  type="month"
                  value={selectedDate.slice(0, 7)}
                  onChange={e => setSelectedDate(`${e.target.value}-01`)}
                  className="form-input" style={{ fontSize: 13, padding: '6px 8px' }}
                />
              ) : (
                <>
                  <input
                    type="date" value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="form-input" style={{ fontSize: 13, padding: '6px 8px' }}
                  />
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

            {/* 다중선택 필터 */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>운송구분</label>
              <MultiSelectFilter label="" options={TRANSPORT_TYPES} selected={filterTransportTypes} onChange={setFilterTransportTypes} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>거래처</label>
              <MultiSelectFilter label="" options={customers.map(c => c.name)} selected={filterCustomerNames} onChange={setFilterCustomerNames} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>운송사</label>
              <MultiSelectFilter label="" options={companies.map(c => c.name)} selected={filterCompanyNames} onChange={setFilterCompanyNames} />
            </div>

            <button onClick={() => fetchData()} style={{
              width: '100%', fontSize: 13, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontWeight: 700, background: '#2563eb', color: '#fff',
            }}>
              조회
            </button>
          </div>
        </div>
      )}

      {/* ═══ Main Content Area ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Title Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff', gap: 8,
          flexWrap: 'wrap',
        }}>
          {/* Left: Title + KPI chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1, flexWrap: 'wrap' }}>
            {/* Mobile: filter toggle button (shown when panel is closed) */}
            <button
              onClick={() => setMobileFilterOpen(true)}
              style={{
                fontSize: 13, padding: '5px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
                borderRadius: 6, cursor: 'pointer', color: '#475569', fontWeight: 600, flexShrink: 0,
              }}
              className="flex md:hidden"
            >
              ☰ 필터
            </button>
            {/* Desktop: expand collapsed filter */}
            {filterCollapsed && (
              <button onClick={() => setFilterCollapsed(false)} style={{
                fontSize: 13, padding: '5px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
                borderRadius: 6, cursor: 'pointer', color: '#475569', fontWeight: 600, flexShrink: 0,
              }} className="hidden md:flex">
                필터 ▶
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 4, height: 18, borderRadius: 2, background: '#2563eb' }} />
              <h1 style={{ fontSize: 16, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>출하 관리</h1>
            </div>

            {/* KPI Chips — hidden on mobile (<768px), show all on tablet+ */}
            <div className="hidden sm:flex" style={{ gap: 5, flexShrink: 0, marginLeft: 4, display: 'flex' }}>
              {[
                { label: '전체', value: allRows.length, unit: '건', bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', accent: '#3b82f6' },
                { label: '출하', value: shippedCount, unit: '건', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', accent: '#16a34a' },
                { label: '대기', value: pendingCount, unit: '건', bg: '#fffbeb', border: '#fde68a', color: '#b45309', accent: '#d97706' },
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

          {/* Right: Primary actions — wrap on mobile */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
            <button onClick={() => fetchData()} style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600,
              background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              조회
            </button>
            <button onClick={handleNewRow} style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600,
              background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              신규
            </button>
            <button onClick={handleSaveAll} style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: editingRows.size === 0 ? 'default' : 'pointer', fontWeight: 700,
              background: editingRows.size > 0 ? '#f59e0b' : '#e5e7eb', color: editingRows.size > 0 ? '#fff' : '#9ca3af',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.2s',
            }}>
              <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
              </svg>
              저장{editingRows.size > 0 ? ` (${editingRows.size})` : ''}
            </button>
            <button onClick={handleDelete} style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontWeight: 600,
              background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
            }}>삭제</button>
            <div style={{ width: 1, height: 22, background: '#e5e7eb', margin: '0 2px' }} className="hidden sm:block" />
            <button onClick={handleExcelImport} style={{
              fontSize: 13, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontWeight: 500,
              background: '#fff', color: '#374151', border: '1px solid #d1d5db',
            }} className="hidden sm:block">엑셀가져오기</button>
            <button onClick={handleExcel} style={{
              fontSize: 13, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontWeight: 500,
              background: '#fff', color: '#374151', border: '1px solid #d1d5db',
            }} className="hidden sm:block">엑셀내보내기</button>
          </div>
        </div>

        {/* ── Action Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb', gap: 4,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={toggleSelectAll} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              background: '#fff', color: '#475569', border: '1px solid #cbd5e1',
            }}>전체선택</button>
            <div style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
            <button onClick={openDispatchNotify} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
              background: '#1e293b', color: '#fff', border: 'none',
            }}>배차통보</button>
            <a
              href="/shipping?waiting=1"
              target="waitingScreen"
              rel="noopener"
              title="출하증 대기화면을 독립된 새 창으로 엽니다 (현장 게시용)"
              onClick={(e) => {
                // 팝업 창 우선 시도 → 성공하면 기본 이동 취소, 차단되면 새 탭(앵커 기본동작)으로 열림
                const w = window.open('/shipping?waiting=1', 'waitingScreen', 'width=1400,height=900');
                if (w) { w.focus(); e.preventDefault(); }
              }}
              style={{
                fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
                background: '#0ea5e9', color: '#fff', border: 'none', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center',
              }}
            >출하증 대기화면 ↗</a>
            <button onClick={async () => {
              // 거래처×제품 마스터(custom_mst 미러, 전체) 조회 — 페이징
              const PAGE = 1000;
              const all: CustomerProductMaster[] = [];
              let pg = 0, more = true;
              while (more) {
                const { data } = await supabase
                  .from('customer_products')
                  .select('id,transport_type,customer_id,customer_name,customer_code,product_id,product_name,warehouse_code')
                  .eq('is_active', true)
                  .order('customer_name')
                  .range(pg * PAGE, (pg + 1) * PAGE - 1);
                const rows = (data || []) as CustomerProductMaster[];
                all.push(...rows);
                more = rows.length === PAGE;
                pg++;
              }
              setMultiCustomerMaster(all);
              setShowMultiCustomer(true);
            }} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              background: '#fff', color: '#475569', border: '1px solid #cbd5e1',
            }}>거래처 다중 등록</button>
            <div style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
            <button onClick={handleConfirm} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd',
            }}>확정</button>
            <button onClick={handleCancelConfirm} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              background: '#fff', color: '#6b7280', border: '1px solid #d1d5db',
            }}>확정취소</button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleWehagoExport} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
              background: '#fff', color: '#6b7280', border: '1px solid #d1d5db',
            }}>위하고 양식</button>
            <button onClick={handlePrint} style={{
              fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
              background: '#fff', color: '#6b7280', border: '1px solid #d1d5db',
            }}>인쇄</button>
          </div>
        </div>

        {/* ── Sub Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 16px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>출하내역</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>· 헤더 경계를 드래그해 컬럼 너비 조절</span>
            <button onClick={resetColWidths} title="컬럼 너비 기본값으로" style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
              background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', marginLeft: 2,
            }}>컬럼폭 초기화</button>
          </div>
          <span style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>{allRows.length}건</span>
        </div>

        {/* ── Multi-Customer Panel (Modal) ── */}
        {showMultiCustomer && (
          <MultiCustomerPanel
            customers={customers}
            products={products}
            defaultDate={selectedDate}
            masterData={multiCustomerMaster}
            onRegister={handleMultiCustomerRegister}
            onClose={() => setShowMultiCustomer(false)}
          />
        )}

        {/* ── Data Grid ── */}
        <div style={{ flex: 1, overflow: 'auto', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#6b7280', fontSize: 13 }}>
              데이터를 불러오는 중...
            </div>
          ) : allRows.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9ca3af', fontSize: 13 }}>
              조회된 데이터가 없습니다.
            </div>
          ) : (
            <table className="data-table ship-table" style={{ fontSize: 14, tableLayout: 'fixed', width: SHIP_COLS.reduce((s, c) => s + (colWidths[c.key] || c.w), 0) }}>
              <colgroup>
                {SHIP_COLS.map(c => (
                  <col key={c.key} style={{ width: colWidths[c.key] || c.w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {(() => {
                    // 컬럼 오른쪽 경계 드래그 핸들
                    const Handle = ({ ck }: { ck: string }) => (
                      <span
                        onPointerDown={(e) => startColResize(ck, e)}
                        onClick={(e) => e.stopPropagation()}
                        title="드래그하여 너비 조절"
                        style={{ position: 'absolute', top: 0, right: 0, width: 8, height: '100%', cursor: 'col-resize', touchAction: 'none' }}
                      />
                    );
                    const base: React.CSSProperties = { position: 'sticky', top: 0, padding: '7px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
                    const sortable: React.CSSProperties = { ...base, cursor: 'pointer', userSelect: 'none' };
                    const arrow = (k: string) => (sort?.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
                    return (
                      <>
                        <th style={{ ...base, textAlign: 'center' }}>#<Handle ck="rownum" /></th>
                        <th style={{ ...base, textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedIds.size === allRows.length && allRows.length > 0} onChange={toggleSelectAll} />
                          <Handle ck="check" />
                        </th>
                        <th onClick={() => toggleSort('shipment_date')} title="클릭 시 정렬" style={sortable}>출하일자{arrow('shipment_date')}<Handle ck="shipment_date" /></th>
                        <th onClick={() => toggleSort('transport_type')} title="클릭 시 정렬" style={sortable}>운송구분{arrow('transport_type')}<Handle ck="transport_type" /></th>
                        <th onClick={() => toggleSort('customer_name')} title="클릭 시 정렬" style={sortable}>거래처{arrow('customer_name')}<Handle ck="customer_name" /></th>
                        <th onClick={() => toggleSort('product_name')} title="클릭 시 정렬" style={sortable}>제품명{arrow('product_name')}<Handle ck="product_name" /></th>
                        <th onClick={() => toggleSort('company_name')} title="클릭 시 정렬" style={sortable}>운송사{arrow('company_name')}<Handle ck="company_name" /></th>
                        <th onClick={() => toggleSort('vehicle_number')} title="클릭 시 정렬" style={sortable}>차량정보{arrow('vehicle_number')}<Handle ck="vehicle_number" /></th>
                        <th onClick={() => toggleSort('silo')} title="클릭 시 정렬" style={sortable}>사일로{arrow('silo')}<Handle ck="silo" /></th>
                        <th style={{ ...base, textAlign: 'center' }}>출하<Handle ck="shipped" /></th>
                        <th onClick={() => toggleSort('weight_net')} title="클릭 시 정렬" style={sortable}>계근결과{arrow('weight_net')}<Handle ck="weight_net" /></th>
                        <th style={base}>기타<Handle ck="notes" /></th>
                        <th onClick={() => toggleSort('certificate_time')} title="클릭 시 정렬" style={sortable}>출하증 발급시간{arrow('certificate_time')}<Handle ck="certificate_time" /></th>
                        <th style={{ ...base, textAlign: 'center' }}>배차통보<Handle ck="dispatch_notified" /></th>
                        <th style={{ ...base, textAlign: 'center' }}>작업</th>
                      </>
                    );
                  })()}
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
                      isAdmin={isAdmin}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Bottom Summary Bar ── */}
        {/* Desktop/tablet: horizontal flex row. Mobile: show compact 2-item summary */}
        <div
          className="hidden sm:flex"
          style={{
            alignItems: 'center', gap: 0,
            padding: '0 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', height: 48,
          }}
        >
          {[
            { label: '총 건수', value: allRows.length, unit: '건', color: '#475569' },
            { label: '출하완료', value: shippedCount, unit: '건', color: '#15803d' },
            { label: '출하대기', value: pendingCount, unit: '건', color: '#b45309' },
            { label: '운송사', value: companyCount, unit: '개사', color: '#1d4ed8' },
            { label: '계근합계', value: totalWeight.toFixed(2), unit: '톤', color: '#6d28d9' },
          ].map((item, i) => (
            <div key={item.label} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: '100%',
              borderRight: i < 4 ? '1px solid #e2e8f0' : 'none',
            }}>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: item.color }}>{item.value}</span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{item.unit}</span>
            </div>
          ))}
        </div>
        {/* Mobile summary: compact single-line */}
        <div
          className="flex sm:hidden"
          style={{
            alignItems: 'center', justifyContent: 'space-around',
            padding: '6px 12px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
          }}
        >
          <span style={{ fontSize: 12, color: '#64748b' }}>총 <strong style={{ color: '#475569' }}>{allRows.length}</strong>건</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>출하 <strong style={{ color: '#15803d' }}>{shippedCount}</strong>건</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>대기 <strong style={{ color: '#b45309' }}>{pendingCount}</strong>건</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>계근 <strong style={{ color: '#6d28d9' }}>{totalWeight.toFixed(1)}</strong>톤</span>
        </div>
      </div>

      {/* ═══ 배차통보 Popup ═══ */}
      {showDispatchNotify && (() => {
        const selected = data.filter(d => selectedIds.has(d.id));
        const alreadyNotified = selected.filter(d => d.dispatch_notified);
        const toNotify = selected.filter(d => !d.dispatch_notified);
        return (
          <div className="modal-overlay" style={{ zIndex: 150 }}>
            <div className="modal-content" style={{ maxWidth: 720, margin: '10px auto', maxHeight: 'calc(100vh - 20px)', width: '95vw' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="sm:!p-[16px_24px]">
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

              <div style={{ padding: '16px 16px' }} className="sm:!p-[20px_24px]">
                <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12, marginBottom: 20 }}>
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
                  <div className="flex flex-col sm:flex-row" style={{ gap: 12 }}>
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
                        <div style={{ fontSize: 13, color: '#6b7280' }}>거래처 등록 이메일로 발송</div>
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
                        <div style={{ fontSize: 13, color: '#6b7280' }}>거래처 등록 번호로 발송</div>
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

        // Step 3용 필터링 데이터 ('__ALL__' = 경기광업 전체)
        const waitingRows = waitingCompanyId === '__ALL__'
          ? allRows
          : waitingCompanyId
            ? allRows.filter(r => r.company_id === waitingCompanyId)
            : [];

        // 완료(출하확정 또는 출하증 발급) 건은 아래로, 색으로 구분
        const isDone = (r: typeof allRows[number]) => r.is_shipped || !!r.certificate_time;
        const sortedWaitingRows = [...waitingRows].sort((a, b) => (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0));
        const waitingDoneCount = waitingRows.filter(isDone).length;

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
                  padding: '0 16px', height: 60, backgroundColor: '#1e293b', color: '#fff', flexShrink: 0,
                }} className="sm:!p-[0_32px] sm:!h-[70px]">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg style={{ width: 22, height: 22, color: '#38bdf8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="hidden sm:block">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
                    </svg>
                    <h2 style={{ fontSize: 22, fontWeight: 800 }} className="sm:!text-[28px]">출하증 대기화면</h2>
                    <span style={{ fontSize: 15, color: '#94a3b8' }} className="hidden sm:inline">운송사를 선택하세요</span>
                  </div>
                  <button
                    onClick={closeWaitingScreen}
                    style={{
                      padding: '13px 26px', fontSize: 19, fontWeight: 800,
                      backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 12,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    닫기
                  </button>
                </div>

                {/* Company Buttons Grid */}
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '20px 20px',
                }} className="sm:!p-[40px_60px]">
                  <div
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                    style={{
                      gap: 18,
                      width: '100%', maxWidth: 1150,
                    }}
                  >
                    {/* 경기광업(전체) 탭 — 전체 운송사 보기 */}
                    <button
                      onClick={() => {
                        setWaitingCompanyId('__ALL__');
                        setWaitingCompanyName('경기광업 (전체)');
                        setWaitingStep('password');
                        setWaitingPassword('');
                        setWaitingPasswordError('');
                      }}
                      className="col-span-2 sm:col-span-3 lg:col-span-4 py-9 sm:!py-11"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '2px solid #0ea5e9',
                        borderRadius: 18,
                        fontSize: 30, fontWeight: 900, color: '#fff',
                        cursor: 'pointer', textAlign: 'center', letterSpacing: '0.03em',
                        transition: 'all 0.15s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.backgroundColor = '#0f172a'; e.currentTarget.style.transform = 'scale(1.01)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)'; }}
                      onMouseOut={e => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      경기광업 (전체)
                    </button>
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
                          className="py-10 sm:!py-14"
                          style={{
                            paddingLeft: 16, paddingRight: 16,
                            backgroundColor: color.bg,
                            border: `3px solid ${color.border}`,
                            borderRadius: 18,
                            fontSize: 30, fontWeight: 900, color: '#0f172a',
                            cursor: 'pointer', textAlign: 'center', letterSpacing: '0.02em',
                            transition: 'all 0.15s',
                          }}
                          onMouseOver={e => {
                            (e.currentTarget).style.backgroundColor = color.hover;
                            (e.currentTarget).style.transform = 'scale(1.03)';
                            (e.currentTarget).style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
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
                  backgroundColor: '#fff', borderRadius: 20, padding: '28px 24px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center',
                  width: '90vw', maxWidth: 420,
                }} className="sm:!p-[40px_48px]">
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
                          flex: 1, padding: '18px 0', fontSize: 20, fontWeight: 700,
                          backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                          borderRadius: 12, cursor: 'pointer',
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        style={{
                          flex: 1, padding: '18px 0', fontSize: 20, fontWeight: 800,
                          backgroundColor: '#1e40af', color: '#fff', border: 'none',
                          borderRadius: 12, cursor: 'pointer',
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
                {/* Header — 뒤로 버튼을 왼쪽에 크게 (고령 기사 배려) */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 16px', minHeight: 74, backgroundColor: '#1e293b', color: '#fff', flexShrink: 0, gap: 14,
                }} className="sm:!p-[0_24px] sm:!min-h-[88px]">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                    <button
                      onClick={() => {
                        setWaitingStep('select');
                        setWaitingCompanyId('');
                        setWaitingCompanyName('');
                        setWaitingPassword('');
                      }}
                      style={{
                        padding: '14px 26px', fontSize: 22, fontWeight: 800,
                        backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 12,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                        boxShadow: '0 4px 14px rgba(37,99,235,.4)',
                      }}
                    >
                      <svg style={{ width: 28, height: 28 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                      </svg>
                      뒤로
                    </button>
                    <h2 style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} className="sm:!text-[30px]">{waitingCompanyName}</h2>
                  </div>
                  {/* 날짜 네비게이션 — 전날/다음날/직접선택 (기사·현장 배려 크게) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={handlePrevDay} style={{ padding: '11px 18px', fontSize: 18, fontWeight: 800, background: '#334155', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>◀ 전날</button>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                      style={{ fontSize: 17, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: 'none', color: '#1e293b' }} />
                    <button onClick={handleNextDay} style={{ padding: '11px 18px', fontSize: 18, fontWeight: 800, background: '#334155', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>다음날 ▶</button>
                  </div>
                </div>

                {/* Data Table — 큰 폰트 */}
                <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px' }} className="sm:!p-[20px_32px]">
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
                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '3px solid #cbd5e1' }}>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'center', width: 46 }}>#</th>
                          {waitingCompanyId === '__ALL__' && (
                            <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left' }}>운송사</th>
                          )}
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left', whiteSpace: 'nowrap' }}>출하요청일자</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left' }}>거래처</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left' }}>제품명</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left' }}>차량번호</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left' }}>기사</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'center' }}>사일로</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'left' }}>비고</th>
                          <th style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#475569', textAlign: 'center', minWidth: 270 }}>출하증 / 성적서</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedWaitingRows.map((row, idx) => (
                          <tr
                            key={row.id}
                            style={{
                              borderBottom: '2px solid #eef2f6',
                              backgroundColor: isDone(row) ? '#dcfce7' : (idx % 2 === 0 ? '#fff' : '#f8fafc'),
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontSize: 17, textAlign: 'center', color: isDone(row) ? '#15803d' : '#94a3b8', fontWeight: 700 }}>{idx + 1}</td>
                            {waitingCompanyId === '__ALL__' && (
                              <td style={{ padding: '8px 12px', fontSize: 17, color: '#1e293b', fontWeight: 700 }}>{row.company_name || '-'}</td>
                            )}
                            <td style={{ padding: '8px 12px', fontSize: 15, color: '#64748b', whiteSpace: 'nowrap' }}>{row.shipment_date || '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 17, color: '#1e293b', fontWeight: 600 }}>{row.customer_name || '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 17, color: '#374151' }}>{row.product_name || '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 17, color: '#374151', fontWeight: 600 }}>{row.vehicle_number || '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 16, color: '#374151' }}>{row.driver_name || '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 17, textAlign: 'center', color: '#1d4ed8', fontWeight: 700 }}>{row.silo || '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 15, color: '#6b7280' }}>{row.notes || ''}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                                {row.certificate_time ? (
                                  <>
                                    <button
                                      onClick={async () => {
                                        const issued = new Date(row.certificate_time!).toLocaleString('ko-KR');
                                        if (!confirm(`이미 출하증이 발급되었습니다.\n(발급시간: ${issued})\n\n재발급하시겠습니까?`)) return;
                                        await crud.issueCertificate(row.id);
                                        const updatedRow = { ...row, certificate_time: new Date().toISOString() };
                                        setPrintRow(updatedRow);
                                        setShowPrint(true);
                                        fetchData();
                                      }}
                                      style={{
                                        padding: '9px 24px', fontSize: 19, fontWeight: 800,
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
                                      const updatedRow = { ...row, certificate_time: new Date().toISOString() };
                                      setPrintRow(updatedRow);
                                      setShowPrint(true);
                                      fetchData();
                                    }}
                                    style={{
                                      padding: '9px 24px', fontSize: 19, fontWeight: 800,
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
                                    padding: '9px 24px', fontSize: 19, fontWeight: 800,
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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap',
                  padding: '16px 32px', backgroundColor: '#1e293b', color: '#fff', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>총 {waitingRows.length}건</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#fcd34d' }}>대기 {waitingRows.length - waitingDoneCount}건</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#86efac', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: '#86efac', display: 'inline-block' }} />
                    완료 {waitingDoneCount}건 (초록색·하단)
                  </span>
                </div>
              </div>
            )}

          </div>
        );
      })()}

      {/* ═══ Print Modal ═══ */}
      {showListPrint && (
        <ShipmentListPrint
          rows={allRows}
          dateLabel={selectedDate}
          onClose={() => setShowListPrint(false)}
        />
      )}

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
