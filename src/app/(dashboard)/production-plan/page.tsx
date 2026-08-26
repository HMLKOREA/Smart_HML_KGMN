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
  const [viewMode, setViewMode] = useState<'edit' | 'confirmed'>('edit'); // 입력 / 확정본
  const [showAllList, setShowAllList] = useState(false); // 하단 전체목록 펼침
  const [allSearch, setAllSearch] = useState('');        // 전체목록 검색
  // 지정일자 오더 추가 폼
  const [ordCust, setOrdCust] = useState('');
  const [ordCustName, setOrdCustName] = useState('');
  const [ordProd, setOrdProd] = useState('');
  const [ordDate, setOrdDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [ordQty, setOrdQty] = useState('');

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
      // 행 구성: 카고(품목 多)=이미 입력/추가된 것만, 탱크(정기)=고정물량 상위 자동표시
      const fixedKeys = fx[cat].map(f => f.key);
      const planKeys = Object.keys(pl);
      if (cat === 'cargo_truck') {
        setRowIds([...new Set(planKeys)]);
      } else {
        const extra = planKeys.filter(k => !fixedKeys.includes(k));
        setRowIds([...fixedKeys, ...extra]);
      }
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

  // 전주 실적 → 금주 계획 복사 (요일 위치 그대로)
  const copyPrevRow = (k: string) => {
    setPlan(prev => { const row = { ...(prev[k] || {}) }; days.forEach((d, i) => { row[d] = actual(k, prevDays[i]); }); return { ...prev, [k]: row }; });
    if (confirmed) setConfirmed(false);
  };
  const copyPrevAll = () => {
    setPlan(prev => {
      const next = { ...prev };
      for (const k of rowIds) { const row = { ...(next[k] || {}) }; days.forEach((d, i) => { row[d] = actual(k, prevDays[i]); }); next[k] = row; }
      return next;
    });
    if (confirmed) setConfirmed(false);
    toast.success('전주 실적을 이번주 계획으로 복사했습니다. (수정 가능)');
  };
  // 바 스케일 기준(전주/금주 중 최대 주간합)
  const maxBar = Math.max(1, ...rowIds.map(k => Math.max(prevRowTotal(k), rowTotal(k))));

  // 지정일자 오더 입력 — 거래처 선택 시 id·제품 초기화
  const onOrdCustChange = (name: string) => {
    setOrdCustName(name);
    const id = Object.keys(custMap).find(k => custMap[k] === name) || '';
    setOrdCust(id);
    setOrdProd(custProducts[id]?.[0]?.id || '');
  };
  const addDatedOrder = async () => {
    const qty = parseInt(ordQty || '0', 10) || 0;
    if (!ordCust) { toast.warning('거래처를 목록에서 선택하세요.'); return; }
    if (!ordProd) { toast.warning('제품을 선택하세요.'); return; }
    if (!ordDate) { toast.warning('날짜를 지정하세요.'); return; }
    if (qty <= 0) { toast.warning('대수를 입력하세요.'); return; }
    setSaving(true);
    try {
      const { data: ex } = await supabase.from('production_schedules').select('id')
        .eq('schedule_date', ordDate).eq('transport_category', cat).eq('customer_id', ordCust).eq('product_id', ordProd).maybeSingle();
      if (ex?.id) await supabase.from('production_schedules').update({ planned_trucks: qty, status: 'planned', updated_by: userName }).eq('id', ex.id);
      else await supabase.from('production_schedules').insert({ schedule_date: ordDate, transport_category: cat, sub_category: '', customer_id: ordCust, product_id: ordProd, planned_trucks: qty, status: 'planned', created_by: userName });
      const pn = custProducts[ordCust]?.find(p => p.id === ordProd)?.name || '';
      const wk = format(mondayOf(new Date(ordDate + 'T00:00:00')), 'yyyy-MM-dd');
      toast.success(`${ordDate} · ${custMap[ordCust]} ${pn ? `[${pn}] ` : ''}${qty}대 추가${wk === weekStart ? '' : ' → 해당 주로 이동'}`);
      setConfirmed(false);
      setOrdQty('');
      if (wk === weekStart) await load(); else setWeekStart(wk); // 다른 주면 effect가 재조회
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '오더 추가 실패');
    } finally { setSaving(false); }
  };

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
      if (status === 'confirmed') setViewMode('confirmed');
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
        {/* 입력 / 확정본 보기 전환 */}
        <div className="flex items-center rounded-lg border-2 border-slate-200 overflow-hidden">
          <button onClick={() => setViewMode('edit')} className={`px-3 py-1.5 text-sm font-bold ${viewMode === 'edit' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>✏️ 입력</button>
          <button onClick={() => confirmed && setViewMode('confirmed')} disabled={!confirmed} title={confirmed ? '확정된 물량만 보기' : '확정 후 보기'}
            className={`px-3 py-1.5 text-sm font-bold ${viewMode === 'confirmed' ? 'text-white' : confirmed ? 'bg-white text-slate-500' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}`} style={viewMode === 'confirmed' ? { background: catColor } : undefined}>📋 확정본</button>
        </div>
        {canEdit && viewMode === 'edit' && (
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <button onClick={copyPrevAll} className="px-3 py-1.5 rounded-lg bg-white border-2 border-amber-400 text-amber-600 text-sm font-bold" title="전주 실적을 이번주 계획으로 전체 복사">⧉ 전주복사(전체)</button>
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
            {/* 상단: 검색추가 + 지정일자 오더 (전체목록은 하단으로) */}
            {canEdit && viewMode === 'edit' && (
              <div className="mb-3 p-3 rounded-xl bg-white border border-gray-200 flex flex-col gap-2">
                {/* 거래처 검색 추가 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-black text-gray-600 w-20 shrink-0">➕ 추가</span>
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="거래처 검색 (예: 금산, K…) → 제품 자동 분리"
                    className="px-3 py-2 border-2 border-gray-300 rounded-lg text-base w-72" />
                  {searchHits.map(id => (
                    <button key={id} onClick={() => { addCustomer(id); setCustSearch(''); }} className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-sm font-bold text-indigo-700 hover:bg-indigo-100">
                      + {custMap[id]} <span className="text-[11px] text-indigo-400">{(custProducts[id]?.length || 0) > 1 ? `제품 ${custProducts[id].length}개` : ''}</span>
                    </button>
                  ))}
                  {q && searchHits.length === 0 && <span className="text-[13px] text-gray-400">일치하는 거래처 없음</span>}
                  {!q && top10.length > 0 && (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] text-gray-400 ml-1">자주:</span>
                      {top10.slice(0, 6).map(f => (
                        <button key={f.key} onClick={() => addKey(f.key)} className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-[13px] font-bold text-slate-600 hover:bg-slate-200">
                          + {custName(f.key)}·<span className="text-indigo-600">{prodNameOf(f.key) || '?'}</span>
                        </button>
                      ))}
                    </span>
                  )}
                </div>
                {/* 지정일자 오더 추가 (캘린더) */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
                  <span className="text-[13px] font-black text-indigo-600 w-20 shrink-0">📅 지정일자</span>
                  <input list="ord-custs" value={ordCustName} onChange={e => onOrdCustChange(e.target.value)} placeholder="거래처"
                    className="px-3 py-2 border-2 border-gray-300 rounded-lg text-base w-44" />
                  <datalist id="ord-custs">{Object.keys(custMap).map(id => <option key={id} value={custMap[id]} />)}</datalist>
                  <select value={ordProd} onChange={e => setOrdProd(e.target.value)} disabled={!ordCust}
                    className="px-2 py-2 border-2 border-gray-300 rounded-lg text-base font-bold text-indigo-700 bg-white max-w-[180px] disabled:bg-gray-50">
                    {(custProducts[ordCust] || []).length === 0 ? <option value="">제품 없음</option> : custProducts[ordCust].map(p => <option key={p.id} value={p.id}>{p.name}{p.silo ? ` · ${p.silo}` : ''}</option>)}
                  </select>
                  <input type="date" value={ordDate} onChange={e => setOrdDate(e.target.value)} style={{ colorScheme: 'light' }}
                    className="px-2 py-2 border-2 border-indigo-300 rounded-lg text-base font-bold text-slate-800" />
                  <input type="number" inputMode="numeric" min={1} value={ordQty} onChange={e => setOrdQty(e.target.value)} placeholder="대수"
                    className="w-20 px-2 py-2 border-2 border-gray-300 rounded-lg text-base font-black text-center" />
                  <button onClick={addDatedOrder} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">추가</button>
                  <span className="text-[12px] text-gray-400">예) 금산공영 9/20 3대 → 미리 배정</span>
                </div>
              </div>
            )}

            {viewMode === 'edit' ? (<>
            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#e2e8f0' }}>
                    <th className="sticky left-0 bg-slate-200 border-b border-gray-300" style={{ minWidth: 210 }} />
                    <th colSpan={5} className="px-1 py-1 text-center text-[13px] font-black text-slate-500 border-b border-gray-300">전주 실적 <span className="font-bold text-slate-400">{prevDays[0].slice(5)}~{prevDays[4].slice(5)}</span></th>
                    <th className="border-b border-gray-300 bg-amber-50" />
                    <th colSpan={5} className="px-1 py-1 text-center text-[13px] font-black border-b border-l-2 border-gray-300" style={{ color: catColor }}>이번주 계획 <span className="font-bold text-slate-400">{days[0].slice(5)}~{days[4].slice(5)}</span></th>
                    <th className="border-b border-gray-300 text-center text-[12px] font-black text-slate-400">전주▪금주</th>
                    {canEdit && <th className="border-b border-gray-300" />}
                  </tr>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th onClick={cycleSort} className="text-left px-2 py-1 text-sm font-black text-gray-700 border-b-2 border-gray-200 sticky left-0 bg-slate-100 cursor-pointer select-none" style={{ minWidth: 210 }}>
                      거래처 · 제품 <span style={{ color: catColor }}>{sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '⇅'}</span>
                    </th>
                    {prevDays.map(d => { const dt = new Date(d + 'T00:00:00');
                      return <th key={d} className="px-1 py-0.5 text-center text-[13px] font-bold border-b-2 border-gray-200 bg-slate-50 text-slate-400" style={{ minWidth: 52 }}>{DOW[dt.getDay()]}<br /><span className="text-[11px]">{d.slice(8)}</span></th>;
                    })}
                    <th className="px-0.5 py-0.5 text-center text-[11px] font-bold border-b-2 border-gray-200 bg-amber-50 text-amber-600" style={{ width: 36 }}>복사</th>
                    {days.map((d, i) => { const dt = new Date(d + 'T00:00:00'); const isT = d === todayStr;
                      return <th key={d} className={`px-1 py-0.5 text-center text-sm font-black border-b-2 border-gray-200 ${i === 0 ? 'border-l-2 border-l-gray-300' : ''}`} style={{ minWidth: 68, background: isT ? catColor : '#eef2f7', color: isT ? '#fff' : '#334155' }}>
                        {DOW[dt.getDay()]}<br /><span className="text-[12px] font-bold" style={{ color: isT ? 'rgba(255,255,255,.85)' : '#94a3b8' }}>{d.slice(8)}</span>
                      </th>;
                    })}
                    <th className="px-1 py-1 text-center text-sm font-black text-gray-700 border-b-2 border-gray-200" style={{ minWidth: 116 }}>합계·바</th>
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
                        <td className="px-0.5 text-center bg-amber-50/50">
                          <button onClick={() => copyPrevRow(k)} disabled={!canEdit || prevRowTotal(k) === 0} title="전주 실적을 이번주로 복사"
                            className="w-7 h-7 rounded-md text-amber-500 hover:bg-amber-100 disabled:text-gray-200 text-lg leading-none">⧉</button>
                        </td>
                        {days.map((d, i) => (
                          <td key={d} className={`px-1 py-0.5 text-center ${i === 0 ? 'border-l-2 border-l-gray-200' : ''}`} style={d === todayStr ? { background: catColor + '14' } : undefined}>
                            <input type="number" inputMode="numeric" value={cell(k, d) === 0 ? '' : cell(k, d)} placeholder="·" disabled={!canEdit}
                              onChange={e => { setCell(k, d, parseInt(e.target.value || '0', 10) || 0); if (confirmed) setConfirmed(false); }}
                              className="h-9 text-center text-lg font-black border-2 border-gray-200 rounded-lg focus:border-indigo-500 outline-none" style={{ width: 50 }} />
                          </td>
                        ))}
                        <td className="px-1.5 py-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 min-w-[56px]">
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-[3px]" title={`전주 ${prevRowTotal(k)}대`}><div className="h-full rounded-full bg-slate-300" style={{ width: `${Math.min(100, prevRowTotal(k) / maxBar * 100)}%` }} /></div>
                              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" title={`금주 ${rowTotal(k)}대`}><div className="h-full rounded-full" style={{ width: `${Math.min(100, rowTotal(k) / maxBar * 100)}%`, background: catColor }} /></div>
                            </div>
                            <span className="text-lg font-black tabular-nums w-6 text-right" style={{ color: catColor }}>{rowTotal(k) || ''}</span>
                          </div>
                        </td>
                        {canEdit && <td className="px-0.5 text-center"><button onClick={() => removeRow(k)} title="행 삭제" className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 text-base leading-none">×</button></td>}
                      </tr>
                    );
                  })}
                  {displayRows.length > 0 && (
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                      <td className="px-2 py-1.5 text-[15px] font-black text-gray-600 sticky left-0 bg-slate-50">일별 합계</td>
                      {prevDays.map(d => <td key={d} className="px-1 py-1.5 text-center text-[15px] font-black text-slate-400 tabular-nums bg-slate-50/60">{prevDayTotal(d) || '·'}</td>)}
                      <td className="bg-amber-50/50" />
                      {days.map((d, i) => <td key={d} className={`px-1 py-1.5 text-center text-xl font-black text-gray-700 tabular-nums ${i === 0 ? 'border-l-2 border-l-gray-200' : ''}`} style={d === todayStr ? { background: catColor + '14' } : undefined}>{dayTotal(d)}</td>)}
                      <td className="px-1.5 py-1.5 text-right text-2xl font-black tabular-nums" style={{ color: catColor }}>{grandTotal}</td>
                      {canEdit && <td />}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-gray-400 mt-2">한 거래처가 여러 제품을 내면 <b>제품별로 행이 분리</b>됩니다(같은 거래처끼리 묶여 정렬). <b className="text-amber-600">⧉</b> 전주복사로 초기물량을 세팅하고, 셀 수정 → <b>확정</b>하면 확정본 뷰로 전환됩니다. 대수 0은 저장 시 빠집니다.</p>

            {/* 하단: 전체 품목 목록(검색·추가) */}
            {canEdit && (
              <div className="mt-4">
                <button onClick={() => setShowAllList(v => !v)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-300 text-sm font-bold text-slate-600">
                  📋 전체 품목 목록 <span className="text-slate-400">({fixed[cat].length})</span> {showAllList ? '▲' : '▼'}
                </button>
                {showAllList && (
                  <div className="mt-2 p-3 rounded-xl bg-white border border-gray-200">
                    <input value={allSearch} onChange={e => setAllSearch(e.target.value)} placeholder="거래처·제품 검색"
                      className="px-3 py-2 border-2 border-gray-300 rounded-lg text-base w-72 mb-2" />
                    <div className="flex flex-wrap gap-1.5 max-h-72 overflow-auto">
                      {(() => {
                        const aq = allSearch.trim().toLowerCase();
                        const list = fixed[cat].filter(f => {
                          if (rowIds.includes(f.key)) return false;
                          if (!aq) return true;
                          return (custName(f.key) + ' ' + prodNameOf(f.key)).toLowerCase().includes(aq);
                        });
                        if (list.length === 0) return <span className="text-[13px] text-gray-300">추가할 품목이 없습니다.</span>;
                        return list.map(f => (
                          <button key={f.key} onClick={() => addKey(f.key)} className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200">
                            + {custName(f.key)}·<span className="text-indigo-600">{prodNameOf(f.key) || '?'}</span> <span className="text-gray-400">{f.avg}</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
            </>) : (
              /* ===== 확정본: 확정된 물량만 바 형식으로 ===== */
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs font-black text-white" style={{ background: catColor }}>확정본</span>
                    <span className="text-lg font-black text-gray-800">{weekLabel} · {CATS.find(c => c.key === cat)?.label}</span>
                    <span className="text-base font-bold text-gray-400">총 {grandTotal}대 · {activeCusts}곳 · {activeRows.length}품목</span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewMode('edit')} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-sm font-bold text-slate-600">✏️ 수정</button>
                      <button onClick={sendNotify} className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-bold">📢 통보</button>
                    </div>
                  )}
                </div>
                {activeRows.length === 0 ? (
                  <div className="text-center text-gray-400 py-10 text-sm">확정된 물량이 없습니다.</div>
                ) : (
                  <div className="flex flex-col">
                    {displayRows.filter(k => rowTotal(k) > 0).map((k, idx, arr) => {
                      const firstOfGroup = idx === 0 || custOf(arr[idx - 1]) !== custOf(k);
                      const s = siloOf(k); const t = rowTotal(k);
                      return (
                        <div key={k} className="flex items-center gap-3 py-1.5" style={{ borderTop: firstOfGroup ? '2px solid #e2e8f0' : '1px solid #f1f5f9' }}>
                          <div className="shrink-0" style={{ width: 210 }}>
                            {firstOfGroup
                              ? <div className="text-[15px] font-black text-gray-900 leading-tight truncate" title={custName(k)}>{custName(k)}</div>
                              : <div className="text-[11px] font-bold text-gray-300 leading-none truncate">↳ {custName(k)}</div>}
                            <div className="flex items-baseline gap-1.5 leading-tight">
                              <span className="text-[13px] font-black truncate" style={{ color: catColor, maxWidth: 130 }}>{prodNameOf(k) || '제품?'}</span>
                              {s && <span className="text-[10px] font-bold text-gray-400">사일로 {s}</span>}
                            </div>
                          </div>
                          <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden relative">
                            <div className="h-full rounded-lg flex items-center justify-end pr-2" style={{ width: `${Math.max(6, Math.min(100, t / maxBar * 100))}%`, background: catColor }}>
                              <span className="text-white text-xs font-black">{days.map(d => cell(k, d)).filter(v => v > 0).join('·')}</span>
                            </div>
                          </div>
                          <span className="shrink-0 text-2xl font-black tabular-nums w-14 text-right" style={{ color: catColor }}>{t}<span className="text-xs text-gray-400 font-bold">대</span></span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-3 py-2 mt-1" style={{ borderTop: '2px solid #cbd5e1' }}>
                      <div className="shrink-0 text-[15px] font-black text-gray-600" style={{ width: 210 }}>합계</div>
                      <div className="flex-1 flex gap-3 text-sm font-bold text-gray-500">
                        {days.map(d => { const dt = new Date(d + 'T00:00:00'); return <span key={d}>{DOW[dt.getDay()]} <b className="text-gray-800">{dayTotal(d)}</b></span>; })}
                      </div>
                      <span className="shrink-0 text-2xl font-black tabular-nums w-14 text-right" style={{ color: catColor }}>{grandTotal}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
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
