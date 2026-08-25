'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import { format, addDays, subDays } from 'date-fns';
import { TONBAG_PRODUCTS as PRODUCTS, BAG_TON, computeTonbagInventory } from '@/lib/tonbag';

interface ProdLog { id: number; log_date: string; product: string; worker: string | null; good_count: number; defect_count: number; created_at: string; }
interface StockCheck { id: number; check_date: string; product: string; qty: number; }
interface Worker { id: number; name: string; }

const firstToken = (name: string) => (name || '').trim().split(/[\s(]/)[0];

/* ── 큰 숫자 키패드 (폰·패드 입력용) ── */
function NumberPad({ title, initial, onConfirm, onClose }: { title: string; initial: number; onConfirm: (v: number) => void; onClose: () => void }) {
  const [buf, setBuf] = useState(initial > 0 ? String(initial) : '');
  const num = parseInt(buf || '0', 10) || 0;
  const press = (d: string) => setBuf(b => { const n = (b + d).replace(/^0+(?=\d)/, ''); return n.slice(0, 6); });
  const keyBtn: React.CSSProperties = { height: 64, borderRadius: 14, border: '1px solid #d1d5db', background: '#fff', fontSize: 28, fontWeight: 800, color: '#0f172a', cursor: 'pointer' };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 22, width: '92vw', maxWidth: 380, boxShadow: '0 24px 70px rgba(0,0,0,0.45)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: '#1e293b', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ width: 40 }} />
          <span style={{ fontSize: 18, fontWeight: 800 }}>{title}</span>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontSize: 20, fontWeight: 800, cursor: 'pointer' }}>✕</button>
        </div>
        {/* 상단 숫자 표시 + ▲▼ */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '18px 20px 12px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', border: '2px solid #cbd5e1', borderRadius: 14, padding: '10px 18px', minHeight: 72 }}>
            <span style={{ fontSize: 46, fontWeight: 900, color: '#4f46e5', lineHeight: 1 }}>{buf || '0'}</span>
            <span style={{ fontSize: 16, color: '#94a3b8', marginLeft: 8, alignSelf: 'flex-end', marginBottom: 6 }}>개</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setBuf(String(num + 1))} style={{ width: 56, flex: 1, borderRadius: 12, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 26, fontWeight: 900, cursor: 'pointer' }}>▲</button>
            <button onClick={() => setBuf(String(Math.max(0, num - 1)))} style={{ width: 56, flex: 1, borderRadius: 12, border: 'none', background: '#e2e8f0', color: '#334155', fontSize: 26, fontWeight: 900, cursor: 'pointer' }}>▼</button>
          </div>
        </div>
        {/* 키패드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '4px 20px 8px' }}>
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(d => (
            <button key={d} onClick={() => press(d)} style={keyBtn}>{d}</button>
          ))}
          <button onClick={() => press('00')} style={keyBtn}>00</button>
          <button onClick={() => press('0')} style={keyBtn}>0</button>
          <button onClick={() => setBuf(b => b.slice(0, -1))} style={{ ...keyBtn, background: '#f1f5f9', fontSize: 24 }}>⌫</button>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '8px 20px 20px' }}>
          <button onClick={() => setBuf('')} style={{ flex: 1, height: 60, borderRadius: 14, border: 'none', background: '#e5e7eb', color: '#475569', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>지움</button>
          <button onClick={() => { onConfirm(num); onClose(); }} style={{ flex: 2, height: 60, borderRadius: 14, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 22, fontWeight: 900, cursor: 'pointer' }}>확인</button>
        </div>
      </div>
    </div>
  );
}

export default function TonbagStockPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const role = useMemo(() => getSession()?.profile?.role, []);
  const canView = role === 'admin' || role === 'monitor' || role === 'field';
  const canEdit = canView;

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  // 생산일지 기록일 = 재고일의 전날(D-1). 전날 밤 생산을 아침에 기록.
  const prodDate = format(subDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd');
  const [loading, setLoading] = useState(true);

  const [stocks, setStocks] = useState<StockCheck[]>([]);
  const [shipTon, setShipTon] = useState<Record<string, number>>({});

  const [roster, setRoster] = useState<Worker[]>([]);
  const [newWorker, setNewWorker] = useState('');

  const [good, setGood] = useState<Record<string, Record<string, number>>>({});
  const [openWorker, setOpenWorker] = useState<string | null>(null);
  const [savingWorker, setSavingWorker] = useState(false);
  // 일자별 재고 아카이브(최근 30일)
  const [archive, setArchive] = useState<{ date: string; rec: Record<string, { stock: number; prod: number }> }[]>([]);
  // 현재재고(이월): 선택일 기준 최근 아침재고 + 이후 생산
  const [carry, setCarry] = useState<Record<string, number>>({});

  // 숫자 키패드 상태
  const [pad, setPad] = useState<{ title: string; value: number; onConfirm: (v: number) => void } | null>(null);
  const openPad = (title: string, value: number, onConfirm: (v: number) => void) => { if (canEdit) setPad({ title, value, onConfirm }); };

  const loadRoster = useCallback(async () => {
    const { data } = await supabase.from('production_workers').select('id,name').eq('is_active', true).order('sort').order('name');
    setRoster((data || []) as Worker[]);
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const archFrom = format(subDays(new Date(date + 'T00:00:00'), 90), 'yyyy-MM-dd');
      const [{ data: lg }, { data: st }, { data: sh }, { data: stR }, { data: pdR }] = await Promise.all([
        supabase.from('production_logs').select('*').eq('log_date', prodDate).order('created_at'),
        supabase.from('tonbag_stock_checks').select('*').eq('check_date', date),
        supabase.from('v_shipments').select('product_name, weight_net').eq('shipment_date', date),
        supabase.from('tonbag_stock_checks').select('check_date, product, qty').gte('check_date', archFrom).lte('check_date', date),
        supabase.from('production_logs').select('log_date, product, good_count').gte('log_date', archFrom).lte('log_date', date),
      ]);
      const lrows = (lg || []) as ProdLog[];
      setStocks((st || []) as StockCheck[]);

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

      // 일자별 아카이브(아침재고 + 생산)
      const archMap = new Map<string, Record<string, { stock: number; prod: number }>>();
      const ensure = (d: string) => {
        if (!archMap.has(d)) archMap.set(d, Object.fromEntries(PRODUCTS.map(p => [p, { stock: 0, prod: 0 }])));
        return archMap.get(d)!;
      };
      ((stR || []) as { check_date: string; product: string; qty: number }[]).forEach(s => {
        const r = ensure(s.check_date); if (r[s.product]) r[s.product].stock = s.qty;
      });
      ((pdR || []) as { log_date: string; product: string; good_count: number }[]).forEach(l => {
        const r = ensure(l.log_date); if (r[l.product]) r[l.product].prod += l.good_count;
      });
      const arch30 = format(subDays(new Date(date + 'T00:00:00'), 29), 'yyyy-MM-dd');
      setArchive([...archMap.entries()].filter(([d]) => d >= arch30).sort((a, b) => b[0].localeCompare(a[0])).map(([d, rec]) => ({ date: d, rec })));
      // 현재재고(이월): 선택일 기준
      setCarry(computeTonbagInventory((stR || []) as never, (pdR || []) as never, date));
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
  const currentStock = (p: string) => stocks.find(s => s.product === p)?.qty || 0;

  const saveWorker = async (w: string) => {
    setSavingWorker(true);
    try {
      const rows = PRODUCTS.filter(p => cell(p, w) > 0).map(p => ({ log_date: prodDate, product: p, worker: w, good_count: cell(p, w), defect_count: 0 }));
      const { error: delErr } = await supabase.from('production_logs').delete().eq('log_date', prodDate).eq('worker', w);
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

  const saveStockValue = async (product: string, qty: number) => {
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
              <h2 className="text-lg font-bold text-gray-700 mb-3">📦 오늘 재고 <span className="text-[13px] font-normal text-gray-400">(매일 아침 8시 입력 · 그날 아침재고 + 생산)</span></h2>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {PRODUCTS.map(p => {
                  const morning = currentStock(p);
                  const prod = prodTotal(p);
                  const shipT = shipTon[p] || 0;
                  const bpt = BAG_TON[p];
                  const cur = carry[p] ?? Math.max(0, morning); // 그날 아침 8시 실측 재고
                  return (
                    <div key={p} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4">
                      <div className="text-2xl font-black text-gray-900">{p}</div>
                      {bpt != null ? (
                        <>
                          <div className="text-5xl font-black text-indigo-600 tabular-nums mt-2 leading-none">{(cur * bpt).toLocaleString(undefined, { maximumFractionDigits: 1 })}<span className="text-lg text-gray-400 ml-1">톤</span></div>
                          <div className="text-lg font-bold text-slate-500 tabular-nums mt-1">{cur.toLocaleString()}개 <span className="text-[11px] text-gray-400 font-normal">(개당 {bpt}t)</span></div>
                        </>
                      ) : (
                        <div className="text-5xl font-black text-indigo-600 tabular-nums mt-2 leading-none">{cur.toLocaleString()}<span className="text-lg text-gray-400 ml-1">개</span></div>
                      )}
                      <div className="text-[13px] text-gray-500 mt-3 tabular-nums leading-relaxed">
                        {morning > 0
                          ? <>아침 8시 실측 {morning.toLocaleString()}개{prod > 0 && <span className="text-gray-400"> · 전날생산 {prod.toLocaleString()}</span>}</>
                          : <span className="text-gray-400">아침 8시 재고 입력 대기</span>}
                        {shipT > 0 && <><br /><span className="text-gray-400">출하 {shipT.toFixed(1)}t (참고·미차감)</span></>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ 아침(8시) 재고 체크 ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-lg font-bold text-gray-700 mb-4">🕗 아침 재고 체크 <span className="text-[13px] font-normal text-gray-400">(칸을 누르면 숫자판이 뜹니다)</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PRODUCTS.map(p => {
                  const q = currentStock(p);
                  const bpt = BAG_TON[p];
                  return (
                    <button key={p} onClick={() => openPad(`${p} 아침 재고`, q, v => saveStockValue(p, v))} disabled={!canEdit}
                      className="flex items-center justify-between gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left active:bg-slate-100">
                      <span className="text-3xl font-black text-gray-900">{p}</span>
                      <span className="text-right whitespace-nowrap">
                        <span className="text-indigo-600 tabular-nums font-black">
                          <span className="text-base text-gray-500 font-bold mr-1.5">톤백</span>
                          <span className="text-3xl">{q.toLocaleString()}</span>
                          <span className="text-base text-gray-400 font-bold ml-1">개</span>
                        </span>
                        {bpt != null && <span className="block text-sm font-bold text-slate-500 tabular-nums mt-0.5">≈ {(q * bpt).toLocaleString(undefined, { maximumFractionDigits: 1 })} 톤</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ 생산일지 ═══ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-lg font-bold text-gray-700 mb-4">📝 생산일지 <span className="text-[13px] font-normal text-gray-400">(전날 밤 생산분 · <b className="text-indigo-600">{prodDate}</b> 기록 · 작업자를 누르면 입력창)</span></h2>

              <div className="flex flex-wrap gap-3 items-stretch">
                {roster.map(w => {
                  const t = workerTotal(w.name);
                  return (
                    <button key={w.id} onClick={() => canEdit && setOpenWorker(w.name)} disabled={!canEdit}
                      className={`px-8 py-6 rounded-3xl border-2 text-center transition-colors min-w-[140px] ${t > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-800 border-gray-300'}`}>
                      <div className="text-2xl font-black">{w.name}</div>
                      <div className={`text-base font-bold mt-1 ${t > 0 ? 'text-indigo-100' : 'text-gray-400'}`}>{t > 0 ? `${t.toLocaleString()}개` : '입력'}</div>
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

              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2">
                {PRODUCTS.map(p => {
                  const bpt = BAG_TON[p];
                  const t = prodTotal(p);
                  return (
                    <span key={p} className="text-lg">
                      <b className="text-gray-800">{p}</b> <span className="text-emerald-600 font-black tabular-nums">{t.toLocaleString()}</span> <span className="text-gray-400 text-sm">개{bpt != null && t > 0 ? ` (${(t * bpt).toLocaleString(undefined, { maximumFractionDigits: 1 })}t)` : ''}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* ═══ 일자별 재고 현황 (아카이브) ═══ */}
            {archive.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-lg font-bold text-gray-700 mb-4">📅 일자별 재고 현황 <span className="text-[13px] font-normal text-gray-400">(최근 30일 · 아침 8시 실측 재고)</span></h2>
                <div className="overflow-x-auto">
                  <table className="data-table" style={{ fontSize: 14, minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 110, textAlign: 'left' }}>날짜</th>
                        {PRODUCTS.map(p => <th key={p} style={{ minWidth: 78, textAlign: 'right' }}>{p}</th>)}
                        <th style={{ minWidth: 90, textAlign: 'right' }}>합계(톤)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archive.map(row => {
                        const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(row.date + 'T00:00:00').getDay()];
                        let totTon = 0;
                        const cells = PRODUCTS.map(p => {
                          const bags = row.rec[p].stock;
                          const bpt = BAG_TON[p];
                          if (bpt) totTon += bags * bpt;
                          return (
                            <td key={p} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {bags > 0 ? <><b>{bags.toLocaleString()}</b><span className="text-gray-400 text-xs">개</span></> : <span className="text-gray-300">-</span>}
                            </td>
                          );
                        });
                        return (
                          <tr key={row.date} style={row.date === date ? { background: '#eef2ff' } : undefined}>
                            <td style={{ whiteSpace: 'nowrap', fontWeight: 700, textAlign: 'left' }}>{row.date.slice(5)} ({dow})</td>
                            {cells}
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#4f46e5', fontVariantNumeric: 'tabular-nums' }}>{totTon.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ═══ 작업자별 생산 입력 팝업 ═══ */}
      {openWorker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setOpenWorker(null)}>
          <div style={{ background: '#fff', borderRadius: 22, width: '94vw', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: '#4f46e5', color: '#fff', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 26, fontWeight: 900 }}>
                {openWorker} <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.85 }}>생산 입력</span>
                <span style={{ fontSize: 15, fontWeight: 700, background: 'rgba(255,255,255,0.18)', padding: '2px 10px', borderRadius: 999, marginLeft: 10, whiteSpace: 'nowrap' }}>
                  📅 {prodDate} ({['일', '월', '화', '수', '목', '금', '토'][new Date(prodDate + 'T00:00:00').getDay()]}) 생산분
                </span>
              </span>
              <button onClick={() => setOpenWorker(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PRODUCTS.map(p => {
                const v = cell(p, openWorker);
                return (
                  <button key={p} onClick={() => openPad(`${openWorker} · ${p}`, v, nv => setCell(p, openWorker, nv))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: v > 0 ? '#eef2ff' : '#f8fafc', border: `2px solid ${v > 0 ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 30, fontWeight: 900, color: '#0f172a' }}>{p}</span>
                    <span style={{ fontSize: 34, fontWeight: 900, color: '#4f46e5' }}>{v.toLocaleString()}<span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 700, marginLeft: 6 }}>개</span></span>
                  </button>
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

      {/* ═══ 숫자 키패드 ═══ */}
      {pad && (
        <NumberPad title={pad.title} initial={pad.value} onConfirm={pad.onConfirm} onClose={() => setPad(null)} />
      )}
    </div>
  );
}
