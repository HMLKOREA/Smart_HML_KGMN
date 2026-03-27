'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, EXCEL_COLUMNS } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import ReadOnlyBanner from '@/components/ui/ReadOnlyBanner';

// ── Types ──────────────────────────────────────────────
interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicle_number: string;
  vehicle_type: string | null;
  vehicle_tonnage: number | null;
  company_id: string | null;
  company_name: string | null;
  license_number: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TransportCompany {
  id: string;
  name: string;
}

interface DriverFormData {
  name: string;
  phone: string;
  vehicle_number: string;
  vehicle_type: string;
  vehicle_tonnage: number | null;
  company_id: string;
  license_number: string;
  memo: string;
  is_active: boolean;
}

const emptyForm: DriverFormData = {
  name: '',
  phone: '',
  vehicle_number: '',
  vehicle_type: '',
  vehicle_tonnage: null,
  company_id: '',
  license_number: '',
  memo: '',
  is_active: true,
};

const VEHICLE_TYPES = ['카고', '덤프', '윙바디', '탑차', '트레일러', '믹서', '탱크로리', '기타'];

// ── Component ──────────────────────────────────────────
export default function DriverPage() {
  const supabase = createClient();
  const toast = useToast();

  const [data, setData] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<DriverFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [companies, setCompanies] = useState<TransportCompany[]>([]);

  // ── Auth: 운송사 계정이면 자기 회사만 ──
  const session = useMemo(() => getSession(), []);
  const isTransporter = session?.profile?.role === 'transporter';
  const userCompanyId = session?.profile?.company_id || '';

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('v_drivers')
        .select('*')
        .order('company_name', { ascending: true })
        .order('name', { ascending: true });

      // 운송사 계정: 자기 운송사 기사만 표시
      if (isTransporter && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      }

      if (searchText) {
        query = query.or(
          `name.ilike.%${searchText}%,phone.ilike.%${searchText}%,vehicle_number.ilike.%${searchText}%,company_name.ilike.%${searchText}%,license_number.ilike.%${searchText}%`
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
  }, [supabase, searchText, isTransporter, userCompanyId]);

  const fetchCompanies = useCallback(async () => {
    try {
      const { data: result } = await supabase
        .from('transport_companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setCompanies(result || []);
    } catch {
      // non-critical
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
    fetchCompanies();
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
      name: row.name,
      phone: row.phone || '',
      vehicle_number: row.vehicle_number,
      vehicle_type: row.vehicle_type || '',
      vehicle_tonnage: row.vehicle_tonnage,
      company_id: row.company_id || '',
      license_number: row.license_number || '',
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
    if (!confirm('선택한 기사를 삭제하시겠습니까?')) return;
    try {
      const { error: delError } = await supabase.from('drivers').delete().eq('id', selectedId);
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
      toast.warning('기사명은 필수 입력입니다.');
      return;
    }
    if (!formData.vehicle_number.trim()) {
      toast.warning('차량번호는 필수 입력입니다.');
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone || null,
        vehicle_number: formData.vehicle_number.trim(),
        vehicle_type: formData.vehicle_type || null,
        vehicle_tonnage: formData.vehicle_tonnage,
        company_id: formData.company_id || null,
        license_number: formData.license_number || null,
        memo: formData.memo || null,
        is_active: formData.is_active,
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('drivers')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('drivers').insert(payload);
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
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS.drivers, '기사관리');
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-xl font-bold text-[var(--color-text)]">기사관리</h1>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <input
          type="text"
          placeholder="기사명, 전화번호, 차량번호, 운송사, 면허번호 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-96 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          조회
        </button>
      </div>

      {/* ReadOnly Banner for transporter */}
      {isTransporter && <ReadOnlyBanner message="운송사 계정은 기사 정보를 수정할 수 없습니다." />}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 px-6 py-2 bg-gray-50 border-b border-[var(--color-border)]">
        {!isTransporter && (
          <>
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
          </>
        )}
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
                <th>운송사</th>
                <th>차량종류</th>
                <th>기사명</th>
                <th>전화번호</th>
                <th>차량번호</th>
                <th className="text-right">톤수</th>
                <th>면허번호</th>
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
                  <td className="font-medium">{row.company_name}</td>
                  <td>{row.vehicle_type}</td>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.phone}</td>
                  <td>{row.vehicle_number}</td>
                  <td className="text-right">
                    {row.vehicle_tonnage != null ? Number(row.vehicle_tonnage).toLocaleString() : ''}
                  </td>
                  <td>{row.license_number}</td>
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">
                {isEditing ? '기사 수정' : '기사 신규등록'}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">기사명 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    차량번호 *
                  </label>
                  <input
                    type="text"
                    value={formData.vehicle_number}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicle_number: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">차량종류</label>
                  <select
                    value={formData.vehicle_type}
                    onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- 선택 --</option>
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">톤수</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vehicle_tonnage ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vehicle_tonnage: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">운송사</label>
                  <select
                    value={formData.company_id}
                    onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">면허번호</label>
                  <input
                    type="text"
                    value={formData.license_number}
                    onChange={(e) =>
                      setFormData({ ...formData, license_number: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
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
