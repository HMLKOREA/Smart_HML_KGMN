'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { exportToExcel, EXCEL_COLUMNS } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';

// ── Types ──────────────────────────────────────────────
interface Dispatch {
  id: string;
  dispatch_date: string;
  dispatch_number: string;
  shipment_id: string | null;
  company_id: string | null;
  company_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  product_id: string | null;
  product_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  quantity: number | null;
  unit: string;
  delivery_address: string | null;
  status: string;
  departure_time: string | null;
  arrival_time: string | null;
  memo: string | null;
  created_at: string;
}

interface TransportCompany {
  id: string;
  name: string;
}

interface Driver {
  id: string;
  name: string;
  vehicle_number: string;
  company_id: string | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
}

interface DispatchFormData {
  dispatch_date: string;
  company_id: string;
  driver_id: string;
  vehicle_number: string;
  product_id: string;
  customer_id: string;
  quantity: number;
  unit: string;
  delivery_address: string;
  status: string;
  departure_time: string;
  arrival_time: string;
  memo: string;
}

const STATUS_OPTIONS = [
  { value: 'assigned', label: '배차' },
  { value: 'departed', label: '출발' },
  { value: 'arrived', label: '도착' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

const STATUS_MAP: Record<string, string> = {
  assigned: '배차',
  departed: '출발',
  arrived: '도착',
  completed: '완료',
  cancelled: '취소',
};

const STATUS_BADGE: Record<string, string> = {
  assigned: 'badge-dispatched',
  departed: 'badge-in-transit',
  arrived: 'badge-delivered',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
};

const emptyForm: DispatchFormData = {
  dispatch_date: format(new Date(), 'yyyy-MM-dd'),
  company_id: '',
  driver_id: '',
  vehicle_number: '',
  product_id: '',
  customer_id: '',
  quantity: 0,
  unit: 'ton',
  delivery_address: '',
  status: 'assigned',
  departure_time: '',
  arrival_time: '',
  memo: '',
};

// ── Component ──────────────────────────────────────────
export default function DispatchPage() {
  const supabase = createClient();
  const toast = useToast();

  const [data, setData] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<DispatchFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-01'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchText, setSearchText] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  // Lookups
  const [companies, setCompanies] = useState<TransportCompany[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('v_dispatches')
        .select('*')
        .gte('dispatch_date', dateFrom)
        .lte('dispatch_date', dateTo)
        .order('dispatch_date', { ascending: false })
        .order('dispatch_number', { ascending: false });

      if (companyFilter) {
        query = query.eq('company_id', companyFilter);
      }

      if (searchText) {
        query = query.or(
          `dispatch_number.ilike.%${searchText}%,company_name.ilike.%${searchText}%,driver_name.ilike.%${searchText}%,product_name.ilike.%${searchText}%,customer_name.ilike.%${searchText}%,vehicle_number.ilike.%${searchText}%`
        );
      }

      const { data: result, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setData(result || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [supabase, dateFrom, dateTo, searchText, companyFilter]);

  const fetchLookups = useCallback(async () => {
    try {
      const [compRes, driverRes, prodRes, custRes] = await Promise.all([
        supabase.from('transport_companies').select('id, name').eq('is_active', true).order('name'),
        supabase.from('drivers').select('id, name, vehicle_number, company_id').eq('is_active', true).order('name'),
        supabase.from('products').select('id, code, name').eq('is_active', true).order('name'),
        supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
      ]);
      setCompanies(compRes.data || []);
      setDrivers(driverRes.data || []);
      setProducts(prodRes.data || []);
      setCustomers(custRes.data || []);
    } catch {
      // non-critical
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
    fetchLookups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────
  const generateDispatchNumber = () => {
    const today = format(new Date(), 'yyyyMMdd');
    const seq = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `DC-${today}-${seq}`;
  };

  const handleSearch = () => fetchData();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const filteredDrivers = formData.company_id
    ? drivers.filter((d) => d.company_id === formData.company_id)
    : drivers;

  // ── CRUD ─────────────────────────────────────────────
  const handleNew = () => {
    setIsEditing(false);
    setFormData({ ...emptyForm, dispatch_date: format(new Date(), 'yyyy-MM-dd') });
    setModalOpen(true);
  };

  const handleEdit = (directId?: string) => {
    const targetId = directId || selectedId;
    if (!targetId) {
      toast.warning('수정할 항목을 선택해주세요.');
      return;
    }
    const row = data.find((d) => d.id === targetId);
    if (!row) return;
    setIsEditing(true);
    setFormData({
      dispatch_date: row.dispatch_date,
      company_id: row.company_id || '',
      driver_id: row.driver_id || '',
      vehicle_number: row.vehicle_number || '',
      product_id: row.product_id || '',
      customer_id: row.customer_id || '',
      quantity: row.quantity || 0,
      unit: row.unit || 'ton',
      delivery_address: row.delivery_address || '',
      status: row.status,
      departure_time: row.departure_time ? row.departure_time.slice(0, 16) : '',
      arrival_time: row.arrival_time ? row.arrival_time.slice(0, 16) : '',
      memo: row.memo || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedId) {
      toast.warning('삭제할 항목을 선택해주세요.');
      return;
    }
    if (!confirm('선택한 배차 데이터를 삭제하시겠습니까?')) return;
    try {
      const { error: delError } = await supabase.from('dispatches').delete().eq('id', selectedId);
      if (delError) throw delError;
      setSelectedId(null);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        dispatch_date: formData.dispatch_date,
        company_id: formData.company_id || null,
        driver_id: formData.driver_id || null,
        vehicle_number: formData.vehicle_number || null,
        product_id: formData.product_id || null,
        customer_id: formData.customer_id || null,
        quantity: formData.quantity,
        unit: formData.unit,
        delivery_address: formData.delivery_address || null,
        status: formData.status,
        departure_time: formData.departure_time || null,
        arrival_time: formData.arrival_time || null,
        memo: formData.memo || null,
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('dispatches')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('dispatches').insert({
          ...payload,
          dispatch_number: generateDispatchNumber(),
        });
        if (insError) throw insError;
      }

      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleDispatchOrder = () => {
    if (!selectedId) {
      toast.warning('배차 지시할 항목을 선택해주세요.');
      return;
    }
    toast.info('배차 지시 기능은 준비 중입니다.');
  };

  const handleExcel = () => {
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS.dispatches, '배차관리');
  };

  const handleDriverSelect = (driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    setFormData((prev) => ({
      ...prev,
      driver_id: driverId,
      vehicle_number: driver?.vehicle_number || prev.vehicle_number,
    }));
  };

  const formatDatetime = (dt: string | null) => {
    if (!dt) return '';
    try {
      return format(new Date(dt), 'HH:mm');
    } catch {
      return '';
    }
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-xl font-bold text-[var(--color-text)]">배차관리</h1>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">기간</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">전체 운송사</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="배차번호, 운송사, 기사, 제품, 거래처 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-72 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          조회
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 px-6 py-2 bg-gray-50 border-b border-[var(--color-border)]">
        <button
          onClick={handleNew}
          className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          신규등록
        </button>
        <button
          onClick={() => handleEdit()}
          className="px-3 py-1.5 bg-white text-[var(--color-text)] text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors"
        >
          수정
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 bg-white text-[var(--color-danger)] text-sm rounded border border-red-300 hover:bg-red-50 transition-colors"
        >
          삭제
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          onClick={handleDispatchOrder}
          className="px-3 py-1.5 bg-[var(--color-accent)] text-white text-sm rounded hover:opacity-90 transition-colors"
        >
          배차 지시
        </button>
        <button
          onClick={handleExcel}
          className="px-3 py-1.5 bg-[var(--color-secondary)] text-white text-sm rounded hover:opacity-90 transition-colors"
        >
          엑셀
        </button>
        <span className="ml-auto text-sm text-[var(--color-text-secondary)]">
          총 {data.length}건
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 overflow-auto px-6 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500">
            데이터를 불러오는 중...
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500">
            조회된 데이터가 없습니다.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>배차일자</th>
                <th>배차번호</th>
                <th>운송사</th>
                <th>기사명</th>
                <th>차량번호</th>
                <th>제품명</th>
                <th>거래처</th>
                <th className="text-right">수량</th>
                <th>상태</th>
                <th>출발시간</th>
                <th>도착시간</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer ${selectedId === row.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={() => {
                    setSelectedId(row.id);
                    handleEdit(row.id);
                  }}
                >
                  <td>{row.dispatch_date}</td>
                  <td className="font-mono text-xs">{row.dispatch_number}</td>
                  <td>{row.company_name}</td>
                  <td>{row.driver_name}</td>
                  <td>{row.vehicle_number}</td>
                  <td>{row.product_name}</td>
                  <td>{row.customer_name}</td>
                  <td className="text-right">
                    {row.quantity != null ? Number(row.quantity).toLocaleString() : ''}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[row.status] || 'badge-draft'}`}>
                      {STATUS_MAP[row.status] || row.status}
                    </span>
                  </td>
                  <td>{formatDatetime(row.departure_time)}</td>
                  <td>{formatDatetime(row.arrival_time)}</td>
                  <td className="max-w-[150px] truncate">{row.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">{isEditing ? '배차 수정' : '배차 신규등록'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Row 1 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">배차일자 *</label>
                  <input
                    type="date"
                    value={formData.dispatch_date}
                    onChange={(e) => setFormData({ ...formData, dispatch_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">단위</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">운송사</label>
                  <select
                    value={formData.company_id}
                    onChange={(e) =>
                      setFormData({ ...formData, company_id: e.target.value, driver_id: '' })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- 선택 --</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">기사</label>
                  <select
                    value={formData.driver_id}
                    onChange={(e) => handleDriverSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- 선택 --</option>
                    {filteredDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.vehicle_number})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">차량번호</label>
                  <input
                    type="text"
                    value={formData.vehicle_number}
                    onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제품</label>
                  <select
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- 선택 --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">수량</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">거래처</label>
                  <select
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- 선택 --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">배송지</label>
                  <input
                    type="text"
                    value={formData.delivery_address}
                    onChange={(e) =>
                      setFormData({ ...formData, delivery_address: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 5 - Times */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">출발시간</label>
                  <input
                    type="datetime-local"
                    value={formData.departure_time}
                    onChange={(e) =>
                      setFormData({ ...formData, departure_time: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">도착시간</label>
                  <input
                    type="datetime-local"
                    value={formData.arrival_time}
                    onChange={(e) =>
                      setFormData({ ...formData, arrival_time: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 6 - Memo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
                <textarea
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-white text-gray-700 text-sm rounded border border-gray-300 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)]"
              >
                {isEditing ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
