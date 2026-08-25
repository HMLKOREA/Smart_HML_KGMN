'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import { format, addDays, subDays } from 'date-fns';

// 톤백 생산 품목
const PRODUCTS = ['K200', 'K35', 'K50', 'K100', 'K325'];
// 지대당 중량(톤) — 출하(계근 톤) → 지대 환산용. 오후에 나머지 확정 예정.
const PALLET_TON: Record<string, number> = { K325: 1.6 };
const MAX_WORKERS = 3;

interface ProdLog { id: number; log_date: string; product: string; worker: string | null; good_count: number; defect_count: number; created_at: string; }
interface StockCheck { id: number; check_date: string; product: string; qty: number; }
interface Worker { id: number; name: string; }

/** "K200 (BAG)" → "K200" (정확 매칭용) */
const firstToken = (name: string) => (name || '').trim().split(/[\s(]/)[0];

export default function TonbagStockPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const role = useMemo(() => getSession()?.profile?.role, []);
  const canView = role === 'admin' || role === 'monitor' || role === 'field';
  const canEdit = canView;

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [savingGrid, setSavingGrid] = useState(false);

  const [stocks, setStocks] = useState<StockCheck[]>([]);
  const [stockInput, setStockInput] = useState<Record<string, string>>({});
  const [shipTon, setShipTon] = useState<Record<string, number>>({});

  // 작업자 명단(버튼) + 선택(최대 3)
  const [roster, setRoster] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [newWorker, setNewWorker] = useState('');

  // 생산 그리드: good[product][workerName] = 지대 수
  const [good, setGood] = useState<Record<string, Record<string, number>>>({});

  const loadRoster = useCallback(async () => {
    const { data } = await supabase.from('production_workers').select('id,name').eq('is_active', true).order('sort').order('name');
    setRoster((data || []) as Worker[]);
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: lg }, { data: st }, { data: sh }] = await Promise.all([
        supabase.from('production_logs').select('*').eq('log_date', date).order('created_at'),
        supabase.from('tonbag_stock_checks').select('*').eq('check_date', date),
        supabase.from('v_shipments').select('product_name, weight_net').eq('shipment_date', date),
      ]);
      const lrows = (lg || []) as ProdLog[];
      const srows = (st || []) as StockCheck[];
      setStocks(srows);
      const si: Record<string, string> = {};
      PRODUCTS.forEach(p => { const s = srows.find(x => x.product === p); si[p] = s ? String(s.qty) : ''; });
      setStockInput(si);

      const shp: Record<string, number> = {};
      ((sh || []) as { product_name: string; weight_net: number | null }[]).forEach(r => {
        const key = firstToken(r.product_name);
        if (PRODUCTS.includes(key)) shp[key] = (shp[key] || 0) + (Number(r.weight_net) || 0);
      });
      setShipTon(shp);

      // 그날 기록에서 작업자/그리드 복원
      const sel: string[] = [];
      const g: Record<string, Record<string, number>> = {};
      lrows.forEach(l => {
        const w = (l.worker || '').trim();
        if (w && !sel.includes(w) && sel.length < MAX_WORKERS) sel.push(w);
        if (!g[l.product]) g[l.product] = {};
        if (w) g[l.product][w] = (g[l.product][w] || 0) + l.good_count;
      });
      setSelected(sel);
      setGood(g);
    } catch {
      toast.error('데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, date, toast]);

  useEffect(() => { if (canView) loadRoster(); }, [canView, loadRoster]);
  useEffect(() => { if (canView) load(); }, [canView, load]);

  const toggleWorker = (name: string) => {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      if (prev.length >= MAX_WORKERS) { toast.warning(`작업자는 최대 ${MAX_WORKERS}명까지 선택할 수 있습니다.`); return prev; }
      return [...prev, name];
    });
  };

  const addWorker = async () => {
    const nm = newWorker.trim();
    if (!nm) return;
    const { error } = await supabase.from('production_workers').insert({ name: nm, sort: (roster.length + 1) });
    if (error) { toast.error(error.code === '23505' ? '이미 있는 작업자입니다.' : error.message); return; }
    setNewWorker('');
    await loadRoster();
    toast.success(`작업자 '${nm}' 추가`);
  };

  const setCell = (product: string, worker: string, val: number) => {
    setGood(prev => {
      const next = { ...prev, [product]: { ...(prev[product] || {}) } };
      next[product][worker] = Math.max(0, val);
      return next;
    });
  };
  const cell = (p: string, w: string) => good[p]?.[w] || 0;
  const prodTotal = (p: string) => selected.reduce((s, w) => s + cell(p, w), 0);
  const workerTotal = (w: string) => PRODUCTS.reduce((s, p) => s + cell(p, w), 0);
  const grandTotal = PRODUCTS.reduce((s, p) => s + prodTotal(p), 0);

  const saveGrid = async () => {
    if (selected.length === 0) { toast.warning('작업자를 먼저 선택하세요.'); return; }
    setSavingGrid(true);
    try {
      const rows: { log_date: string; product: string; worker: string; good_count: number; defect_count: number }[] = [];
      PRODUCTS.forEach(p => selected.forEach(w => {
        const v = cell(p, w);
        if (v > 0) rows.push({ log_date: date, product: p, worker: w, good_count: v, defect_count: 0 });
      }));
      const { error: delErr } = await supabase.from('production_logs').delete().eq('log_date', date);
      if (delErr) throw delErr;
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('production_logs').insert(rows);
        if (insErr) throw insErr;
      }
      toast.success('생산일지가 저장되었습니다.');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSavingGrid(false);
    }
  };

  const saveStock = async (product: string) => {
    const qty = parseInt(stockInput[product] || '', 10);
    if (isNaN(qty) || qty < 0) { toast.warning('재고 수량을 입력하세요.'); return; }
    const { error } = await supabase.from('tonbag_stock_checks')
      .upsert({ check_date: date, product, qty, updated_at: new Date().toISOString() }, { onConflict: 'check_date,product' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${product} 아침 재고 저장`);
    load();
  };

  if (!canView) return <AccessDenied />;

  const Stepper = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex items-center justify-center gap-1">
      <button type="button" onClick={() => onChange(value - 1)} disabled={!canEdit}
        className="w-9 h-9 rounded-lg bg-slate-200 text-slate-700 text-xl font-black leading-none disabled:opacity-40 active:bg-slate-300">−</button>
      <input type="number" inputMode="numeric" value={value === 0 ? '' : value} placeholder="0" disabled={!canEdit}
        onChange={e => onChange(parseInt(e.target.value || '0', 10) || 0)}
        className="w-14 h-9 text-center text-lg font-bold border border-gray-300 rounded-lg" />
      <button type="button" onClick={() => onChange(value + 1)} disabled={!canEdit}
        className="w-9 h-9 rounded-lg bg-indigo-600 text-white text-xl font-black leading-none disabled:opacity-40 active:bg-indigo-700">＋</button>
    </div>
  );

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

            {/* ═══ 현재 재고 요약 ═══ */}
            <div>
              <h2 className="text-[15px] font-bold text-gray-700 mb-3">📦 현재 재고 <span className="text-[12px] font-normal text-gray-400">(아침재고 + 당일생산 − 당일출하)</span></h2>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {PRODUCTS.map(p => {
                  const morning = stocks.find(s => s.product === p)?.qty || 0;
                  const prod = prodTotal(p);
                  const shipT = shipTon[p] || 0;
                  const ppt = PALLET_TON[p];
                  const shipPallet = ppt ? Math.round(shipT / ppt) : null;
                  const cur = morning + prod - (shipPallet ?? 0);
                  return (
                    <div key={p} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-black text-gray-900">{p}</span>
                        <span className="text-[11px] text-gray-400">지대</span>
                      </div>
                      <div className="text-3xl font-black text-indigo-600 tabular-nums mt-2">{cur.toLocaleString()}</div>
                      <div className="text-[11.5px] text-gray-500 mt-2 tabular-nums leading-relaxed">
                        아침 {morning.toLocaleString()} + 생산 <span className="text-emerald-600 font-bold">{prod.toLocaleString()}</span>
                        <br />
                        {shipPallet != null
                          ? <>출하 <span className="text-rose-500 font-bold">−{shipPallet.toLocaleString()}</span> <span className="text-gray-400">({shipT.toFixed(1)}t÷{ppt})</span></>
                          : <span className="text-gray-400">출하 {shipT > 0 ? `${shipT.toFixed(1)}t (지대당 중량 미설정)` : '0'}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ 아침(8시) 재고 체크 ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[15px] font-bold text-gray-700 mb-3">🕗 아침 재고 체크 <span className="text-[12px] font-normal text-gray-400">(매일 08:00 기준)</span></h2>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h2 className="text-[15px] font-bold text-gray-700">📝 생산일지 <span className="text-[12px] font-normal text-gray-400">(작업자 선택 후 제품별 양호 지대 수 기록 → 재고 반영)</span></h2>
                {canEdit && (
                  <button onClick={saveGrid} disabled={savingGrid}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-base font-bold disabled:opacity-50">
                    {savingGrid ? '저장 중…' : '💾 생산일지 저장'}
                  </button>
                )}
              </div>

              {/* 작업자 선택 버튼 */}
              <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-[13px] font-bold text-gray-500 mr-1">작업자 선택 <span className="text-gray-400">(최대 {MAX_WORKERS}명)</span></span>
                  {roster.map(w => {
                    const on = selected.includes(w.name);
                    return (
                      <button key={w.id} onClick={() => canEdit && toggleWorker(w.name)} disabled={!canEdit}
                        className={`px-4 py-2 rounded-full text-[15px] font-bold border-2 transition-colors ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                        {on ? '✓ ' : ''}{w.name}
                      </button>
                    );
                  })}
                  {canEdit && (
                    <span className="inline-flex items-center gap-1 ml-1">
                      <input value={newWorker} onChange={e => setNewWorker(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addWorker(); }}
                        placeholder="새 작업자" className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                      <button onClick={addWorker} className="px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-sm font-bold">＋추가</button>
                    </span>
                  )}
                </div>
              </div>

              {selected.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">위에서 작업자를 선택하면 입력 표가 나타납니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 320 + selected.length * 170 }}>
                    <thead>
                      <tr>
                        <th className="p-2 text-left text-[13px] font-bold text-gray-500 border-b-2 border-gray-200" style={{ width: 90 }}>제품</th>
                        {selected.map(w => (
                          <th key={w} className="p-2 text-center text-[15px] font-black text-indigo-700 border-b-2 border-gray-200" style={{ minWidth: 160 }}>{w}</th>
                        ))}
                        <th className="p-2 text-center text-[13px] font-bold text-gray-500 border-b-2 border-gray-200" style={{ width: 70 }}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PRODUCTS.map(p => (
                        <tr key={p}>
                          <td className="p-2 font-black text-gray-900 text-lg border-b border-gray-100">{p}</td>
                          {selected.map(w => (
                            <td key={w} className="p-2 border-b border-gray-100">
                              <Stepper value={cell(p, w)} onChange={v => setCell(p, w, v)} />
                            </td>
                          ))}
                          <td className="p-2 text-center border-b border-gray-100">
                            <span className="text-lg font-black text-indigo-600 tabular-nums">{prodTotal(p).toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50">
                        <td className="p-2 font-bold text-gray-600">작업자 합계</td>
                        {selected.map(w => (
                          <td key={w} className="p-2 text-center font-black text-gray-700 tabular-nums">{workerTotal(w).toLocaleString()}</td>
                        ))}
                        <td className="p-2 text-center font-black text-indigo-700 tabular-nums text-lg">{grandTotal.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[12px] text-gray-400 mt-3">＋/− 버튼 또는 숫자 입력 후 <b>생산일지 저장</b>을 누르면 해당 날짜 기록이 갱신됩니다.</p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
