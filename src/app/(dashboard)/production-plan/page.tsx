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

interface Cust { id: string; name: string; }
interface Sched { id: string; schedule_date: string; transport_category: string; customer_id: string | null; planned_trucks: number | null; }

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
  const [confirmed, setConfirmed] = useState(false); // 이번주+구분 확정 여부
  const [custSearch, setCustSearch] = useState('');   // 거래처 검색(찾아서 넣기)

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => format(addDays(new Date(weekStart + 'T00:00:00'), i), 'yyyy-MM-dd')), [weekStart]);
  const weekLabel = `${days[0].slice(5)} ~ ${days[4].slice(5)}`;

  const [custMap, setCustMap] = useState<Record<string, string>>({}); // id→name
  const [fixed, setFixed] = useState<Record<CatKey, { id: string; name: string; avg: number }[]>>({ tank_lorry: [], cargo_truck: [] });
  const [dailyByCust, setDailyByCust] = useState<Record<CatKey, Record<string, Record<string, number>>>>({ tank_lorry: {}, cargo_truck: {} }); // cat→cust→date→대수
  const [rowIds, setRowIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<Record<string, Record<string, number>>>({}); // custId → date → trucks
  const [rowDbId, setRowDbId] = useState<Record<string, string>>({});           // `${date}|${custId}` → schedule id

  const cell = (c: string, d: string) => plan[c]?.[d] || 0;
  const setCell = (c: string, d: string, v: number) => setPlan(p => ({ ...p, [c]: { ...(p[c] || {}), [d]: Math.max(0, v) } }));
  const rowTotal = (c: string) => days.reduce((s, d) => s + cell(c, d), 0);
  const dayTotal = (d: string) => rowIds.reduce((s, c) => s + cell(c, d), 0);
  const grandTotal = rowIds.reduce((s, c) => s + rowTotal(c), 0);

  // 참고 실적: 지난주(전 주 월~금), 지난 3주 평균(주당)
  const ref = useMemo(() => {
    const d = dailyByCust[cat] || {};
    const base = new Date(weekStart + 'T00:00:00');
    const fmt2 = (n: number) => format(addDays(base, n), 'yyyy-MM-dd');
    const pwFrom = fmt2(-7), pwTo = fmt2(-3), t3From = fmt2(-21), t3To = fmt2(-1);
    const sumRange = (dates: Record<string, number>, from: string, to: string) => Object.entries(dates).reduce((s, [dt, c]) => (dt >= from && dt <= to ? s + c : s), 0);
    const out: Record<string, { lastWeek: number; avg3w: number }> = {};
    for (const cid of Object.keys(d)) out[cid] = { lastWeek: sumRange(d[cid], pwFrom, pwTo), avg3w: Math.round(sumRange(d[cid], t3From, t3To) / 3 * 10) / 10 };
    return out;
  }, [dailyByCust, cat, weekStart]);
  const refOf = (c: string) => ref[c] || { lastWeek: 0, avg3w: 0 };

  // 표시용 정렬 행
  const displayRows = useMemo(() => {
    if (sortDir === 'none') return rowIds;
    const arr = [...rowIds].sort((a, b) => (custMap[a] || '').localeCompare(custMap[b] || '', 'ko'));
    return sortDir === 'desc' ? arr.reverse() : arr;
  }, [rowIds, sortDir, custMap]);

  // 상단 모니터링 합계
  const sumLastWeek = rowIds.reduce((s, c) => s + refOf(c).lastWeek, 0);
  const sumAvg3w = Math.round(rowIds.reduce((s, c) => s + refOf(c).avg3w, 0) * 10) / 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) 거래처
      const { data: cs } = await supabase.from('customers').select('id, name').eq('is_active', true).order('name');
      const cm: Record<string, string> = {};
      (cs || []).forEach((c: Cust) => { cm[c.id] = c.name; });
      setCustMap(cm);

      // 2) 최근 90일 출하 → 고정물량(주당 평균 대수) 집계
      const from = format(addDays(new Date(), -90), 'yyyy-MM-dd');
      const PAGE = 1000; let all: Record<string, unknown>[] = []; let pg = 0, more = true;
      while (more) {
        const { data } = await supabase.from('v_shipments').select('customer_id, transport_type, shipment_date')
          .gte('shipment_date', from).range(pg * PAGE, (pg + 1) * PAGE - 1);
        const rows = (data || []) as Record<string, unknown>[]; all = [...all, ...rows]; more = rows.length === PAGE; pg++;
      }
      const daily: Record<CatKey, Record<string, Record<string, number>>> = { tank_lorry: {}, cargo_truck: {} };
      for (const r of all) {
        const cid = r.customer_id as string | null; const tt = r.transport_type as string | null; const sd = r.shipment_date as string;
        if (!cid || !tt || !TT_TO_CAT[tt] || !cm[cid]) continue;
        const ck = TT_TO_CAT[tt];
        const dd = daily[ck][cid] || (daily[ck][cid] = {});
        dd[sd] = (dd[sd] || 0) + 1;
      }
      setDailyByCust(daily);
      const fx: Record<CatKey, { id: string; name: string; avg: number }[]> = { tank_lorry: [], cargo_truck: [] };
      (['tank_lorry', 'cargo_truck'] as CatKey[]).forEach(ck => {
        fx[ck] = Object.entries(daily[ck]).map(([id, dates]) => {
          const cnt = Object.values(dates).reduce((s, v) => s + v, 0);
          const weeks = new Set(Object.keys(dates).map(d => d.slice(0, 4) + isoWeek(d))).size;
          return { id, name: cm[id] || '(?)', avg: Math.round((cnt / Math.max(1, weeks)) * 10) / 10 };
        }).sort((a, b) => b.avg - a.avg);
      });
      setFixed(fx);

      // 3) 이번주 계획 로드
      const { data: sch } = await supabase.from('production_schedules')
        .select('id, schedule_date, transport_category, customer_id, planned_trucks, status')
        .gte('schedule_date', days[0]).lte('schedule_date', days[4]).eq('transport_category', cat);
      const pl: Record<string, Record<string, number>> = {}; const dbid: Record<string, string> = {};
      let anyConfirmed = false;
      (sch || []).forEach((s: Sched & { status?: string }) => {
        if (!s.customer_id) return;
        (pl[s.customer_id] = pl[s.customer_id] || {})[s.schedule_date] = Number(s.planned_trucks) || 0;
        dbid[`${s.schedule_date}|${s.customer_id}`] = s.id;
        if (s.status === 'confirmed') anyConfirmed = true;
      });
      setPlan(pl); setRowDbId(dbid); setConfirmed(anyConfirmed);
      // 행 = 고정물량 순 + 계획에만 있는 거래처
      const fixedIds = fx[cat].map(f => f.id);
      const extra = Object.keys(pl).filter(id => !fixedIds.includes(id));
      setRowIds([...fixedIds, ...extra]);
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
        const weekly = (ref[f.id]?.avg3w || f.avg); // 최근 3주 평균 우선
        const per = Math.max(1, Math.round(weekly / 5));
        next[f.id] = { ...(next[f.id] || {}) };
        for (const d of days) next[f.id][d] = per; // 자동 채움(덮어쓰기) → 이후 수정
      }
      return next;
    });
    setRowIds(prev => [...new Set([...top.map(f => f.id), ...prev])]);
    setConfirmed(false);
    toast.success(`고정물량 상위 ${top.length}곳 자동 반영 (3주 평균 기준 · 수정 가능)`);
  };

  const addCustomer = (id: string) => {
    if (!id || rowIds.includes(id)) return;
    setRowIds(prev => [...prev, id]);
  };
  const removeCustomer = (id: string) => {
    setRowIds(prev => prev.filter(x => x !== id));
    setPlan(prev => { const n = { ...prev }; delete n[id]; return n; });
  };
  const cycleSort = () => setSortDir(d => d === 'none' ? 'asc' : d === 'asc' ? 'desc' : 'none');

  const doSave = async (status: 'planned' | 'confirmed'): Promise<boolean> => {
    setSaving(true);
    try {
      for (const c of rowIds) {
        for (const d of days) {
          const v = cell(c, d);
          const key = `${d}|${c}`;
          const existing = rowDbId[key];
          if (v > 0) {
            if (existing) await supabase.from('production_schedules').update({ planned_trucks: v, status, updated_by: userName }).eq('id', existing);
            else {
              const { data } = await supabase.from('production_schedules').insert({
                schedule_date: d, transport_category: cat, sub_category: '', customer_id: c, planned_trucks: v, status, created_by: userName,
              }).select('id').single();
              if (data) rowDbId[`${d}|${c}`] = data.id;
            }
          } else if (existing) {
            await supabase.from('production_schedules').delete().eq('id', existing);
            delete rowDbId[key];
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
    const lines = [`📅 ${days[0]} ~ ${days[4]} · ${catLabel}`, `총 ${grandTotal}대 (${rowIds.filter(c => rowTotal(c) > 0).length}개 거래처)`, ''];
    for (const c of rowIds) { const t = rowTotal(c); if (t > 0) lines.push(`· ${custMap[c] || '?'} : ${days.map(d => cell(c, d)).join('/')} = ${t}대`); }
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
  // 상위10 빠른추가(그리드에 없는 것만) + 검색 결과
  const top10 = fixed[cat].filter(f => !rowIds.includes(f.id)).slice(0, 10);
  const q = custSearch.trim().toLowerCase();
  const searchHits = q ? Object.keys(custMap).filter(id => !rowIds.includes(id) && (custMap[id] || '').toLowerCase().includes(q)).slice(0, 12) : [];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 rounded-sm" style={{ background: catColor }} />
          <h1 className="text-xl font-extrabold text-gray-900">생산관리 <span className="text-sm font-bold text-gray-400">주간 출하계획</span></h1>
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
            <span className="text-sm font-bold text-gray-500">고정물량 상위</span>
            <input type="number" min={1} value={fillN} onChange={e => setFillN(e.target.value)} className="w-14 px-2 py-1.5 border-2 border-gray-300 rounded-lg text-base font-bold text-center" />
            <button onClick={fillFixed} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-bold">곳 자동채우기</button>
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
        <span className="text-gray-400">· 거래처 {rowIds.filter(c => rowTotal(c) > 0).length}곳</span>
      </div>

      <div className="flex-1 overflow-auto px-3 sm:px-5 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
        ) : (
          <div className="max-w-[1240px] mx-auto">
            {/* 빠른추가: 상위10 버튼 + 검색 */}
            {canEdit && (
              <div className="mb-3 p-3 rounded-xl bg-white border border-gray-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-gray-500">최근3개월 상위:</span>
                  {top10.length === 0 ? <span className="text-[13px] text-gray-300">모두 추가됨</span> : top10.map(f => (
                    <button key={f.id} onClick={() => addCustomer(f.id)} className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-200">
                      + {custMap[f.id]} <span className="text-gray-400">{f.avg}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="거래처 검색 (예: K, 금호…)"
                    className="px-3 py-2 border-2 border-gray-300 rounded-lg text-base w-52" />
                  {searchHits.map(id => (
                    <button key={id} onClick={() => { addCustomer(id); setCustSearch(''); }} className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-sm font-bold text-indigo-700 hover:bg-indigo-100">
                      + {custMap[id]}
                    </button>
                  ))}
                  {q && searchHits.length === 0 && <span className="text-[13px] text-gray-400">일치하는 거래처 없음(또는 이미 추가됨)</span>}
                </div>
              </div>
            )}

            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th onClick={cycleSort} className="text-left px-2 py-2 text-sm font-black text-gray-700 border-b-2 border-gray-200 sticky left-0 bg-slate-100 cursor-pointer select-none" style={{ minWidth: 168 }}>
                      거래처 <span style={{ color: catColor }}>{sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '⇅'}</span>
                    </th>
                    {days.map(d => {
                      const dt = new Date(d + 'T00:00:00'); const isT = d === todayStr;
                      return <th key={d} className="px-1 py-1.5 text-center text-sm font-black border-b-2 border-gray-200" style={{ minWidth: 80, background: isT ? catColor : '#eef2f7', color: isT ? '#fff' : '#334155' }}>
                        {DOW[dt.getDay()]}<br /><span className="text-[12px] font-bold" style={{ color: isT ? 'rgba(255,255,255,.85)' : '#94a3b8' }}>{d.slice(5)}</span>
                      </th>;
                    })}
                    <th className="px-1 py-2 text-center text-sm font-black text-gray-700 border-b-2 border-gray-200" style={{ minWidth: 64 }}>합계</th>
                    {canEdit && <th className="px-1 border-b-2 border-gray-200" style={{ width: 34 }} />}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-400 py-8 text-sm">‘자동채우기’ 또는 위 상위/검색으로 거래처를 추가하세요.</td></tr>
                  ) : displayRows.map(c => {
                    const r = refOf(c);
                    return (
                      <tr key={c} className="border-b border-gray-100 hover:bg-slate-50/70">
                        <td className="px-2 py-1 sticky left-0 bg-white">
                          <div className="text-[15px] font-bold text-gray-900 leading-tight truncate" style={{ maxWidth: 168 }} title={custMap[c] || ''}>{custMap[c] || '(알수없음)'}</div>
                          <div className="text-[11px] text-gray-400 leading-tight">지난주 {r.lastWeek} · 3주평균 {r.avg3w}/주</div>
                        </td>
                        {days.map(d => (
                          <td key={d} className="px-1 py-1 text-center" style={d === todayStr ? { background: catColor + '14' } : undefined}>
                            <input type="number" inputMode="numeric" value={cell(c, d) === 0 ? '' : cell(c, d)} placeholder="·" disabled={!canEdit}
                              onChange={e => { setCell(c, d, parseInt(e.target.value || '0', 10) || 0); if (confirmed) setConfirmed(false); }}
                              className="w-14 h-10 text-center text-xl font-black border-2 border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
                          </td>
                        ))}
                        <td className="px-1 py-1 text-center"><span className="text-xl font-black tabular-nums" style={{ color: catColor }}>{rowTotal(c) || ''}</span></td>
                        {canEdit && <td className="px-0.5 text-center"><button onClick={() => removeCustomer(c)} title="행 삭제" className="w-7 h-7 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none">×</button></td>}
                      </tr>
                    );
                  })}
                  {displayRows.length > 0 && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td className="px-2 py-2 text-[15px] font-black text-gray-600 sticky left-0 bg-slate-50">일별 합계</td>
                      {days.map(d => <td key={d} className="px-1 py-2 text-center text-xl font-black text-gray-700 tabular-nums" style={d === todayStr ? { background: catColor + '14' } : undefined}>{dayTotal(d)}</td>)}
                      <td className="px-1 py-2 text-center text-2xl font-black tabular-nums" style={{ color: catColor }}>{grandTotal}</td>
                      {canEdit && <td />}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-gray-400 mt-2">셀에 대수를 입력 → <b>저장</b>(임시) → <b>확정</b>(고정) → <b>통보</b>(팀즈, 확정 후 활성). 대수 0은 저장 시 계획에서 빠집니다.</p>
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
