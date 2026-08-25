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

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => format(addDays(new Date(weekStart + 'T00:00:00'), i), 'yyyy-MM-dd')), [weekStart]);
  const weekLabel = `${days[0].slice(5)} ~ ${days[4].slice(5)}`;

  const [custMap, setCustMap] = useState<Record<string, string>>({}); // id→name
  const [fixed, setFixed] = useState<Record<CatKey, { id: string; name: string; avg: number }[]>>({ tank_lorry: [], cargo_truck: [] });
  const [rowIds, setRowIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<Record<string, Record<string, number>>>({}); // custId → date → trucks
  const [rowDbId, setRowDbId] = useState<Record<string, string>>({});           // `${date}|${custId}` → schedule id

  const cell = (c: string, d: string) => plan[c]?.[d] || 0;
  const setCell = (c: string, d: string, v: number) => setPlan(p => ({ ...p, [c]: { ...(p[c] || {}), [d]: Math.max(0, v) } }));
  const rowTotal = (c: string) => days.reduce((s, d) => s + cell(c, d), 0);
  const dayTotal = (d: string) => rowIds.reduce((s, c) => s + cell(c, d), 0);
  const grandTotal = rowIds.reduce((s, c) => s + rowTotal(c), 0);

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
      const agg: Record<CatKey, Record<string, { cnt: number; weeks: Set<string> }>> = { tank_lorry: {}, cargo_truck: {} };
      for (const r of all) {
        const cid = r.customer_id as string | null; const tt = r.transport_type as string | null; const sd = r.shipment_date as string;
        if (!cid || !tt || !TT_TO_CAT[tt]) continue;
        const ck = TT_TO_CAT[tt];
        const m = agg[ck][cid] || (agg[ck][cid] = { cnt: 0, weeks: new Set() });
        m.cnt++; m.weeks.add(sd.slice(0, 4) + isoWeek(sd));
      }
      const fx: Record<CatKey, { id: string; name: string; avg: number }[]> = { tank_lorry: [], cargo_truck: [] };
      (['tank_lorry', 'cargo_truck'] as CatKey[]).forEach(ck => {
        fx[ck] = Object.entries(agg[ck]).map(([id, v]) => ({ id, name: cm[id] || '(?)', avg: Math.round((v.cnt / Math.max(1, v.weeks.size)) * 10) / 10 }))
          .filter(x => cm[x.id]).sort((a, b) => b.avg - a.avg);
      });
      setFixed(fx);

      // 3) 이번주 계획 로드
      const { data: sch } = await supabase.from('production_schedules')
        .select('id, schedule_date, transport_category, customer_id, planned_trucks')
        .gte('schedule_date', days[0]).lte('schedule_date', days[4]).eq('transport_category', cat);
      const pl: Record<string, Record<string, number>> = {}; const dbid: Record<string, string> = {};
      (sch || []).forEach((s: Sched) => {
        if (!s.customer_id) return;
        (pl[s.customer_id] = pl[s.customer_id] || {})[s.schedule_date] = Number(s.planned_trucks) || 0;
        dbid[`${s.schedule_date}|${s.customer_id}`] = s.id;
      });
      setPlan(pl); setRowDbId(dbid);
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
        const per = Math.max(1, Math.round(f.avg / 5));
        next[f.id] = { ...(next[f.id] || {}) };
        for (const d of days) if (!next[f.id][d]) next[f.id][d] = per;
      }
      return next;
    });
    const ids = top.map(f => f.id);
    setRowIds(prev => [...new Set([...ids, ...prev])]);
    toast.success(`고정물량 상위 ${top.length}곳 반영 (수정 가능)`);
  };

  const addCustomer = (id: string) => {
    if (!id || rowIds.includes(id)) return;
    setRowIds(prev => [...prev, id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const c of rowIds) {
        for (const d of days) {
          const v = cell(c, d);
          const key = `${d}|${c}`;
          const existing = rowDbId[key];
          if (v > 0) {
            if (existing) await supabase.from('production_schedules').update({ planned_trucks: v, updated_by: userName }).eq('id', existing);
            else {
              const { data } = await supabase.from('production_schedules').insert({
                schedule_date: d, transport_category: cat, sub_category: '', customer_id: c, planned_trucks: v, status: 'planned', created_by: userName,
              }).select('id').single();
              if (data) rowDbId[`${d}|${c}`] = data.id;
            }
          } else if (existing) {
            await supabase.from('production_schedules').delete().eq('id', existing);
            delete rowDbId[key];
          }
        }
      }
      toast.success('주간 계획이 저장되었습니다.');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const confirmPlan = async () => {
    if (grandTotal === 0) { toast.warning('계획 대수가 없습니다.'); return; }
    if (!confirm(`${weekLabel} ${CATS.find(c => c.key === cat)?.label} 계획을 확정하고 팀즈로 알릴까요?`)) return;
    await save();
    // 팀즈 요약
    const catLabel = CATS.find(c => c.key === cat)?.label || '';
    const lines = [`📅 ${days[0]} ~ ${days[4]} · ${catLabel}`, `총 ${grandTotal}대 (${rowIds.filter(c => rowTotal(c) > 0).length}개 거래처)`, ''];
    for (const c of rowIds) { const t = rowTotal(c); if (t > 0) lines.push(`· ${custMap[c] || '?'} : ${days.map(d => cell(c, d)).join('/')} = ${t}대`); }
    lines.push('', `확정: ${userName || '-'}`);
    try {
      const res = await fetch('/api/notify/teams-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[경기광업] 주간 생산계획 확정 · ${catLabel}`, lines }),
      });
      const j = await res.json();
      if (j.success) toast.success('계획 확정 + 팀즈 알림 완료');
      else toast.warning(`계획 저장됨 · 팀즈 알림 실패: ${j.error || ''}`);
    } catch { toast.warning('계획 저장됨 · 팀즈 알림 실패'); }
  };

  if (!canView) return <AccessDenied />;

  const catColor = CATS.find(c => c.key === cat)?.color || '#2563eb';
  const notInGrid = Object.keys(custMap).filter(id => !rowIds.includes(id)).sort((a, b) => (custMap[a] || '').localeCompare(custMap[b] || ''));

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-7 rounded-sm" style={{ background: catColor }} />
          <h1 className="text-2xl font-extrabold text-gray-900">생산관리 <span className="text-base font-bold text-gray-400">주간 출하계획</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(format(addDays(new Date(weekStart + 'T00:00:00'), -7), 'yyyy-MM-dd'))}
            className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-300 font-bold text-base">◀ 전주</button>
          <span className="px-4 py-2.5 rounded-lg border-2 text-lg font-black text-slate-800" style={{ borderColor: catColor }}>{weekLabel}</span>
          <button onClick={() => setWeekStart(format(addDays(new Date(weekStart + 'T00:00:00'), 7), 'yyyy-MM-dd'))}
            className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-300 font-bold text-base">다음주 ▶</button>
          <button onClick={() => setWeekStart(format(mondayOf(new Date()), 'yyyy-MM-dd'))}
            className="px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-bold text-slate-500">이번주</button>
        </div>
      </div>

      {/* Tabs + tools */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex gap-2">
          {CATS.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className="px-6 py-3 rounded-xl text-lg font-black border-2 transition-colors"
              style={cat === c.key ? { background: c.color, color: '#fff', borderColor: c.color } : { background: '#fff', color: '#475569', borderColor: '#cbd5e1' }}>
              {c.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <span className="text-sm font-bold text-gray-500">고정물량 상위</span>
            <input type="number" value={fillN} onChange={e => setFillN(e.target.value)} className="w-16 px-2 py-2 border-2 border-gray-300 rounded-lg text-lg font-bold text-center" />
            <span className="text-sm font-bold text-gray-500">곳</span>
            <button onClick={fillFixed} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-base font-bold">채우기</button>
            <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-lg bg-slate-800 text-white text-base font-bold disabled:opacity-50">{saving ? '저장 중…' : '💾 저장'}</button>
            <button onClick={confirmPlan} className="px-5 py-2.5 rounded-lg text-white text-base font-bold" style={{ background: catColor }}>✅ 확정 + 팀즈알림</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 sm:px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
        ) : (
          <div className="max-w-[1200px] mx-auto">
            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-sm">
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th className="text-left p-3 text-base font-black text-gray-700 border-b-2 border-gray-200 sticky left-0 bg-slate-100" style={{ minWidth: 180 }}>거래처</th>
                    {days.map(d => {
                      const dt = new Date(d + 'T00:00:00');
                      return <th key={d} className="p-3 text-center text-base font-black text-gray-700 border-b-2 border-gray-200" style={{ minWidth: 92 }}>
                        {DOW[dt.getDay()]}<br /><span className="text-[13px] font-bold text-gray-400">{d.slice(5)}</span>
                      </th>;
                    })}
                    <th className="p-3 text-center text-base font-black text-gray-700 border-b-2 border-gray-200" style={{ minWidth: 80 }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {rowIds.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-10 text-base">‘고정물량 채우기’로 시작하거나 아래에서 거래처를 추가하세요.</td></tr>
                  ) : rowIds.map(c => {
                    const fx = fixed[cat].find(f => f.id === c);
                    return (
                      <tr key={c} className="border-b border-gray-100">
                        <td className="p-2 sticky left-0 bg-white">
                          <div className="text-lg font-black text-gray-900 leading-tight">{custMap[c] || '(알수없음)'}</div>
                          {fx && <div className="text-[12px] font-bold text-gray-400">평균 {fx.avg}대/주</div>}
                        </td>
                        {days.map(d => (
                          <td key={d} className="p-1.5 text-center">
                            <input type="number" inputMode="numeric" value={cell(c, d) === 0 ? '' : cell(c, d)} placeholder="0" disabled={!canEdit}
                              onChange={e => setCell(c, d, parseInt(e.target.value || '0', 10) || 0)}
                              className="w-16 h-12 text-center text-2xl font-black border-2 border-gray-200 rounded-xl focus:border-indigo-500 outline-none" />
                          </td>
                        ))}
                        <td className="p-2 text-center"><span className="text-2xl font-black tabular-nums" style={{ color: catColor }}>{rowTotal(c)}</span></td>
                      </tr>
                    );
                  })}
                  {rowIds.length > 0 && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td className="p-3 text-lg font-black text-gray-600 sticky left-0 bg-slate-50">일별 합계</td>
                      {days.map(d => <td key={d} className="p-2 text-center text-2xl font-black text-gray-700 tabular-nums">{dayTotal(d)}</td>)}
                      <td className="p-2 text-center text-3xl font-black tabular-nums" style={{ color: catColor }}>{grandTotal}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 거래처 추가 */}
            {canEdit && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-500">거래처 추가:</span>
                <select onChange={e => { addCustomer(e.target.value); e.currentTarget.selectedIndex = 0; }} className="px-3 py-2.5 border-2 border-gray-300 rounded-lg text-base max-w-[280px]">
                  <option value="">＋ 거래처 선택</option>
                  {notInGrid.map(id => <option key={id} value={id}>{custMap[id]}</option>)}
                </select>
                <span className="text-[13px] text-gray-400">· 대수를 0으로 두고 저장하면 그 칸은 계획에서 빠집니다.</span>
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
