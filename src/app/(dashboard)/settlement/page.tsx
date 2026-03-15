'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { exportToExcel, EXCEL_COLUMNS } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';

// ── Types ──────────────────────────────────────────────
interface Settlement {
  id: string;
  settlement_date: string;
  settlement_number: string;
  company_id: string | null;
  company_name: string | null;
  period_start: string;
  period_end: string;
  total_quantity: number | null;
  total_amount: number;
  unit_price: number | null;
  tax_amount: number;
  final_amount: number;
  status: string;
  memo: string | null;
  created_at: string;
}

interface SettlementDetail {
  id: string;
  settlement_id: string;
  shipment_id: string | null;
  shipment_date: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  memo: string | null;
}

interface TransportCompany {
  id: string;
  name: string;
}

interface SettlementFormData {
  settlement_date: string;
  company_id: string;
  period_start: string;
  period_end: string;
  total_quantity: number | null;
  total_amount: number;
  unit_price: number | null;
  tax_amount: number;
  final_amount: number;
  status: string;
  memo: string;
}

const STATUS_OPTIONS = [
  { value: 'draft', label: '작성중' },
  { value: 'confirmed', label: '확정' },
  { value: 'paid', label: '지급완료' },
  { value: 'cancelled', label: '취소' },
];

const STATUS_MAP: Record<string, string> = {
  draft: '작성중',
  confirmed: '확정',
  paid: '지급완료',
  cancelled: '취소',
};

const emptyForm: SettlementFormData = {
  settlement_date: format(new Date(), 'yyyy-MM-dd'),
  company_id: '',
  period_start: format(new Date(), 'yyyy-MM-01'),
  period_end: format(new Date(), 'yyyy-MM-dd'),
  total_quantity: null,
  total_amount: 0,
  unit_price: null,
  tax_amount: 0,
  final_amount: 0,
  status: 'draft',
  memo: '',
};

// ── Component ──────────────────────────────────────────
export default function SettlementPage() {
  const supabase = createClient();
  const toast = useToast();

  const [data, setData] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<SettlementFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // Details
  const [details, setDetails] = useState<SettlementDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Search
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-01-01'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchText, setSearchText] = useState('');

  // Lookups
  const [companies, setCompanies] = useState<TransportCompany[]>([]);

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('v_settlements')
        .select('*')
        .gte('settlement_date', dateFrom)
        .lte('settlement_date', dateTo)
        .order('settlement_date', { ascending: false })
        .order('settlement_number', { ascending: false });

      if (searchText) {
        query = query.or(
          `settlement_number.ilike.%${searchText}%,company_name.ilike.%${searchText}%`
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

  const fetchDetails = useCallback(
    async (settlementId: string) => {
      setDetailsLoading(true);
      try {
        const { data: result, error: fetchError } = await supabase
          .from('settlement_details')
          .select('*')
          .eq('settlement_id', settlementId)
          .order('shipment_date');
        if (fetchError) throw fetchError;
        setDetails(result || []);
      } catch {
        setDetails([]);
      } finally {
        setDetailsLoading(false);
      }
    },
    [supabase]
  );

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

  // Fetch details when row selected
  useEffect(() => {
    if (selectedId) {
      fetchDetails(selectedId);
    } else {
      setDetails([]);
    }
  }, [selectedId, fetchDetails]);

  // ── Helpers ──────────────────────────────────────────
  const generateSettlementNumber = () => {
    const today = format(new Date(), 'yyyyMMdd');
    const seq = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ST-${today}-${seq}`;
  };

  const handleSearch = () => fetchData();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Auto-calculation
  const recalculate = (
    totalAmount: number,
    taxRate: number = 0.1
  ): { tax_amount: number; final_amount: number } => {
    const tax_amount = Math.round(totalAmount * taxRate);
    const final_amount = totalAmount + tax_amount;
    return { tax_amount, final_amount };
  };

  const handleTotalAmountChange = (value: number) => {
    const { tax_amount, final_amount } = recalculate(value);
    setFormData((prev) => ({
      ...prev,
      total_amount: value,
      tax_amount,
      final_amount,
    }));
  };

  const handleQuantityAndPriceCalc = () => {
    if (formData.total_quantity && formData.unit_price) {
      const totalAmount = Math.round(formData.total_quantity * formData.unit_price);
      handleTotalAmountChange(totalAmount);
    }
  };

  // ── CRUD ─────────────────────────────────────────────
  const handleNew = () => {
    setIsEditing(false);
    setFormData({
      ...emptyForm,
      settlement_date: format(new Date(), 'yyyy-MM-dd'),
      period_start: format(new Date(), 'yyyy-MM-01'),
      period_end: format(new Date(), 'yyyy-MM-dd'),
    });
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
      settlement_date: row.settlement_date,
      company_id: row.company_id || '',
      period_start: row.period_start,
      period_end: row.period_end,
      total_quantity: row.total_quantity,
      total_amount: row.total_amount,
      unit_price: row.unit_price,
      tax_amount: row.tax_amount,
      final_amount: row.final_amount,
      status: row.status,
      memo: row.memo || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedId) {
      toast.warning('삭제할 항목을 선택해주세요.');
      return;
    }
    if (!confirm('선택한 정산 데이터를 삭제하시겠습니까? 관련 상세 내역도 함께 삭제됩니다.')) return;
    try {
      const { error: delError } = await supabase
        .from('settlements')
        .delete()
        .eq('id', selectedId);
      if (delError) throw delError;
      setSelectedId(null);
      setDetails([]);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleSave = async () => {
    if (!formData.company_id) {
      toast.warning('운송사를 선택해주세요.');
      return;
    }

    try {
      const payload = {
        settlement_date: formData.settlement_date,
        company_id: formData.company_id,
        period_start: formData.period_start,
        period_end: formData.period_end,
        total_quantity: formData.total_quantity,
        total_amount: formData.total_amount,
        unit_price: formData.unit_price,
        tax_amount: formData.tax_amount,
        final_amount: formData.final_amount,
        status: formData.status,
        memo: formData.memo || null,
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('settlements')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('settlements').insert({
          ...payload,
          settlement_number: generateSettlementNumber(),
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

  const handlePrint = () => {
    if (!selectedId) {
      toast.warning('출력할 정산서를 선택해주세요.');
      return;
    }
    toast.info('정산서 출력 기능은 준비 중입니다.');
  };

  const handleExcel = () => {
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS.settlements, '정산관리');
  };

  const formatCurrency = (value: number | null) => {
    if (value == null) return '';
    return Number(value).toLocaleString('ko-KR');
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-xl font-bold text-[var(--color-text)]">정산관리</h1>
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
        <input
          type="text"
          placeholder="정산번호, 운송사 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          onClick={handlePrint}
          className="px-3 py-1.5 bg-white text-[var(--color-text)] text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors"
        >
          정산서 출력
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

      {/* Main Content - Split View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Settlement Table */}
        <div className="flex-1 overflow-auto px-6 py-2 min-h-0">
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
                  <th>정산일자</th>
                  <th>정산번호</th>
                  <th>운송사</th>
                  <th>정산기간</th>
                  <th className="text-right">총수량</th>
                  <th className="text-right">공급가액</th>
                  <th className="text-right">세액</th>
                  <th className="text-right">합계금액</th>
                  <th>상태</th>
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
                    <td>{row.settlement_date}</td>
                    <td className="font-mono text-xs">{row.settlement_number}</td>
                    <td>{row.company_name}</td>
                    <td className="text-xs">
                      {row.period_start} ~ {row.period_end}
                    </td>
                    <td className="text-right">
                      {row.total_quantity != null
                        ? Number(row.total_quantity).toLocaleString()
                        : ''}
                    </td>
                    <td className="text-right">{formatCurrency(row.total_amount)}</td>
                    <td className="text-right">{formatCurrency(row.tax_amount)}</td>
                    <td className="text-right font-medium">{formatCurrency(row.final_amount)}</td>
                    <td>
                      <span className={`badge badge-${row.status}`}>
                        {STATUS_MAP[row.status] || row.status}
                      </span>
                    </td>
                    <td className="max-w-[150px] truncate">{row.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Settlement Details Sub-table */}
        {selectedId && (
          <div className="border-t-2 border-[var(--color-border)] bg-white">
            <div className="px-6 py-2 bg-gray-50 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-bold text-[var(--color-text)]">정산 상세내역</h3>
            </div>
            <div className="overflow-auto px-6 py-2" style={{ maxHeight: '200px' }}>
              {detailsLoading ? (
                <div className="flex items-center justify-center h-20 text-sm text-gray-500">
                  상세 내역을 불러오는 중...
                </div>
              ) : details.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-sm text-gray-500">
                  상세 내역이 없습니다.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>출하일자</th>
                      <th>제품명</th>
                      <th className="text-right">수량</th>
                      <th className="text-right">단가</th>
                      <th className="text-right">금액</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((detail) => (
                      <tr key={detail.id}>
                        <td>{detail.shipment_date}</td>
                        <td>{detail.product_name}</td>
                        <td className="text-right">
                          {detail.quantity != null
                            ? Number(detail.quantity).toLocaleString()
                            : ''}
                        </td>
                        <td className="text-right">{formatCurrency(detail.unit_price)}</td>
                        <td className="text-right font-medium">
                          {formatCurrency(detail.amount)}
                        </td>
                        <td className="max-w-[150px] truncate">{detail.memo}</td>
                      </tr>
                    ))}
                    {/* Summary row */}
                    <tr className="font-bold bg-gray-50">
                      <td colSpan={2} className="text-center">
                        합계
                      </td>
                      <td className="text-right">
                        {details
                          .reduce((sum, d) => sum + (d.quantity ? Number(d.quantity) : 0), 0)
                          .toLocaleString()}
                      </td>
                      <td></td>
                      <td className="text-right">
                        {details
                          .reduce((sum, d) => sum + (d.amount ? Number(d.amount) : 0), 0)
                          .toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">
                {isEditing ? '정산 수정' : '정산 신규등록'}
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
              {/* Row 1 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    정산일자 *
                  </label>
                  <input
                    type="date"
                    value={formData.settlement_date}
                    onChange={(e) =>
                      setFormData({ ...formData, settlement_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">운송사 *</label>
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
              </div>

              {/* Row 2 - Period */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    정산기간 시작
                  </label>
                  <input
                    type="date"
                    value={formData.period_start}
                    onChange={(e) =>
                      setFormData({ ...formData, period_start: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    정산기간 종료
                  </label>
                  <input
                    type="date"
                    value={formData.period_end}
                    onChange={(e) =>
                      setFormData({ ...formData, period_end: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 3 - Quantity & Price */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">총수량</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.total_quantity ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        total_quantity: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    onBlur={handleQuantityAndPriceCalc}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
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
                    onBlur={handleQuantityAndPriceCalc}
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
              </div>

              {/* Row 4 - Amounts */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    공급가액 (원)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.total_amount}
                    onChange={(e) =>
                      handleTotalAmountChange(parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">세액 (원)</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.tax_amount}
                    onChange={(e) => {
                      const taxAmt = parseFloat(e.target.value) || 0;
                      setFormData((prev) => ({
                        ...prev,
                        tax_amount: taxAmt,
                        final_amount: prev.total_amount + taxAmt,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    합계금액 (원)
                  </label>
                  <input
                    type="number"
                    value={formData.final_amount}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50 font-bold"
                  />
                </div>
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
