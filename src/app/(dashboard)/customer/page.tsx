'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, EXCEL_COLUMNS } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';

// ── Types ──────────────────────────────────────────────
interface Customer {
  id: string;
  name: string;
  business_number: string | null;
  representative: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
  delivery_address: string | null;
  email: string | null;
  transport_type: string | null;
  customer_code: string | null;
  warehouse_code: string | null;
  default_product_id: string | null;
  contact_email: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CustomerFormData {
  name: string;
  business_number: string;
  representative: string;
  phone: string;
  fax: string;
  address: string;
  delivery_address: string;
  email: string;
  memo: string;
  is_active: boolean;
}

const emptyForm: CustomerFormData = {
  name: '',
  business_number: '',
  representative: '',
  phone: '',
  fax: '',
  address: '',
  delivery_address: '',
  email: '',
  memo: '',
  is_active: true,
};

// ── Component ──────────────────────────────────────────
export default function CustomerPage() {
  const supabase = createClient();
  const toast = useToast();
  const session = useMemo(() => getSession(), []);
  const isTransporter = session?.profile?.role === 'transporter';

  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .order('name');

      if (searchText) {
        query = query.or(
          `name.ilike.%${searchText}%,business_number.ilike.%${searchText}%,representative.ilike.%${searchText}%,phone.ilike.%${searchText}%,address.ilike.%${searchText}%`
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
  }, [supabase, searchText]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey] ?? '';
      const vb = (b as unknown as Record<string, unknown>)[sortKey] ?? '';
      const cmp = String(va).localeCompare(String(vb), 'ko');
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  // ── Helpers ──────────────────────────────────────────
  const handleSearch = () => fetchData();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── CRUD ─────────────────────────────────────────────
  const handleNew = () => {
    setIsEditing(false);
    setFormData({ ...emptyForm });
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
      name: row.name,
      business_number: row.business_number || '',
      representative: row.representative || '',
      phone: row.phone || '',
      fax: row.fax || '',
      address: row.address || '',
      delivery_address: row.delivery_address || '',
      email: row.email || '',
      memo: row.memo || '',
      is_active: row.is_active,
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedId) {
      toast.warning('삭제할 항목을 선택해주세요.');
      return;
    }
    if (!confirm('선택한 거래처를 삭제하시겠습니까?')) return;
    try {
      const { error: delError } = await supabase
        .from('customers')
        .delete()
        .eq('id', selectedId);
      if (delError) throw delError;
      setSelectedId(null);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.warning('거래처명은 필수 입력입니다.');
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        business_number: formData.business_number || null,
        representative: formData.representative || null,
        phone: formData.phone || null,
        fax: formData.fax || null,
        address: formData.address || null,
        delivery_address: formData.delivery_address || null,
        email: formData.email || null,
        memo: formData.memo || null,
        is_active: formData.is_active,
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('customers').insert(payload);
        if (insError) throw insError;
      }

      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleExcel = () => {
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS.customers, '거래처관리');
  };

  // ── Render ───────────────────────────────────────────
  if (isTransporter) return <AccessDenied />;

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">거래처관리</h1>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <input
          type="text"
          placeholder="거래처명, 사업자번호, 대표자, 전화번호, 주소 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-full sm:w-96 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          조회
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 bg-gray-50 border-b border-[var(--color-border)]">
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
        <div className="mx-4 sm:mx-6 mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500">
            데이터를 불러오는 중...
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500">
            조회된 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  { key: 'transport_type', label: '운송구분' },
                  { key: 'name', label: '거래처' },
                  { key: 'customer_code', label: '거래처코드' },
                  { key: 'warehouse_code', label: '창고코드' },
                  { key: 'default_product_id', label: '제품명' },
                  { key: 'contact_email', label: '담당자 이메일' },
                  { key: 'address', label: '주소' },
                  { key: 'phone', label: '전화번호' },
                  { key: 'is_active', label: '사용' },
                  { key: 'memo', label: '비고' },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {col.label} {sortKey === col.key ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer ${selectedId === row.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={() => {
                    setSelectedId(row.id);
                    handleEdit(row.id);
                  }}
                >
                  <td>{row.transport_type || '-'}</td>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.customer_code || '-'}</td>
                  <td>{row.warehouse_code || '-'}</td>
                  <td>{row.default_product_id || '-'}</td>
                  <td>{row.contact_email || '-'}</td>
                  <td className="max-w-[200px] truncate">{row.address || '-'}</td>
                  <td>{row.phone || '-'}</td>
                  <td>
                    <span
                      className={`badge ${row.is_active ? 'badge-completed' : 'badge-cancelled'}`}
                    >
                      {row.is_active ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td className="max-w-[150px] truncate">{row.memo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">
                {isEditing ? '거래처 수정' : '거래처 신규등록'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">거래처명 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">사업자번호</label>
                  <input
                    type="text"
                    value={formData.business_number}
                    onChange={(e) =>
                      setFormData({ ...formData, business_number: e.target.value })
                    }
                    placeholder="000-00-00000"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">대표자</label>
                  <input
                    type="text"
                    value={formData.representative}
                    onChange={(e) =>
                      setFormData({ ...formData, representative: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">팩스</label>
                  <input
                    type="text"
                    value={formData.fax}
                    onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">배송지 주소</label>
                <input
                  type="text"
                  value={formData.delivery_address}
                  onChange={(e) =>
                    setFormData({ ...formData, delivery_address: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
                <textarea
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  사용여부
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50">
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
