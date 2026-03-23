'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, EXCEL_COLUMNS } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';

// ── Types ──────────────────────────────────────────────
interface Product {
  id: string;
  code: string;
  name: string;
  specification: string | null;
  unit: string;
  unit_price: number | null;
  category: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductFormData {
  code: string;
  name: string;
  specification: string;
  unit: string;
  unit_price: number | null;
  category: string;
  memo: string;
  is_active: boolean;
}

const emptyForm: ProductFormData = {
  code: '',
  name: '',
  specification: '',
  unit: 'ton',
  unit_price: null,
  category: '',
  memo: '',
  is_active: true,
};

const UNIT_OPTIONS = ['ton', 'kg', 'm3', 'EA', '대', '루베'];
const CATEGORY_OPTIONS = ['골재', 'ite석', '모래', '자갈', '석분', '혼합', '기타'];

// ── Component ──────────────────────────────────────────
export default function ProductCodePage() {
  const supabase = createClient();
  const toast = useToast();
  const session = useMemo(() => getSession(), []);
  const isTransporter = session?.profile?.role === 'transporter';

  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('products')
        .select('*')
        .order('code');

      if (searchText) {
        query = query.or(
          `code.ilike.%${searchText}%,name.ilike.%${searchText}%,specification.ilike.%${searchText}%,category.ilike.%${searchText}%`
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
      code: row.code,
      name: row.name,
      specification: row.specification || '',
      unit: row.unit || 'ton',
      unit_price: row.unit_price,
      category: row.category || '',
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
    if (!confirm('선택한 제품코드를 삭제하시겠습니까?')) return;
    try {
      const { error: delError } = await supabase.from('products').delete().eq('id', selectedId);
      if (delError) throw delError;
      setSelectedId(null);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleSave = async () => {
    if (!formData.code.trim()) {
      toast.warning('제품코드는 필수 입력입니다.');
      return;
    }
    if (!formData.name.trim()) {
      toast.warning('제품명은 필수 입력입니다.');
      return;
    }

    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        specification: formData.specification || null,
        unit: formData.unit || 'ton',
        unit_price: formData.unit_price,
        category: formData.category || null,
        memo: formData.memo || null,
        is_active: formData.is_active,
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('products').insert(payload);
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
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS.products, '제품코드관리');
  };

  // ── Render ───────────────────────────────────────────
  if (isTransporter) return <AccessDenied />;

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-xl font-bold text-[var(--color-text)]">제품코드관리</h1>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <input
          type="text"
          placeholder="제품코드, 제품명, 규격, 분류 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-80 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                <th>제품코드</th>
                <th>제품명</th>
                <th>규격</th>
                <th>단위</th>
                <th className="text-right">단가</th>
                <th>분류</th>
                <th>사용</th>
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
                  <td className="font-mono text-xs font-medium">{row.code}</td>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.specification}</td>
                  <td>{row.unit}</td>
                  <td className="text-right">
                    {row.unit_price != null
                      ? Number(row.unit_price).toLocaleString('ko-KR', {
                          style: 'currency',
                          currency: 'KRW',
                        })
                      : ''}
                  </td>
                  <td>{row.category}</td>
                  <td>
                    <span
                      className={`badge ${row.is_active ? 'badge-completed' : 'badge-cancelled'}`}
                    >
                      {row.is_active ? '사용' : '미사용'}
                    </span>
                  </td>
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">
                {isEditing ? '제품코드 수정' : '제품코드 신규등록'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제품코드 *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    readOnly={isEditing}
                    className={`w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${isEditing ? 'bg-gray-50' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제품명 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">규격</label>
                <input
                  type="text"
                  value={formData.specification}
                  onChange={(e) => setFormData({ ...formData, specification: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">단위</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">단가 (원)</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.unit_price ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unit_price: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">분류</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- 선택 --</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
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
