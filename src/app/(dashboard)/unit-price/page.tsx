'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import { smartCompare } from '@/lib/utils/sortCompare';

// ── Types ──
// 단가 = 운송사 × 거래처 × 월 (레거시 unit_mst). 제품·운송구분은 단가에 없음.
interface UnitPrice {
  id: string;
  company_id: string | null;
  customer_id: string | null;
  price: number;
  effective_date: string;
  transport_companies: { name: string } | null;
  customers: { name: string } | null;
}
interface EnrichedRow extends UnitPrice {
  prevPrice: number | null; // 전월 단가 (없으면 null = 신규)
  delta: number | null;     // 전월 대비 증감 (null = 신규)
}

type SortKey = 'change' | 'company' | 'customer' | 'price';

function firstOfMonth(ym: string): string { return `${ym}-01`; }
function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function UnitPricePage() {
  const supabase = createClient();
  const toast = useToast();
  const session = useMemo(() => getSession(), []);
  const role = session?.profile?.role;
  const canEdit = role === 'admin';

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<number>(0);
  const [copying, setCopying] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'change', dir: 'desc' });

  const fetchData = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const PAGE = 1000;
      const fetchMonth = async (m: string): Promise<UnitPrice[]> => {
        let all: unknown[] = [];
        let pg = 0, more = true;
        while (more) {
          const { data, error } = await supabase
            .from('unit_prices')
            .select('id, company_id, customer_id, price, effective_date, transport_companies(name), customers(name)')
            .eq('effective_date', firstOfMonth(m))
            .range(pg * PAGE, (pg + 1) * PAGE - 1);
          if (error) throw error;
          const r = data || [];
          all = [...all, ...r];
          more = r.length === PAGE;
          pg++;
        }
        return all as unknown as UnitPrice[];
      };
      const [cur, prev] = await Promise.all([fetchMonth(ym), fetchMonth(prevMonth(ym))]);
      const prevMap = new Map<string, number>();
      for (const p of prev) prevMap.set(`${p.company_id}|${p.customer_id}`, Number(p.price));
      const enriched: EnrichedRow[] = cur.map(r => {
        const pp = prevMap.get(`${r.company_id}|${r.customer_id}`);
        const prevPrice = pp === undefined ? null : pp;
        const delta = prevPrice === null ? null : Number(r.price) - prevPrice;
        return { ...r, prevPrice, delta };
      });
      setRows(enriched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '단가 조회 실패');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => { fetchData(month); }, [month, fetchData]);

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'company' || key === 'customer' ? 'asc' : 'desc' });

  const changeScore = (r: EnrichedRow) =>
    (r.delta !== null && r.delta !== 0) ? 1e12 + Math.abs(r.delta) : (r.prevPrice === null ? 1e12 : 0);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let c: number;
      if (sort.key === 'company') c = smartCompare(a.transport_companies?.name, b.transport_companies?.name) || smartCompare(a.customers?.name, b.customers?.name);
      else if (sort.key === 'customer') c = smartCompare(a.customers?.name, b.customers?.name);
      else if (sort.key === 'price') c = Number(a.price) - Number(b.price);
      else c = changeScore(a) - changeScore(b);
      return sort.dir === 'asc' ? c : -c;
    });
    return arr;
  }, [rows, sort]);

  const changedCount = useMemo(() => rows.filter(r => (r.delta !== null && r.delta !== 0) || r.prevPrice === null).length, [rows]);

  const saveEdit = async (id: string) => {
    try {
      const { error } = await supabase.from('unit_prices').update({ price: editVal }).eq('id', id);
      if (error) throw error;
      setRows(prev => prev.map(r => (r.id === id ? { ...r, price: editVal, delta: r.prevPrice === null ? null : editVal - r.prevPrice } : r)));
      setEditId(null);
      toast.success('단가가 수정되었습니다.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패');
    }
  };

  const copyFromPrevMonth = async () => {
    if (!canEdit) return;
    if (rows.length > 0 && !confirm('현재 월에 이미 단가가 있습니다. 전월 단가를 추가로 복사할까요?')) return;
    if (!confirm(`${prevMonth(month)} 단가를 ${month}로 복사합니다. 진행할까요?`)) return;
    setCopying(true);
    try {
      const { data: prev, error: e1 } = await supabase
        .from('unit_prices')
        .select('company_id, customer_id, price, is_active')
        .eq('effective_date', firstOfMonth(prevMonth(month)));
      if (e1) throw e1;
      if (!prev || prev.length === 0) { toast.warning('전월 단가가 없습니다.'); return; }
      const existing = new Set(rows.map(r => `${r.company_id}|${r.customer_id}`));
      const toInsert = prev
        .filter(p => !existing.has(`${p.company_id}|${p.customer_id}`))
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

  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (key: SortKey, label: string, extra = '') =>
    <th onClick={() => toggleSort(key)} className={`cursor-pointer select-none whitespace-nowrap ${extra}`} title="클릭하여 정렬">{label}<span className="text-blue-600">{arrow(key)}</span></th>;

  const won = (n: number) => Number(n).toLocaleString();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">단가관리</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <label className="text-sm font-semibold text-gray-700">조회 월</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        {canEdit && (
          <button onClick={copyFromPrevMonth} disabled={copying}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
            title={`${prevMonth(month)} 단가를 ${month}로 복사`}>
            {copying ? '복사중...' : '전월 단가 복사'}
          </button>
        )}
        <span className="ml-auto text-sm text-[var(--color-text-secondary)]">
          총 {rows.length}건 · <span className="text-rose-600 font-semibold">변동 {changedCount}건</span>
        </span>
      </div>

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
                  {th('company', '운송사')}
                  {th('customer', '거래처')}
                  <th className="text-right whitespace-nowrap">전월단가</th>
                  {th('price', '단가(원/톤)', 'text-right')}
                  {th('change', '전월대비', 'text-right')}
                  {canEdit && <th>작업</th>}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(r => {
                  const isNew = r.prevPrice === null;
                  const up = (r.delta ?? 0) > 0, down = (r.delta ?? 0) < 0;
                  return (
                    <tr key={r.id} style={{ background: (isNew || (r.delta ?? 0) !== 0) ? '#fff7f5' : undefined }}>
                      <td className="font-medium">{r.transport_companies?.name || '-'}</td>
                      <td>{r.customers?.name || '-'}</td>
                      <td className="text-right text-gray-500 tabular-nums">{isNew ? '-' : won(r.prevPrice!)}</td>
                      <td className="text-right tabular-nums font-semibold">
                        {editId === r.id ? (
                          <input type="number" value={editVal} onChange={e => setEditVal(Number(e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(r.id); if (e.key === 'Escape') setEditId(null); }}
                            autoFocus className="w-28 px-2 py-1 border border-blue-400 rounded text-sm text-right" />
                        ) : won(r.price)}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {isNew ? <span className="text-blue-600 font-semibold">신규</span>
                          : (r.delta === 0 ? <span className="text-gray-300">-</span>
                            : <span className={up ? 'text-rose-600 font-semibold' : 'text-blue-600 font-semibold'}>{up ? '▲' : '▼'} {won(Math.abs(r.delta!))}</span>)}
                      </td>
                      {canEdit && (
                        <td>
                          {editId === r.id ? (
                            <span className="flex gap-1 justify-center">
                              <button onClick={() => saveEdit(r.id)} className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">저장</button>
                              <button onClick={() => setEditId(null)} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">취소</button>
                            </span>
                          ) : (
                            <button onClick={() => { setEditId(r.id); setEditVal(r.price); }}
                              className="px-2 py-0.5 bg-white border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-50">수정</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
