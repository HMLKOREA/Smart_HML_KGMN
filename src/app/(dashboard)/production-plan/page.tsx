'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';
import AccessDenied from '@/components/ui/AccessDenied';
import { format, addDays } from 'date-fns';

// 운송구분: BCT(탱크) / CARGO(카고)
const CATS = [
  { key: 'tank_lorry', label: 'BCT (탱크)', tt: '탱크', color: '#059669' },
  { key: 'cargo_truck', label: 'CARGO (카고)', tt: '카고', color: '#2563eb' },
] as const;
type CatKey = typeof CATS[number]['key'];
const TT_TO_CAT: Record<string, CatKey> = { '탱크': 'tank_lorry', '카고': 'cargo_truck' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 행 = 거래처 × 제품 (복합키)
const RK = (cust: string, prod: string) => `${cust}::${prod}`;
const custOf = (k: string) => k.split('::')[0];
const prodIdOf = (k: string) => k.split('::')[1] || '';

interface Cust { id: string; name: string; }
interface Sched { id: string; schedule_date: string; transport_category: string; customer_id: string | null; product_id?: string | null; planned_trucks: number | null; status?: string; }

function mondayOf(d: Date) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(0, 0, 0, 0); return x; }

export default function ProductionPlanPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const role = useMemo(() => getSession()?.profile?.role, []);
  const userName = useMemo(() => getSession()?.profile?.name || '', []);
  const canView = role === 'admin' || role === 'monitor' || role === 'field';
  const canEdit = canView;

  const [weekStart, setWeekStart] = useState<string>(() => format(mondayOf(new Date()), 'yyyy-MM-dd'));
  const [cat, setCat] = useState<CatKey>('tank_lorry');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fillN, setFillN] = useState('10');
  const [sortDir, setSortDir] = useState<'none' | 'asc' | 'desc'>('none');
  const [confirmed, setConfirmed] = useState(false);
  const [custSearch, setCustSearch] = useState('');

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => format(addDays(new Date(weekStart + 'T00:00:00'), i), 'yyyy-MM-dd')), [weekStart]);
  const prevDays = useMemo(() => Array.from({ length: 5 }, (_, i) => format(addDays(new Date(weekStart + 'T00:00:00'), -7 + i), 'yyyy-MM-dd')), [weekStart]);
  const weekLabel = `${days[0].slice(5)} ~ ${days[4].slice(5)}`;

  const [custMap, setCustMap] = useState<Record<string, string>>({}); // id→name
  const [custProducts, setCustProducts] = useState<Record<string, { id: string; name: string; silo: string | null }[]>>({}); // 거래처→제품들
  const [prodNameMap, setProdNameMap] = useState<Record<string, string>>({}); // product_id→name
  const [fixed, setFixed] = useState<Record<CatKey, { key: string; avg: number }[]>>({ tank_lorry: [], cargo_truck: [] });
  const [dailyByKey, setDailyByKey] = useState<Record<CatKey, Record<string, Record<string, number>>>>({ tank_lorry: {}, cargo_truck: {} }); // cat→rowKey→date→대수
  const [rowIds, setRowIds] = useState<string[]>([]); // rowKey 배열
  const [plan, setPlan] = useState<Record<string, Record<string, number>>>({}); // rowKey → date → trucks
  const [rowDbId, setRowDbId] = useState<Record<string, string>>({});           // `${date}|${rowKey}` → schedule id

  const custName = (k: string) => custMap[custOf(k)] || '(알수없음)';
  const siloOf = (k: string) => { const c = custOf(k), p = prodIdOf(k); return custProducts[c]?.find(x => x.id === p)?.silo || ''; };
  const prodNameOf = (k: string) => { const p = prodIdOf(k); return prodNameMap[p] || custProducts[custOf(k)]?.find(x => x.id === p)?.name || ''; };

  const cell = (k: string, d: string) => plan[k]?.[d] || 0;
  const setCell = (k: string, d: string, v: number) => setPlan(p => ({ ...p, [k]: { ...(p[k] || {}), [d]: Math.max(0, v) } }));
  const rowTotal = (k: string) => days.reduce((s, d) => s + cell(k, d), 0);
  const dayTotal = (d: string) => rowIds.reduce((s, k) => s + cell(k, d), 0);
  const grandTotal = rowIds.reduce((s, k) => s + rowTotal(k), 0);
  // 전주 실적(실제 출하 대수)
  const actual = (k: string, d: string) => dailyByKey[cat]?.[k]?.[d] || 0;
  const prevRowTotal = (k: string) => prevDays.reduce((s, d) => s + actual(k, d), 0);
  const prevDayTotal = (d: string) => rowIds.reduce((s, k) => s + actual(k, d), 0);

  // 참고 실적: 지난주(전 주 월~금), 지난 3주 평균(주당)
  const ref = useMemo(() => {
    const d = dailyByKey[cat] || {};
    const base = new Date(weekStart + 'T00:00:00');
    const fmt2 = (n: number) => format(addDays(base, n), 'yyyy-MM-dd');
    const pwFrom = fmt2(-7), pwTo = fmt2(-3), t3From = fmt2(-21), t3To = fmt2(-1);
    const sumRange = (dates: Record<string, number>, from: string, to: string) => Object.entries(dates).reduce((s, [dt, c]) => (dt >= from && dt <= to ? s + c : s), 0);
    const out: Record<string, { lastWeek: number; avg3w: number }> = {};
    for (const k of Object.keys(d)) out[k] = { lastWeek: sumRange(d[k], pwFrom, pwTo), avg3w: Math.round(sumRange(d[k], t3From, t3To) / 3 * 10) / 10 };
    return out;
  }, [dailyByKey, cat, weekStart]);
  const refOf = (k: string) => ref[k] || { lastWeek: 0, avg3w: 0 };

  // 표시용 정렬 행 — 같은 거래처의 제품은 항상 인접(그룹)
  const displayRows = useMemo(() => {
    const keys = [...rowIds];
    if (sortDir === 'none') {
      const order: string[] = []; const seen = new Set<string>();
      for (const k of keys) { const c = custOf(k); if (!seen.has(c)) { seen.add(c); order.push(c); } }
      return keys.sort((a, b) => {
        const ca = order.indexOf(custOf(a)), cb = order.indexOf(custOf(b));
        if (ca !== cb) return ca - cb;
        return prodNameOf(a).localeCompare(prodNameOf(b), 'ko');
      });
    }
    return keys.sort((a, b) => {
      const cmp = (custMap[custOf(a)] || '').localeCompare(custMap[custOf(b)] || '', 'ko');
      if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
      return prodNameOf(a).localeCompare(prodNameOf(b), 'ko');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIds, sortDir, custMap, prodNameMap, custProducts]);

  // 상단 모니터링 합계
  const sumLastWeek = rowIds.reduce((s, k) => s + refOf(k).lastWeek, 0);
  const sumAvg3w = Math.round(rowIds.reduce((s, k) => s + refOf(k).avg3w, 0) * 10) / 10;
  const activeRows = rowIds.filter(k => rowTotal(k) > 0);
  const activeCusts = new Set(activeRows.map(custOf)).size;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) 거래처
      const { data: cs } = await supabase.from('customers').select('id, name').eq('is_active', true).order('name');
      const cm: Record<string, string> = {};
      (cs || []).forEach((c: Cust) => { cm[c.id] = c.name; });
      setCustMap(cm);

      // 거래처×제품 마스터(다품목 분리·사일로)
      const cpMap: Record<string, { id: string; name: string; silo: string | null }[]> = {};
      const pnm: Record<string, string> = {};
      { const PG2 = 1000; let p2 = 0, m2 = true;
        while (m2) {
          const { data } = await supabase.from('customer_products').select('customer_id, product_id, product_name, warehouse_code').eq('is_active', true).range(p2 * PG2, (p2 + 1) * PG2 - 1);
          const rows = (data || []) as { customer_id: string; product_id: string | null; product_name: string | null; warehouse_code: string | null }[];
          for (const r of rows) {
            if (!r.customer_id || !r.product_id) continue;
            if (r.product_name) pnm[r.product_id] = r.product_name;
            const a = cpMap[r.customer_id] || (cpMap[r.customer_id] = []);
            if (!a.some(x => x.id === r.product_id)) a.push({ id: r.product_id, name: r.product_name || '', silo: r.warehouse_code });
          }
          m2 = rows.length === PG2; p2++;
        }
      }
      setCustProducts(cpMap);

      // 2) 최근 90일 출하 → 거래처×제품별 주당 평균대수(고정물량) 집계
      const from = format(addDays(new Date(), -90), 'yyyy-MM-dd');
      const PAGE = 1000; let all: Record<string, unknown>[] = []; let pg = 0, more = true;
      while (more) {
        const { data } = await supabase.from('v_shipments').select('customer_id, product_id, product_name, transport_type, shipment_date')
          .gte('shipment_date', from).range(pg * PAGE, (pg + 1) * PAGE - 1);
        const rows = (data || []) as Record<string, unknown>[]; all = [...all, ...rows]; more = rows.length === PAGE; pg++;
      }
      const daily: Record<CatKey, Record<string, Record<string, number>>> = { tank_lorry: {}, cargo_truck: {} };
      for (const r of all) {
        const cid = r.customer_id as string | null; const pid = (r.product_id as string | null) || '';
        const tt = r.transport_type as string | null; const sd = r.shipment_date as string;
        const pn = r.product_name as string | null;
        if (!cid || !tt || !TT_TO_CAT[tt] || !cm[cid]) continue;
        if (pid && pn && !pnm[pid]) pnm[pid] = pn;
        const ck = TT_TO_CAT[tt]; const key = RK(cid, pid);
        const dd = daily[ck][key] || (daily[ck][key] = {});
        dd[sd] = (dd[sd] || 0) + 1;
      }
      setDailyByKey(daily);
      setProdNameMap(pnm);
      const fx: Record<CatKey, { key: string; avg: number }[]> = { tank_lorry: [], cargo_truck: [] };
      (['tank_lorry', 'cargo_truck'] as CatKey[]).forEach(ck => {
        fx[ck] = Object.entries(daily[ck]).map(([key, dates]) => {
          const cnt = Object.values(dates).reduce((s, v) => s + v, 0);
          const weeks = new Set(Object.keys(dates).map(d => d.slice(0, 4) + isoWeek(d))).size;
          return { key, avg: Math.round((cnt / Math.max(1, weeks)) * 10) / 10 };
        }).sort((a, b) => b.avg - a.avg);
      });
      setFixed(fx);

      // 3) 이번주 계획 로드 (거래처×제품별)
      const { data: sch } = await supabase.from('production_schedules')
        .select('id, schedule_date, transport_category, customer_id, product_id, planned_trucks, status')
        .gte('schedule_date', days[0]).lte('schedule_date', days[4]).eq('transport_category', cat);
      const pl: Record<string, Record<string, number>> = {}; const dbid: Record<string, string> = {};
      let anyConfirmed = false;
      (sch || []).forEach((s: Sched) => {
        if (!s.customer_id) return;
        const pid = s.product_id || cpMap[s.customer_id]?.[0]?.id || '';
        const key = RK(s.customer_id, pid);
        (pl[key] = pl[key] || {})[s.schedule_date] = Number(s.planned_trucks) || 0;
        dbid[`${s.schedule_date}|${key}`] = s.id;
        if (s.status === 'confirmed') anyConfirmed = true;
      });
      setPlan(pl); setRowDbId(dbid); setConfirmed(anyConfirmed);
      // 행 = 고정물량 순 + 계획에만 있는 행
      const fixedKeys = fx[cat].map(f => f.key);
      const extra = Object.keys(pl).filter(k => !fixedKeys.includes(k));
      setRowIds([...fixedKeys, ...extra]);
    } catch {
      toast.error('데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, days, cat, toast]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // 고정물량 상위 N 채우기 (주당평균/5 를 월~금에 배분)
  const fillFixed = () => {
    const n = Math.max(1, parseInt(fillN || '0', 10) || 0);
    const top = fixed[cat].slice(0, n);
    setPlan(prev => {
      const next = { ...prev };
      for (const f of top) {
        const weekly = (ref[f.key]?.avg3w || f.avg);
        const per = Math.max(1, Math.round(weekly / 5));
        next[f.key] = { ...(next[f.key] || {}) };
        for (const d of days) next[f.key][d] = per;
      }
      return next;
    });
    setRowIds(prev => [...new Set([...top.map(f => f.key), ...prev])]);
    setConfirmed(false);
    toast.success(`상위 ${top.length}개 품목 자동 반영 (3주 평균 기준 · 수정 가능)`);
  };

  // 거래처 추가 → 해당 거래처의 (이력 있는) 제품을 각각 행으로
  const addCustomer = (custId: string) => {
    if (!custId) return;
    const prods = custProducts[custId] || [];
    let keys: string[];
    if (prods.length) {
      const hist = prods.filter(p => dailyByKey[cat]?.[RK(custId, p.id)]).map(p => RK(custId, p.id));
      keys = hist.length ? hist : prods.map(p => RK(custId, p.id));
    } else {
      keys = [RK(custId, '')];
    }
    setRowIds(prev => [...new Set([...prev, ...keys])]);
  };
  const addKey = (key: string) => { if (key && !rowIds.includes(key)) setRowIds(prev => [...prev, key]); };
  const removeRow = (key: string) => {
    setRowIds(prev => prev.filter(x => x !== key));
    setPlan(prev => { const n = { ...prev }; delete n[key]; return n; });
  };
  const cycleSort = () => setSortDir(d => d === 'none' ? 'asc' : d === 'asc' ? 'desc' : 'none');

  const doSave = async (status: 'planned' | 'confirmed'): Promise<boolean> => {
    setSaving(true);
    try {
      for (const k of rowIds) {
        const c = custOf(k); const pid = prodIdOf(k) || null;
        for (const d of days) {
          const v = cell(k, d);
          const dk = `${d}|${k}`;
          const existing = rowDbId[dk];
          if (v > 0) {
            if (existing) await supabase.from('production_schedules').update({ planned_trucks: v, product_id: pid, status, updated_by: userName }).eq('id', existing);
            else {
              const { data } = await supabase.from('production_schedules').insert({
                schedule_date: d, transport_category: cat, sub_category: '', customer_id: c, product_id: pid, planned_trucks: v, status, created_by: userName,
              }).select('id').single();
              if (data) rowDbId[dk] = data.id;
            }
          } else if (existing) {
            await supabase.from('production_schedules').delete().eq('id', existing);
            delete rowDbId[dk];
          }
        }
      }
      setConfirmed(status === 'confirmed');
      toast.success(status === 'confirmed' ? '주간 계획이 확정되었습니다. 이제 통보할 수 있습니다.' : '저장되었습니다.');
      load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const confirmPlan = async () => {
    if (grandTotal === 0) { toast.warning('계획 대수가 없습니다.'); return; }
    if (!confirm(`${weekLabel} ${CATS.find(c => c.key === cat)?.label} 계획을 확정할까요? (확정 후 통보 가능)`)) return;
    await doSave('confirmed');
  };

  const sendNotify = async () => {
    if (!confirmed) { toast.warning('먼저 계획을 확정하세요.'); return; }
    const catLabel = CATS.find(c => c.key === cat)?.label || '';
    const lines = [`📅 ${days[0]} ~ ${days[4]} · ${catLabel}`, `총 ${grandTotal}대 (${activeCusts}개 거래처 · ${activeRows.length}개 품목)`, ''];
    for (const k of displayRows) { const t = rowTotal(k); if (t > 0) lines.push(`· ${custName(k)}${prodNameOf(k) ? ` [${prodNameOf(k)}]` : ''} : ${days.map(d => cell(k, d)).join('/')} = ${t}대`); }
    lines.push('', `확정: ${userName || '-'}`);
    try {
      const res = await fetch('/api/notify/teams-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[경기광업] 주간 생산계획 · ${catLabel}`, lines }),
      });
      const j = await res.json();
      if (j.success) toast.success('팀즈 통보 완료');
      else toast.warning(`팀즈 통보 실패: ${j.error || ''}`);
    } catch { toast.warning('팀즈 통보 실패'); }
  };

  if (!canView) return <AccessDenied />;

  const catColor = CATS.find(c => c.key === cat)?.color || '#2563eb';
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  // 상위10 빠른추가(그리드에 없는 품목만) + 검색
  const top10 = fixed[cat].filter(f => !rowIds.includes(f.key)).slice(0, 10);
  const q = custSearch.trim().toLowerCase();
  const searchHits = q ? Object.keys(custMap).filter(id => (custMap[id] || '').toLowerCase().includes(q)).slice(0, 12) : [];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 rounded-sm" style={{ background: catColor }} />
          <h1 className="text-xl font-extrabold text-gray-900">생산계획 <span className="text-sm font-bold text-gray-400">주간·제품별</span></h1>
          {confirmed && <span className="px-2.5 py-1 rounded-full text-xs font-black text-white" style={{ background: catColor }}>확정됨</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(format(addDays(new Date(weekStart + 'T00:00:00'), -7), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 font-bold text-sm">◀ 전주</button>
          <span className="px-3 py-2 rounded-lg border-2 text-base font-black text-slate-800" style={{ borderColor: catColor }}>{weekLabel}</span>
          <button onClick={() => setWeekStart(format(addDays(new Date(weekStart + 'T00:00:00'), 7), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 font-bold text-sm">다음주 ▶</button>
          <button onClick={() => setWeekStart(format(mondayOf(new Date()), 'yyyy-MM-dd'))} className="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-500">이번주</button>
        </div>
      </div>

      {/* Tabs + tools */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 bg-white border-b border-gray-200">
        <div className="flex gap-2">
          {CATS.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)} className="px-5 py-2 rounded-lg text-base font-black border-2 transition-colors"
              style={cat === c.key ? { background: c.color, color: '#fff', borderColor: c.color } : { background: '#fff', color: '#475569', borderColor: '#cbd5e1' }}>
              {c.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <span className="text-sm font-bold text-gray-500">상위</span>
            <input type="number" min={1} value={fillN} onChange={e => setFillN(e.target.value)} className="w-14 px-2 py-1.5 border-2 border-gray-300 rounded-lg text-base font-bold text-center" />
            <button onClick={fillFixed} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-bold">개 자동채우기</button>
            <span className="w-px h-6 bg-gray-200 mx-1" />
            <button onClick={() => doSave('planned')} disabled={saving} className="px-4 py-1.5 rounded-lg bg-slate-700 text-white text-sm font-bold disabled:opacity-50">{saving ? '저장 중…' : '💾 저장'}</button>
            <button onClick={confirmPlan} disabled={saving} className="px-4 py-1.5 rounded-lg text-white text-sm font-bold disabled:opacity-50" style={{ background: catColor }}>✅ 확정</button>
            <button onClick={sendNotify} disabled={!confirmed} title={confirmed ? '팀즈로 통보' : '확정 후 통보 가능'}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold ${confirmed ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>📢 통보</button>
          </div>
        )}
      </div>

      {/* 모니터링 요약 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 sm:px-6 py-2 bg-slate-50 border-b border-gray-200 text-sm">
        <span className="text-gray-500">이번주 계획 <b className="text-lg" style={{ color: catColor }}>{grandTotal}</b>대</span>
        <span className="text-gray-500">지난주 실적 <b className="text-lg text-gray-700">{sumLastWeek}</b>대</span>
        <span className="text-gray-500">3주평균 <b className="text-lg text-gray-700">{sumAvg3w}</b>대/주 <span className="text-gray-400">({Math.round(sumAvg3w / 5 * 10) / 10}/일)</span></span>
        <span className="text-gray-400">· 거래처 {activeCusts}곳 · 품목 {activeRows.length}건</span>
      </div>

      <div className="flex-1 overflow-auto px-3 sm:px-5 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
        ) : (
          <div className="max-w-[1240px] mx-auto">
            {/* 빠른추가: 상위10 품목 버튼 + 거래처 검색 */}
            {canEdit && (
              <div className="mb-3 p-3 rounded-xl bg-white border border-gray-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-gray-500">최근3개월 상위품목:</span>
                  {top10.length === 0 ? <span className="text-[13px] text-gray-300">모두 추가됨</span> : top10.map(f => (
                    <button key={f.key} onClick={() => addKey(f.key)} className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-200">
                      + {custName(f.key)} <span className="text-indigo-600">{prodNameOf(f.key) || '?'}</span> <span className="text-gray-400">{f.avg}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="거래처 검색 (예: K, 금호…) → 제품 자동 분리"
                    className="px-3 py-2 border-2 border-gray-300 rounded-lg text-base w-64" />
                  {searchHits.map(id => (
                    <button key={id} onClick={() => { addCustomer(id); setCustSearch(''); }} className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-sm font-bold text-indigo-700 hover:bg-indigo-100">
                      + {custMap[id]} <span className="text-[11px] text-indigo-400">{(custProducts[id]?.length || 0) > 1 ? `제품 ${custProducts[id].length}개` : ''}</span>
                    </button>
                  ))}
                  {q && searchHits.length === 0 && <span className="text-[13px] text-gray-400">일치하는 거래처 없음</span>}
                </div>
              </div>
            )}

            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#e2e8f0' }}>
                    <th className="sticky left-0 bg-slate-200 border-b border-gray-300" style={{ minWidth: 210 }} />
                    <th colSpan={5} className="px-1 py-1 text-center text-[13px] font-black text-slate-500 border-b border-r-2 border-gray-300">전주 실적 <span className="font-bold text-slate-400">{prevDays[0].slice(5)}~{prevDays[4].slice(5)}</span></th>
                    <th colSpan={5} className="px-1 py-1 text-center text-[13px] font-black border-b border-gray-300" style={{ color: catColor }}>이번주 계획 <span className="font-bold text-slate-400">{days[0].slice(5)}~{days[4].slice(5)}</span></th>
                    <th className="border-b border-gray-300" />
                    {canEdit && <th className="border-b border-gray-300" />}
                  </tr>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th onClick={cycleSort} className="text-left px-2 py-1 text-sm font-black text-gray-700 border-b-2 border-gray-200 sticky left-0 bg-slate-100 cursor-pointer select-none" style={{ minWidth: 210 }}>
                      거래처 · 제품 <span style={{ color: catColor }}>{sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '⇅'}</span>
                    </th>
                    {prevDays.map(d => { const dt = new Date(d + 'T00:00:00');
                      return <th key={d} className="px-1 py-0.5 text-center text-[13px] font-bold border-b-2 border-gray-200 bg-slate-50 text-slate-400" style={{ minWidth: 54 }}>{DOW[dt.getDay()]}<br /><span className="text-[11px]">{d.slice(8)}</span></th>;
                    })}
                    {days.map((d, i) => { const dt = new Date(d + 'T00:00:00'); const isT = d === todayStr;
                      return <th key={d} className={`px-1 py-0.5 text-center text-sm font-black border-b-2 border-gray-200 ${i === 0 ? 'border-l-2 border-l-gray-300' : ''}`} style={{ minWidth: 70, background: isT ? catColor : '#eef2f7', color: isT ? '#fff' : '#334155' }}>
                        {DOW[dt.getDay()]}<br /><span className="text-[12px] font-bold" style={{ color: isT ? 'rgba(255,255,255,.85)' : '#94a3b8' }}>{d.slice(8)}</span>
                      </th>;
                    })}
                    <th className="px-1 py-1 text-center text-sm font-black text-gray-700 border-b-2 border-gray-200" style={{ minWidth: 56 }}>합계</th>
                    {canEdit && <th className="px-1 border-b-2 border-gray-200" style={{ width: 30 }} />}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr><td colSpan={13} className="text-center text-gray-400 py-8 text-sm">‘자동채우기’ 또는 위 상위품목/검색으로 거래처·제품을 추가하세요.</td></tr>
                  ) : displayRows.map((k, idx) => {
                    const r = refOf(k);
                    const firstOfGroup = idx === 0 || custOf(displayRows[idx - 1]) !== custOf(k);
                    const s = siloOf(k);
                    return (
                      <tr key={k} className="hover:bg-slate-50/70" style={{ borderTop: firstOfGroup ? '2px solid #e2e8f0' : '1px solid #f1f5f9' }}>
                        <td className="px-2 py-0.5 sticky left-0 bg-white" style={{ minWidth: 210 }}>
                          {firstOfGroup
                            ? <div className="text-[14px] font-black text-gray-900 leading-tight truncate" style={{ maxWidth: 200 }} title={custName(k)}>{custName(k)}</div>
                            : <div className="text-[11px] font-bold text-gray-300 leading-none truncate" style={{ maxWidth: 200 }}>↳ {custName(k)}</div>}
                          <div className="flex items-baseline gap-1.5 leading-tight">
                            <span className="text-[13px] font-black truncate" style={{ color: catColor, maxWidth: 130 }}>{prodNameOf(k) || <span className="text-gray-300">제품?</span>}</span>
                            {s && <span className="text-[10px] font-bold text-gray-400">사일로 {s}</span>}
                            <span className="text-[10px] text-gray-300">전주 {prevRowTotal(k)}·평균 {r.avg3w}</span>
                          </div>
                        </td>
                        {prevDays.map(d => { const v = actual(k, d);
                          return <td key={d} className="px-1 py-0.5 text-center bg-slate-50/60"><span className="text-[15px] font-bold tabular-nums text-slate-400">{v || '·'}</span></td>;
                        })}
                        {days.map((d, i) => (
                          <td key={d} className={`px-1 py-0.5 text-center ${i === 0 ? 'border-l-2 border-l-gray-200' : ''}`} style={d === todayStr ? { background: catColor + '14' } : undefined}>
                            <input type="number" inputMode="numeric" value={cell(k, d) === 0 ? '' : cell(k, d)} placeholder="·" disabled={!canEdit}
                              onChange={e => { setCell(k, d, parseInt(e.target.value || '0', 10) || 0); if (confirmed) setConfirmed(false); }}
                              className="h-9 text-center text-lg font-black border-2 border-gray-200 rounded-lg focus:border-indigo-500 outline-none" style={{ width: 50 }} />
                          </td>
                        ))}
                        <td className="px-1 py-0.5 text-center"><span className="text-lg font-black tabular-nums" style={{ color: catColor }}>{rowTotal(k) || ''}</span></td>
                        {canEdit && <td className="px-0.5 text-center"><button onClick={() => removeRow(k)} title="행 삭제" className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 text-base leading-none">×</button></td>}
                      </tr>
                    );
                  })}
                  {displayRows.length > 0 && (
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                      <td className="px-2 py-1.5 text-[15px] font-black text-gray-600 sticky left-0 bg-slate-50">일별 합계</td>
                      {prevDays.map(d => <td key={d} className="px-1 py-1.5 text-center text-[15px] font-black text-slate-400 tabular-nums bg-slate-50/60">{prevDayTotal(d) || '·'}</td>)}
                      {days.map((d, i) => <td key={d} className={`px-1 py-1.5 text-center text-xl font-black text-gray-700 tabular-nums ${i === 0 ? 'border-l-2 border-l-gray-200' : ''}`} style={d === todayStr ? { background: catColor + '14' } : undefined}>{dayTotal(d)}</td>)}
                      <td className="px-1 py-1.5 text-center text-2xl font-black tabular-nums" style={{ color: catColor }}>{grandTotal}</td>
                      {canEdit && <td />}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-gray-400 mt-2">한 거래처가 여러 제품을 내면 <b>제품별로 행이 분리</b>됩니다(같은 거래처끼리 묶여 정렬). 셀에 대수 입력 → <b>저장</b> → <b>확정</b> → <b>통보</b>. 대수 0은 저장 시 빠집니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** ISO week number (문자열 'yyyy-mm-dd') */
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day + 3);
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return 'W' + String(week).padStart(2, '0');
}
