'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import ReportPrint from '@/components/modules/report/ReportPrint';
import { exportToExcel } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';

// ── Types ──────────────────────────────────────────────
interface QualityReport {
  id: string;
  report_number: string;
  report_date: string;
  shipment_id: string | null;
  product_id: string | null;
  product_name: string | null;
  product_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  template_type: number;
  test_results: Record<string, unknown>;
  inspector: string | null;
  approved_by: string | null;
  memo: string | null;
  status: string;
  created_at: string;
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

interface ReportFormData {
  report_date: string;
  product_id: string;
  customer_id: string;
  template_type: number;
  test_results: string; // JSON string for editing
  inspector: string;
  approved_by: string;
  memo: string;
  status: string;
}

const STATUS_OPTIONS = [
  { value: 'draft', label: '작성중' },
  { value: 'approved', label: '승인' },
  { value: 'issued', label: '발행' },
];

const STATUS_MAP: Record<string, string> = {
  draft: '작성중',
  approved: '승인',
  issued: '발행',
};

const TEMPLATE_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: i + 1,
  label: `템플릿 ${i + 1}`,
}));

const emptyForm: ReportFormData = {
  report_date: format(new Date(), 'yyyy-MM-dd'),
  product_id: '',
  customer_id: '',
  template_type: 1,
  test_results: '{}',
  inspector: '',
  approved_by: '',
  memo: '',
  status: 'draft',
};

// ── Component ──────────────────────────────────────────
export default function ReportPage() {
  const supabase = createClient();
  const toast = useToast();

  const [data, setData] = useState<QualityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ReportFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-01'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchText, setSearchText] = useState('');

  // Lookups
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('v_quality_reports')
        .select('*')
        .gte('report_date', dateFrom)
        .lte('report_date', dateTo)
        .order('report_date', { ascending: false })
        .order('report_number', { ascending: false });

      if (searchText) {
        query = query.or(
          `report_number.ilike.%${searchText}%,product_name.ilike.%${searchText}%,customer_name.ilike.%${searchText}%,inspector.ilike.%${searchText}%`
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
  }, [supabase, dateFrom, dateTo, searchText]);

  const fetchLookups = useCallback(async () => {
    try {
      const [prodRes, custRes] = await Promise.all([
        supabase.from('products').select('id, code, name').eq('is_active', true).order('name'),
        supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
      ]);
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
  const generateReportNumber = () => {
    const today = format(new Date(), 'yyyyMMdd');
    const seq = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `QR-${today}-${seq}`;
  };

  const handleSearch = () => fetchData();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── CRUD ─────────────────────────────────────────────
  const handleNew = () => {
    setIsEditing(false);
    setFormData({ ...emptyForm, report_date: format(new Date(), 'yyyy-MM-dd') });
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
      report_date: row.report_date,
      product_id: row.product_id || '',
      customer_id: row.customer_id || '',
      template_type: row.template_type || 1,
      test_results: JSON.stringify(row.test_results || {}, null, 2),
      inspector: row.inspector || '',
      approved_by: row.approved_by || '',
      memo: row.memo || '',
      status: row.status,
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedId) {
      toast.warning('삭제할 항목을 선택해주세요.');
      return;
    }
    if (!confirm('선택한 성적서를 삭제하시겠습니까?')) return;
    try {
      const { error: delError } = await supabase
        .from('quality_reports')
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
    let parsedResults: Record<string, unknown>;
    try {
      parsedResults = JSON.parse(formData.test_results);
    } catch {
      toast.warning('시험결과 JSON 형식이 올바르지 않습니다.');
      return;
    }

    try {
      const payload = {
        report_date: formData.report_date,
        product_id: formData.product_id || null,
        customer_id: formData.customer_id || null,
        template_type: formData.template_type,
        test_results: parsedResults,
        inspector: formData.inspector || null,
        approved_by: formData.approved_by || null,
        memo: formData.memo || null,
        status: formData.status,
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('quality_reports')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('quality_reports').insert({
          ...payload,
          report_number: generateReportNumber(),
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

  const handleApprove = async () => {
    if (!selectedId) {
      toast.warning('승인할 성적서를 선택해주세요.');
      return;
    }
    const row = data.find((d) => d.id === selectedId);
    if (!row) return;
    if (row.status !== 'draft') {
      toast.warning('작성중 상태의 성적서만 승인할 수 있습니다.');
      return;
    }
    if (!confirm('선택한 성적서를 승인하시겠습니까?')) return;
    try {
      const { error: updError } = await supabase
        .from('quality_reports')
        .update({ status: 'approved' })
        .eq('id', selectedId);
      if (updError) throw updError;
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '승인 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const [showPrint, setShowPrint] = useState(false);

  const handlePrint = () => {
    if (!selectedId) {
      toast.warning('출력할 성적서를 선택해주세요.');
      return;
    }
    setShowPrint(true);
  };

  const handleExcel = () => {
    const columns = [
      { key: 'report_number', header: '성적서번호' },
      { key: 'report_date', header: '발행일자' },
      { key: 'product_name', header: '제품명' },
      { key: 'customer_name', header: '거래처' },
      { key: 'template_type', header: '템플릿' },
      { key: 'inspector', header: '검사자' },
      { key: 'approved_by', header: '승인자' },
      { key: 'status', header: '상태' },
      { key: 'memo', header: '비고' },
    ];
    exportToExcel(data as unknown as Record<string, unknown>[], columns, '성적서관리');
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">성적서관리</h1>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">기간</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
        />
        <span className="text-sm text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
        />
        <input
          type="text"
          placeholder="성적서번호, 제품명, 거래처, 검사자 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-full sm:w-64 md:w-72 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors whitespace-nowrap"
        >
          조회
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-6 py-2 bg-gray-50 border-b border-[var(--color-border)]">
        <button
          onClick={handleNew}
          className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors whitespace-nowrap"
        >
          신규등록
        </button>
        <button
          onClick={() => handleEdit()}
          className="px-3 py-1.5 bg-white text-[var(--color-text)] text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          수정
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 bg-white text-[var(--color-danger)] text-sm rounded border border-red-300 hover:bg-red-50 transition-colors whitespace-nowrap"
        >
          삭제
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1 hidden sm:block" />
        <button
          onClick={handleApprove}
          className="px-3 py-1.5 bg-[var(--color-info)] text-white text-sm rounded hover:opacity-90 transition-colors whitespace-nowrap"
        >
          승인
        </button>
        <button
          onClick={handlePrint}
          className="px-3 py-1.5 bg-white text-[var(--color-text)] text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          성적서 출력
        </button>
        <button
          onClick={handleExcel}
          className="px-3 py-1.5 bg-[var(--color-secondary)] text-white text-sm rounded hover:opacity-90 transition-colors whitespace-nowrap"
        >
          엑셀
        </button>
        <span className="ml-auto text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
          총 {data.length}건
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 sm:mx-6 mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 overflow-auto px-3 sm:px-6 py-2">
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
            <table className="data-table min-w-[700px] w-full">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">성적서번호</th>
                  <th className="whitespace-nowrap">발행일자</th>
                  <th className="whitespace-nowrap">제품명</th>
                  <th className="whitespace-nowrap">거래처</th>
                  <th className="whitespace-nowrap hidden sm:table-cell">템플릿</th>
                  <th className="whitespace-nowrap hidden md:table-cell">검사자</th>
                  <th className="whitespace-nowrap hidden md:table-cell">승인자</th>
                  <th className="whitespace-nowrap">상태</th>
                  <th className="whitespace-nowrap hidden lg:table-cell">비고</th>
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
                    <td className="font-mono text-xs whitespace-nowrap">{row.report_number}</td>
                    <td className="whitespace-nowrap">{row.report_date}</td>
                    <td className="max-w-[120px] sm:max-w-none truncate">{row.product_name}</td>
                    <td className="max-w-[100px] sm:max-w-none truncate">{row.customer_name}</td>
                    <td className="hidden sm:table-cell">템플릿 {row.template_type}</td>
                    <td className="hidden md:table-cell">{row.inspector}</td>
                    <td className="hidden md:table-cell">{row.approved_by}</td>
                    <td>
                      <span className={`badge badge-${row.status}`}>
                        {STATUS_MAP[row.status] || row.status}
                      </span>
                    </td>
                    <td className="max-w-[150px] truncate hidden lg:table-cell">{row.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print */}
      {showPrint && selectedId && (() => {
        const row = data.find((d) => d.id === selectedId);
        if (!row) return null;
        return (
          <ReportPrint
            report={{
              report_number: row.report_number,
              report_date: row.report_date,
              product_name: row.product_name || undefined,
              product_code: row.product_code || undefined,
              customer_name: row.customer_name || undefined,
              template_type: row.template_type || 1,
              test_results: (row.test_results || {}) as Record<string, string | number>,
              inspector: row.inspector || undefined,
              approved_by: row.approved_by || undefined,
              memo: row.memo || undefined,
              status: row.status,
            }}
            onClose={() => setShowPrint(false)}
          />
        );
      })()}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
              <h2 className="text-base sm:text-lg font-bold">
                {isEditing ? '성적서 수정' : '성적서 신규등록'}
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
              {/* Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    발행일자 *
                  </label>
                  <input
                    type="date"
                    value={formData.report_date}
                    onChange={(e) => setFormData({ ...formData, report_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">템플릿</label>
                  <select
                    value={formData.template_type}
                    onChange={(e) =>
                      setFormData({ ...formData, template_type: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {TEMPLATE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
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
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">검사자</label>
                  <input
                    type="text"
                    value={formData.inspector}
                    onChange={(e) => setFormData({ ...formData, inspector: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">승인자</label>
                  <input
                    type="text"
                    value={formData.approved_by}
                    onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 4 - Test Results */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  시험결과 (JSON)
                </label>
                <textarea
                  value={formData.test_results}
                  onChange={(e) => setFormData({ ...formData, test_results: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs sm:text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder='{"항목1": "결과값", "항목2": "결과값"}'
                />
              </div>

              {/* Row 5 - Memo */}
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
            <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50">
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
