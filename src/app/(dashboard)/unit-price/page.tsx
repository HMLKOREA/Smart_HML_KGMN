'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';

// ── Types ──
interface UnitPrice {
  id: string;
  company_id: string | null;
  product_id: string | null;
  transport_type: string | null;
  price: number;
  effective_date: string;
  transport_companies: { name: string } | null;
  products: { name: string } | null;
}

const TRANSPORT_TYPES = ['카고', '탱크', '원석'];

// 월 첫째 날 문자열 (단가는 effective_date = 해당 월 1일로 관리)
function firstOfMonth(ym: string): string {
  return `${ym}-01`;
}
function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m-2: 0-index 전월
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function UnitPricePage() {
  const supabase = createClient();
  const toast = useToast();
  const session = useMemo(() => getSession(), []);
  const role = session?.profile?.role;
  const canEdit = role === 'admin';

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [rows, setRows] = useState<UnitPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<number>(0);
  const [copying, setCopying] = useState(false);

  const fetchData = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('unit_prices')
        .select('id, company_id, product_id, transport_type, price, effective_date, transport_companies(name), products(name)')
        .eq('effective_date', firstOfMonth(ym))
        .order('transport_type');
      if (error) throw error;
      setRows((data || []) as unknown as UnitPrice[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '단가 조회 실패');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => { fetchData(month); }, [month, fetchData]);

  // 단가 인라인 저장
  const saveEdit = async (id: string) => {
    try {
      const { error } = await supabase.from('unit_prices').update({ price: editVal }).eq('id', id);
      if (error) throw error;
      setRows(prev => prev.map(r => (r.id === id ? { ...r, price: editVal } : r)));
      setEditId(null);
      toast.success('단가가 수정되었습니다.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패');
    }
  };

  // 전월 단가 복사 → 현재 월
  const copyFromPrevMonth = async () => {
    if (!canEdit) return;
    if (rows.length > 0 && !confirm('현재 월에 이미 단가가 있습니다. 전월 단가를 추가로 복사할까요?')) return;
    if (!confirm(`${prevMonth(month)} 단가를 ${month}로 복사합니다. 진행할까요?`)) return;
    setCopying(true);
    try {
      const { data: prev, error: e1 } = await supabase
        .from('unit_prices')
        .select('company_id, product_id, transport_type, price')
        .eq('effective_date', firstOfMonth(prevMonth(month)));
      if (e1) throw e1;
      if (!prev || prev.length === 0) { toast.warning('전월 단가가 없습니다.'); return; }

      // 현재 월에 이미 있는 (company,product,transport) 조합은 건너뜀
      const existing = new Set(rows.map(r => `${r.company_id}|${r.product_id}|${r.transport_type}`));
      const toInsert = prev
        .filter(p => !existing.has(`${p.company_id}|${p.product_id}|${p.transport_type}`))
        .map(p => ({ ...p, effective_date: firstOfMonth(month) }));

      if (toInsert.length === 0) { toast.info('복사할 새 단가가 없습니다.'); return; }
      const { error: e2 } = await supabase.from('unit_prices').insert(toInsert);
      if (e2) throw e2;
      toast.success(`${toInsert.length}건의 단가를 복사했습니다.`);
      fetchData(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '복사 실패');
    } finally {
      setCopying(false);
    }
  };

  if (role === 'transporter' || role === 'field') return <AccessDenied />;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">단가관리</h1>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <label className="text-sm font-semibold text-gray-700">조회 월</label>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {canEdit && (
          <button
            onClick={copyFromPrevMonth}
            disabled={copying}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
            title={`${prevMonth(month)} 단가를 ${month}로 복사`}
          >
            {copying ? '복사중...' : '전월 단가 복사'}
          </button>
        )}
        <span className="ml-auto text-sm text-[var(--color-text-secondary)]">총 {rows.length}건</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500">데이터를 불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-sm text-gray-500">
            <p>{month} 단가가 없습니다.</p>
            {canEdit && <p className="text-gray-400">‘전월 단가 복사’로 빠르게 채울 수 있습니다.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>운송사</th>
                  <th>제품</th>
                  <th>운송구분</th>
                  <th>단가(원/톤)</th>
                  {canEdit && <th>작업</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.transport_companies?.name || '-'}</td>
                    <td>{r.products?.name || '-'}</td>
                    <td>{r.transport_type || '-'}</td>
                    <td>
                      {editId === r.id ? (
                        <input
                          type="number"
                          value={editVal}
                          onChange={e => setEditVal(Number(e.target.value))}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(r.id); if (e.key === 'Escape') setEditId(null); }}
                          autoFocus
                          className="w-28 px-2 py-1 border border-blue-400 rounded text-sm text-right"
                        />
                      ) : (
                        <span>{Number(r.price).toLocaleString()}</span>
                      )}
                    </td>
                    {canEdit && (
                      <td>
                        {editId === r.id ? (
                          <span className="flex gap-1 justify-center">
                            <button onClick={() => saveEdit(r.id)} className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">저장</button>
                            <button onClick={() => setEditId(null)} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">취소</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => { setEditId(r.id); setEditVal(r.price); }}
                            className="px-2 py-0.5 bg-white border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-50"
                          >수정</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
