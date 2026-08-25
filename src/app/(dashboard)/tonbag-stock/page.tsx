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

interface ProdLog { id: number; log_date: string; product: string; worker: string | null; good_count: number; defect_count: number; created_at: string; }
interface StockCheck { id: number; check_date: string; product: string; qty: number; }
interface Worker { id: number; name: string; }

const firstToken = (name: string) => (name || '').trim().split(/[\s(]/)[0];

export default function TonbagStockPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const role = useMemo(() => getSession()?.profile?.role, []);
  const canView = role === 'admin' || role === 'monitor' || role === 'field';
  const canEdit = canView;

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);

  const [stocks, setStocks] = useState<StockCheck[]>([]);
  const [stockInput, setStockInput] = useState<Record<string, string>>({});
  const [shipTon, setShipTon] = useState<Record<string, number>>({});

  const [roster, setRoster] = useState<Worker[]>([]);
  const [newWorker, setNewWorker] = useState('');

  // 생산: good[product][worker] = 지대 수
  const [good, setGood] = useState<Record<string, Record<string, number>>>({});
  const [openWorker, setOpenWorker] = useState<string | null>(null); // 입력 팝업 대상
  const [savingWorker, setSavingWorker] = useState(false);

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

      const g: Record<string, Record<string, number>> = {};
      lrows.forEach(l => {
        const w = (l.worker || '').trim();
        if (!g[l.product]) g[l.product] = {};
        if (w) g[l.product][w] = (g[l.product][w] || 0) + l.good_count;
      });
      setGood(g);
    } catch {
      toast.error('데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, date, toast]);

  useEffect(() => { if (canView) loadRoster(); }, [canView, loadRoster]);
  useEffect(() => { if (canView) load(); }, [canView, load]);

  const addWorker = async () => {
    const nm = newWorker.trim();
    if (!nm) return;
    const { error } = await supabase.from('production_workers').insert({ name: nm, sort: roster.length + 1 });
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
  const prodTotal = (p: string) => Object.values(good[p] || {}).reduce((s, v) => s + (v || 0), 0);
  const workerTotal = (w: string) => PRODUCTS.reduce((s, p) => s + cell(p, w), 0);

  // 작업자 단위 저장(팝업 확인 시)
  const saveWorker = async (w: string) => {
    setSavingWorker(true);
    try {
      const rows = PRODUCTS.filter(p => cell(p, w) > 0).map(p => ({ log_date: date, product: p, worker: w, good_count: cell(p, w), defect_count: 0 }));
      const { error: delErr } = await supabase.from('production_logs').delete().eq('log_date', date).eq('worker', w);
      if (delErr) throw delErr;
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('production_logs').insert(rows);
        if (insErr) throw insErr;
      }
      toast.success(`${w} 생산 기록 저장`);
      setOpenWorker(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSavingWorker(false);
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

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-7 rounded-sm bg-indigo-600" />
          <h1 className="text-2xl font-extrabold text-gray-900">톤백 재고관리</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(format(subDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
            className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-bold text-base">◀ 전날</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2.5 border-2 border-indigo-300 rounded-lg text-lg font-bold text-slate-800" style={{ colorScheme: 'light' }} />
          <button onClick={() => setDate(format(addDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
            className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-bold text-base">다음날 ▶</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
        ) : (
          <div className="max-w-[1100px] mx-auto flex flex-col gap-7">

            {/* ═══ 현재 재고 요약 ═══ */}
            <div>
              <h2 className="text-lg font-bold text-gray-700 mb-3">📦 현재 재고 <span className="text-[13px] font-normal text-gray-400">(아침 + 생산 − 출하)</span></h2>
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
                      <div className="text-2xl font-black text-gray-900">{p}</div>
                      <div className="text-5xl font-black text-indigo-600 tabular-nums mt-2 leading-none">{cur.toLocaleString()}<span className="text-lg text-gray-400 ml-1">지대</span></div>
                      <div className="text-[13px] text-gray-500 mt-3 tabular-nums leading-relaxed">
                        아침 {morning.toLocaleString()} + 생산 <span className="text-emerald-600 font-bold">{prod.toLocaleString()}</span>
                        <br />
                        {shipPallet != null
                          ? <>출하 <span className="text-rose-500 font-bold">−{shipPallet.toLocaleString()}</span> <span className="text-gray-400">({shipT.toFixed(1)}t÷{ppt})</span></>
                          : <span className="text-gray-400">출하 {shipT > 0 ? `${shipT.toFixed(1)}t (미설정)` : '0'}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ 아침(8시) 재고 체크 ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-lg font-bold text-gray-700 mb-4">🕗 아침 재고 체크 <span className="text-[13px] font-normal text-gray-400">(매일 08:00)</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PRODUCTS.map(p => (
                  <div key={p} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-3 border border-slate-200">
                    <span className="text-3xl font-black text-gray-900 w-24 shrink-0">{p}</span>
                    <input type="number" inputMode="numeric" value={stockInput[p] ?? ''} disabled={!canEdit}
                      onChange={e => setStockInput(s => ({ ...s, [p]: e.target.value }))}
                      placeholder="지대 수"
                      className="flex-1 min-w-0 h-14 px-4 border-2 border-gray-300 rounded-xl text-2xl font-bold text-right" />
                    {canEdit && (
                      <button onClick={() => saveStock(p)}
                        className="h-14 px-5 rounded-xl bg-slate-800 text-white text-lg font-bold shrink-0">저장</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ 생산일지 (작업자 버튼 → 팝업 입력) ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-lg font-bold text-gray-700 mb-4">📝 생산일지 <span className="text-[13px] font-normal text-gray-400">(작업자를 누르면 큰 입력창이 뜹니다)</span></h2>

              <div className="flex flex-wrap gap-3 items-stretch">
                {roster.map(w => {
                  const t = workerTotal(w.name);
                  return (
                    <button key={w.id} onClick={() => canEdit && setOpenWorker(w.name)} disabled={!canEdit}
                      className={`px-8 py-6 rounded-3xl border-2 text-center transition-colors min-w-[140px] ${t > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-800 border-gray-300'}`}>
                      <div className="text-2xl font-black">{w.name}</div>
                      <div className={`text-base font-bold mt-1 ${t > 0 ? 'text-indigo-100' : 'text-gray-400'}`}>{t > 0 ? `${t.toLocaleString()} 지대` : '입력'}</div>
                    </button>
                  );
                })}
                {canEdit && (
                  <div className="flex items-center gap-2 px-3 rounded-3xl border-2 border-dashed border-gray-300">
                    <input value={newWorker} onChange={e => setNewWorker(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addWorker(); }}
                      placeholder="새 작업자" className="w-28 px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
                    <button onClick={addWorker} className="px-4 py-2.5 rounded-lg bg-slate-700 text-white text-base font-bold">＋추가</button>
                  </div>
                )}
              </div>

              {/* 제품별 당일 생산 합계 */}
              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2">
                {PRODUCTS.map(p => (
                  <span key={p} className="text-lg">
                    <b className="text-gray-800">{p}</b> <span className="text-emerald-600 font-black tabular-nums">{prodTotal(p).toLocaleString()}</span> <span className="text-gray-400 text-sm">지대</span>
                  </span>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ═══ 작업자별 생산 입력 팝업 (크게) ═══ */}
      {openWorker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setOpenWorker(null)}>
          <div style={{ background: '#fff', borderRadius: 22, width: '94vw', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: '#4f46e5', color: '#fff', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 26, fontWeight: 900 }}>{openWorker} <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.8 }}>생산 입력</span></span>
              <button onClick={() => setOpenWorker(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PRODUCTS.map(p => {
                const v = cell(p, openWorker);
                return (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16 }}>
                    <span style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', width: 96 }}>{p}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setCell(p, openWorker, v - 1)}
                        style={{ width: 56, height: 56, borderRadius: 14, background: '#e2e8f0', color: '#334155', fontSize: 34, fontWeight: 900, border: 'none', cursor: 'pointer', lineHeight: 1 }}>−</button>
                      <input type="number" inputMode="numeric" value={v === 0 ? '' : v} placeholder="0"
                        onChange={e => setCell(p, openWorker, parseInt(e.target.value || '0', 10) || 0)}
                        style={{ width: 84, height: 56, textAlign: 'center', fontSize: 30, fontWeight: 800, border: '2px solid #cbd5e1', borderRadius: 14 }} />
                      <button onClick={() => setCell(p, openWorker, v + 1)}
                        style={{ width: 56, height: 56, borderRadius: 14, background: '#4f46e5', color: '#fff', fontSize: 34, fontWeight: 900, border: 'none', cursor: 'pointer', lineHeight: 1 }}>＋</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '0 24px 22px', display: 'flex', gap: 12 }}>
              <button onClick={() => setOpenWorker(null)}
                style={{ flex: 1, padding: '18px 0', fontSize: 22, fontWeight: 800, background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 16, cursor: 'pointer' }}>닫기</button>
              <button onClick={() => saveWorker(openWorker)} disabled={savingWorker}
                style={{ flex: 2, padding: '18px 0', fontSize: 22, fontWeight: 900, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer', opacity: savingWorker ? 0.6 : 1 }}>
                {savingWorker ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
