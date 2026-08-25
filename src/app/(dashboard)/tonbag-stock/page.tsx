'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import { format, addDays, subDays } from 'date-fns';

const PRODUCTS = ['K200', 'K35', 'K50', 'K100'];

interface ProdLog { id: number; log_date: string; product: string; worker: string | null; good_count: number; defect_count: number; memo: string | null; created_at: string; }
interface StockCheck { id: number; check_date: string; product: string; qty: number; memo: string | null; }

export default function TonbagStockPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const role = useMemo(() => getSession()?.profile?.role, []);
  const canView = role === 'admin' || role === 'monitor' || role === 'field';
  const canEdit = canView;

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logs, setLogs] = useState<ProdLog[]>([]);
  const [stocks, setStocks] = useState<StockCheck[]>([]);
  const [loading, setLoading] = useState(true);

  // 아침 재고 입력값(제품별)
  const [stockInput, setStockInput] = useState<Record<string, string>>({});
  // 생산일지 입력
  const [pProduct, setPProduct] = useState(PRODUCTS[0]);
  const [pWorker, setPWorker] = useState('');
  const [pGood, setPGood] = useState('');
  const [pDefect, setPDefect] = useState('');
  const [pMemo, setPMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: lg }, { data: st }] = await Promise.all([
        supabase.from('production_logs').select('*').eq('log_date', date).order('created_at', { ascending: false }),
        supabase.from('tonbag_stock_checks').select('*').eq('check_date', date),
      ]);
      const lrows = (lg || []) as ProdLog[];
      const srows = (st || []) as StockCheck[];
      setLogs(lrows);
      setStocks(srows);
      const si: Record<string, string> = {};
      PRODUCTS.forEach(p => { const s = srows.find(x => x.product === p); si[p] = s ? String(s.qty) : ''; });
      setStockInput(si);
    } catch {
      toast.error('데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, date, toast]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // 제품별 집계
  const byProduct = useMemo(() => {
    const m: Record<string, { good: number; defect: number; stock: number }> = {};
    PRODUCTS.forEach(p => { m[p] = { good: 0, defect: 0, stock: 0 }; });
    logs.forEach(l => { if (!m[l.product]) m[l.product] = { good: 0, defect: 0, stock: 0 }; m[l.product].good += l.good_count; m[l.product].defect += l.defect_count; });
    stocks.forEach(s => { if (!m[s.product]) m[s.product] = { good: 0, defect: 0, stock: 0 }; m[s.product].stock = s.qty; });
    return m;
  }, [logs, stocks]);

  const saveStock = async (product: string) => {
    const qty = parseInt(stockInput[product] || '', 10);
    if (isNaN(qty) || qty < 0) { toast.warning('재고 수량을 입력하세요.'); return; }
    const { error } = await supabase.from('tonbag_stock_checks')
      .upsert({ check_date: date, product, qty, updated_at: new Date().toISOString() }, { onConflict: 'check_date,product' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${product} 아침 재고 저장`);
    load();
  };

  const addLog = async () => {
    const good = parseInt(pGood || '0', 10) || 0;
    const defect = parseInt(pDefect || '0', 10) || 0;
    if (good <= 0 && defect <= 0) { toast.warning('양호 또는 불량 수량을 입력하세요.'); return; }
    setSaving(true);
    const { error } = await supabase.from('production_logs').insert({
      log_date: date, product: pProduct, worker: pWorker || null, good_count: good, defect_count: defect, memo: pMemo || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setPGood(''); setPDefect(''); setPMemo('');
    toast.success('생산 기록이 추가되었습니다.');
    load();
  };

  const delLog = async (id: number) => {
    if (!confirm('이 생산 기록을 삭제할까요?')) return;
    const { error } = await supabase.from('production_logs').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (!canView) return <AccessDenied />;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 rounded-sm bg-indigo-600" />
          <h1 className="text-xl font-extrabold text-gray-900">톤백 재고관리</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(format(subDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm">◀ 전날</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border-2 border-indigo-300 rounded-lg text-base font-bold text-slate-800" style={{ colorScheme: 'light' }} />
          <button onClick={() => setDate(format(addDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm">다음날 ▶</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">불러오는 중...</div>
        ) : (
          <div className="max-w-[1100px] mx-auto flex flex-col gap-6">

            {/* ═══ 재고 요약 ═══ */}
            <div>
              <h2 className="text-[15px] font-bold text-gray-700 mb-3">📦 현재 재고 <span className="text-[12px] font-normal text-gray-400">(아침재고 + 당일생산 양호)</span></h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {PRODUCTS.map(p => {
                  const d = byProduct[p];
                  const cur = d.stock + d.good;
                  return (
                    <div key={p} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black text-gray-900">{p}</span>
                        <span className="text-[11px] text-gray-400">지대</span>
                      </div>
                      <div className="text-4xl font-black text-indigo-600 tabular-nums mt-2">{cur.toLocaleString()}</div>
                      <div className="text-[12px] text-gray-500 mt-2 tabular-nums">
                        아침 {d.stock.toLocaleString()} + 생산 <span className="text-emerald-600 font-bold">{d.good.toLocaleString()}</span>
                        {d.defect > 0 && <span className="text-rose-500"> · 불량 {d.defect}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ 아침(8시) 재고 체크 ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[15px] font-bold text-gray-700 mb-3">🕗 아침 재고 체크 <span className="text-[12px] font-normal text-gray-400">(매일 08:00 기준)</span></h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {PRODUCTS.map(p => (
                  <div key={p} className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-bold text-gray-600">{p}</label>
                    <div className="flex gap-1.5">
                      <input type="number" inputMode="numeric" value={stockInput[p] ?? ''} disabled={!canEdit}
                        onChange={e => setStockInput(s => ({ ...s, [p]: e.target.value }))}
                        placeholder="지대 수"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base font-bold text-right" />
                      {canEdit && (
                        <button onClick={() => saveStock(p)}
                          className="px-3 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-bold shrink-0">저장</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ 생산일지 ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[15px] font-bold text-gray-700 mb-3">📝 생산일지 <span className="text-[12px] font-normal text-gray-400">(현장에서 바로 기록 → 양호 수량이 재고에 반영)</span></h2>

              {canEdit && (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end bg-slate-50 rounded-xl p-3 mb-4">
                  <div>
                    <label className="block text-[12px] font-bold text-gray-500 mb-1">제품</label>
                    <select value={pProduct} onChange={e => setPProduct(e.target.value)} className="w-full px-2.5 py-2.5 border border-gray-300 rounded-lg text-base font-bold">
                      {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-gray-500 mb-1">작업자</label>
                    <input value={pWorker} onChange={e => setPWorker(e.target.value)} placeholder="성명" className="w-full px-2.5 py-2.5 border border-gray-300 rounded-lg text-base" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-emerald-700 mb-1">양호</label>
                    <input type="number" inputMode="numeric" value={pGood} onChange={e => setPGood(e.target.value)} placeholder="개" className="w-full px-2.5 py-2.5 border border-emerald-300 rounded-lg text-base font-bold text-right" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-rose-600 mb-1">불량</label>
                    <input type="number" inputMode="numeric" value={pDefect} onChange={e => setPDefect(e.target.value)} placeholder="개" className="w-full px-2.5 py-2.5 border border-rose-200 rounded-lg text-base font-bold text-right" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-gray-500 mb-1">비고</label>
                    <input value={pMemo} onChange={e => setPMemo(e.target.value)} placeholder="선택" className="w-full px-2.5 py-2.5 border border-gray-300 rounded-lg text-base" />
                  </div>
                  <button onClick={addLog} disabled={saving}
                    className="px-3 py-2.5 rounded-lg bg-indigo-600 text-white text-base font-bold disabled:opacity-50">
                    {saving ? '기록 중…' : '＋ 기록'}
                  </button>
                </div>
              )}

              {logs.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">이 날짜의 생산 기록이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table" style={{ fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 70 }}>제품</th>
                        <th style={{ minWidth: 80 }}>작업자</th>
                        <th style={{ minWidth: 70, textAlign: 'right' }}>양호</th>
                        <th style={{ minWidth: 70, textAlign: 'right' }}>불량</th>
                        <th style={{ minWidth: 120 }}>비고</th>
                        <th style={{ minWidth: 90 }}>기록시각</th>
                        {canEdit && <th style={{ width: 60 }}>작업</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 800 }}>{l.product}</td>
                          <td>{l.worker || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{l.good_count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', color: l.defect_count ? '#e11d48' : '#cbd5e1', fontWeight: 700 }}>{l.defect_count.toLocaleString()}</td>
                          <td style={{ color: '#64748b' }}>{l.memo || ''}</td>
                          <td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                          {canEdit && (
                            <td style={{ textAlign: 'center' }}>
                              <button onClick={() => delLog(l.id)} className="text-[13px] font-bold text-red-500 px-2 py-1 rounded hover:bg-red-50">삭제</button>
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
        )}
      </div>
    </div>
  );
}
