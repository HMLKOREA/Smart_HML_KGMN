'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, addDays, subDays } from 'date-fns';

interface Row {
  id: string; schedule_date: string; transport_category: string;
  customer_id: string | null; product_id: string | null;
  customer_name: string | null; product_name: string | null;
  planned_trucks: number | null; actual_trucks: number | null; status: string | null; notes: string | null;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CATS = [
  { key: 'tank_lorry', label: 'BCT (탱크)', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
  { key: 'cargo_truck', label: 'CARGO (카고)', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
];

export default function ProductionDailyTargets() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Row[]>([]);
  const [silo, setSilo] = useState<Record<string, string>>({}); // `${cust}::${prod}` → 사일로
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sch }, { data: cp }] = await Promise.all([
        supabase.from('v_production_schedules').select('*').eq('schedule_date', date).gt('planned_trucks', 0).order('planned_trucks', { ascending: false }),
        supabase.from('customer_products').select('customer_id, product_id, warehouse_code').eq('is_active', true),
      ]);
      setRows((sch || []) as Row[]);
      const sm: Record<string, string> = {};
      ((cp || []) as { customer_id: string | null; product_id: string | null; warehouse_code: string | null }[]).forEach(r => {
        if (r.customer_id && r.product_id && r.warehouse_code) sm[`${r.customer_id}::${r.product_id}`] = r.warehouse_code;
      });
      setSilo(sm);
    } finally { setLoading(false); }
  }, [supabase, date]);

  useEffect(() => { load(); }, [load]);

  const dt = new Date(date + 'T00:00:00');
  const byCat = (k: string) => rows.filter(r => r.transport_category === k);
  const catTotal = (k: string) => byCat(k).reduce((s, r) => s + (r.planned_trucks || 0), 0);
  const grand = rows.reduce((s, r) => s + (r.planned_trucks || 0), 0);
  const isToday = date === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="max-w-[1400px]">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">생산 목표</h1>
          {isToday && <span className="px-2.5 py-1 rounded-full bg-indigo-600 text-white text-xs font-black">오늘</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(format(subDays(dt, 1), 'yyyy-MM-dd'))} className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-300 font-bold text-base">◀ 전날</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2.5 border-2 border-indigo-300 rounded-lg text-lg font-bold text-slate-800" style={{ colorScheme: 'light' }} />
          <button onClick={() => setDate(format(addDays(dt, 1), 'yyyy-MM-dd'))} className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-300 font-bold text-base">다음날 ▶</button>
          <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))} className="px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-bold text-slate-500">오늘</button>
        </div>
      </div>

      {/* 요약 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="rounded-2xl px-6 py-4 text-white flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
          <span className="text-lg font-bold text-slate-300">{date.slice(5)} ({DOW[dt.getDay()]}) 생산목표</span>
          <span className="text-5xl font-black leading-none">{grand}<span className="text-xl text-slate-400 ml-1">대</span></span>
        </div>
        {CATS.map(c => (
          <div key={c.key} className="rounded-2xl px-5 py-4 border-2" style={{ background: c.bg, borderColor: c.border }}>
            <div className="text-sm font-bold" style={{ color: c.color }}>{c.label}</div>
            <div className="text-3xl font-black tabular-nums" style={{ color: c.color }}>{catTotal(c.key)}<span className="text-base ml-0.5">대</span></div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
      ) : grand === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
          <p className="text-lg">이 날짜의 생산계획이 없습니다.</p>
          <p className="text-sm text-gray-300">생산계획(운송관리)에서 등록·확정하면 여기에 목표가 나타납니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {CATS.map(c => {
            const list = byCat(c.key);
            if (list.length === 0) return null;
            return (
              <div key={c.key}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-3 h-6 rounded" style={{ background: c.color }} />
                  <h2 className="text-xl font-black" style={{ color: c.color }}>{c.label}</h2>
                  <span className="text-lg font-bold text-gray-400">{catTotal(c.key)}대 · {list.length}건</span>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))' }}>
                  {list.map(r => {
                    const s = r.customer_id && r.product_id ? silo[`${r.customer_id}::${r.product_id}`] : '';
                    const done = (r.actual_trucks || 0) >= (r.planned_trucks || 0) && (r.planned_trucks || 0) > 0;
                    return (
                      <div key={r.id} className="rounded-xl border-2 bg-white px-3 py-2 shadow-sm flex items-center justify-between gap-2" style={{ borderColor: c.border }}>
                        <div className="min-w-0">
                          <div className="text-[17px] font-black text-gray-900 leading-tight truncate" title={r.customer_name || ''}>{r.customer_name || '(거래처)'}</div>
                          <div className="flex items-baseline gap-1.5 leading-tight truncate">
                            <span className="text-[14px] font-bold truncate" style={{ color: c.color }}>{r.product_name || '-'}</span>
                            {s && <span className="text-[11px] font-bold text-slate-400">사일로 {s}</span>}
                          </div>
                          {r.notes && <div className="text-[11px] text-gray-400 truncate" title={r.notes}>📌 {r.notes}</div>}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-4xl font-black tabular-nums leading-none" style={{ color: c.color }}>{r.planned_trucks}</span>
                          <span className="text-sm text-gray-400 font-bold">대</span>
                          {done && <div className="text-[11px] font-bold text-emerald-500 leading-none">✅완료</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
