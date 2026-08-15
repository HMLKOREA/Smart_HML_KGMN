'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';

interface Silo {
  no: number; product: string; max: number; table: string; field: number;
  weight: number | null; pct: number | null; measuredAt: string | null; stale: boolean;
}
interface SiloResp { source: string; warn: string | null; staleHours: number; silos: Silo[]; fetchedAt: string; }
interface TonBag { id: string; silo_no: number; product: string | null; bag_count: number; ton_per_bag: number; total_ton: number; memo: string | null; created_at: string; }

const fmt = (n: number | null | undefined) => n == null ? '-' : n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

function fillColor(pct: number | null): string {
  if (pct == null) return '#94a3b8';
  if (pct >= 90) return '#dc2626';
  if (pct >= 70) return '#f59e0b';
  if (pct >= 30) return '#16a34a';
  return '#0ea5e9';
}

export default function SiloPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const canEdit = useMemo(() => {
    const r = getSession()?.profile?.role;
    return r === 'admin' || r === 'field' || r === 'monitor';
  }, []);

  const [data, setData] = useState<SiloResp | null>(null);
  const [bags, setBags] = useState<TonBag[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalSilo, setModalSilo] = useState<Silo | null>(null);

  const loadBulk = useCallback(async () => {
    try {
      const res = await fetch('/api/silo', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
  }, []);
  const loadBags = useCallback(async () => {
    const { data } = await supabase.from('silo_tonbags').select('*').order('created_at', { ascending: false });
    setBags((data || []) as TonBag[]);
  }, [supabase]);

  useEffect(() => {
    Promise.all([loadBulk(), loadBags()]).finally(() => setLoading(false));
    // 벤더 데이터는 1분 갱신이지만 상시 확인이 아니므로 5분 간격 + 수동 새로고침 (서버 부담 최소화)
    const t = setInterval(loadBulk, 5 * 60_000);
    return () => clearInterval(t);
  }, [loadBulk, loadBags]);

  const bagsBySilo = useMemo(() => {
    const m = new Map<number, TonBag[]>();
    for (const b of bags) { const a = m.get(b.silo_no) || []; a.push(b); m.set(b.silo_no, a); }
    return m;
  }, [bags]);
  const bagTotal = (no: number) => (bagsBySilo.get(no) || []).reduce((s, b) => s + Number(b.total_ton || 0), 0);

  // 전체 총재고 (담당자 확인용): 벌크 + 톤백(1~8번)
  const totals = useMemo(() => {
    const silos = data?.silos || [];
    let bulk = 0, bag = 0;
    for (const s of silos) { bulk += s.weight ?? 0; if (s.no <= 8) bag += bagTotal(s.no); }
    return { bulk, bag, total: bulk + bag };
  }, [data, bagsBySilo]); // eslint-disable-line react-hooks/exhaustive-deps

  // 분석 대시보드용 통계
  const stats = useMemo(() => {
    const silos = data?.silos || [];
    const pcts = silos.map(s => s.pct).filter((p): p is number => p != null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    const dist = { full: 0, warn: 0, mid: 0, low: 0 };
    for (const p of pcts) {
      if (p >= 90) dist.full++; else if (p >= 70) dist.warn++; else if (p >= 30) dist.mid++; else dist.low++;
    }
    const active = silos.filter(s => s.weight != null && !s.stale).length;
    const capacity = silos.reduce((s, x) => s + (x.max || 0), 0);
    return { avg, dist, active, count: silos.length, capacity };
  }, [data]);

  const srcLabel: Record<string, { t: string; c: string; bg: string }> = {
    api: { t: '실데이터 · 벤더 API', c: '#15803d', bg: '#e7f6ec' },
    db: { t: '실데이터 · SQL', c: '#15803d', bg: '#e7f6ec' },
    dummy: { t: '샘플 데이터 (미연동)', c: '#b45309', bg: '#fdf2e0' },
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 sm:px-8 py-5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3.5">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">사일로 현황</h1>
          {data && (
            <span style={{ color: srcLabel[data.source]?.c, background: srcLabel[data.source]?.bg }}
              className="text-[15px] font-bold px-3.5 py-1.5 rounded-full">
              {srcLabel[data.source]?.t || data.source}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[16px] text-gray-500">
          {data && (
            <span className="font-semibold text-gray-600">
              동기화 일시(조회) ·{' '}
              <span className="tabular-nums">{new Date(data.fetchedAt).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </span>
          )}
          <button onClick={loadBulk} className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold text-[16px] hover:bg-blue-700 transition-colors">새로고침</button>
        </div>
      </div>

      {data?.source === 'dummy' && (
        <div className="mx-6 sm:mx-8 mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-[15px] text-amber-800">
          ⚠️ 사일로 <b>벌크 재고</b>는 아직 실데이터 미연동(<b>샘플값</b>) — 벤더 API/계정 확보 시 자동 전환됩니다. <b>톤백 저장은 지금부터 실제 기록·관리</b>됩니다.
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 sm:px-8 py-6">
        {loading && !data ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
        ) : data ? (
          <div className="max-w-[1440px] mx-auto">

            {/* ═══ 분석 대시보드 ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.15fr] gap-5 mb-8">
              {/* KPI 4종 */}
              <div className="grid grid-cols-2 gap-4">
                {/* 총 재고 (강조) */}
                <div className="col-span-2 rounded-2xl px-6 py-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📦</span>
                    <div>
                      <div className="text-[15px] font-bold text-slate-300">전체 총재고</div>
                      <div className="text-[13px] text-slate-500">벌크 {fmt(totals.bulk)} · 톤백 {fmt(totals.bag)} 톤</div>
                    </div>
                  </div>
                  <div className="text-5xl font-black text-white tabular-nums leading-none">{fmt(totals.total)}<span className="text-xl text-slate-400 font-bold ml-1">톤</span></div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                  <div className="text-[14px] font-semibold text-gray-500">평균 충전율</div>
                  <div className="text-4xl font-black tabular-nums mt-1" style={{ color: fillColor(stats.avg) }}>{stats.avg}<span className="text-lg text-gray-400">%</span></div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                  <div className="text-[14px] font-semibold text-gray-500">가동 사일로</div>
                  <div className="text-4xl font-black text-gray-900 tabular-nums mt-1">{stats.active}<span className="text-lg text-gray-400"> / {stats.count}기</span></div>
                </div>
              </div>

              {/* 사일로별 충전율 개요 */}
              <div className="bg-white rounded-2xl border border-gray-200 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[17px] font-bold text-gray-800">사일로별 충전율</h3>
                  <div className="flex items-center gap-3 text-[12px] font-semibold text-gray-400">
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#dc2626' }} />포화 {stats.dist.full}</span>
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#f59e0b' }} />주의 {stats.dist.warn}</span>
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#16a34a' }} />보통 {stats.dist.mid}</span>
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#0ea5e9' }} />여유 {stats.dist.low}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {data.silos.map(s => (
                    <div key={s.no} className="flex items-center gap-3">
                      <span className="text-[13px] font-bold text-gray-400 w-6 text-right tabular-nums">#{s.no}</span>
                      <span className="text-[14px] font-bold text-gray-700 w-24 truncate">{s.product}</span>
                      <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${s.pct ?? 0}%`, background: fillColor(s.pct), opacity: s.stale ? 0.45 : 1 }} />
                      </div>
                      <span className="text-[14px] font-black tabular-nums w-12 text-right" style={{ color: fillColor(s.pct) }}>{s.pct == null ? '-' : `${s.pct}%`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ═══ 사일로 카드 (고정폭 · 심플) ═══ */}
            <div className="grid gap-6 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fill, 268px)' }}>
              {data.silos.map(s => {
                const color = fillColor(s.pct);
                const h = s.pct == null ? 0 : s.pct;
                const hasTonbag = s.no <= 8;               // 9·10번 사일로는 톤백 미사용
                const bt = hasTonbag ? bagTotal(s.no) : 0;
                const combined = (s.weight ?? 0) + bt;
                return (
                  <div key={s.no} className="bg-white rounded-3xl border border-gray-200 shadow-[0_2px_16px_rgba(15,23,42,0.06)] p-6 flex flex-col items-center">
                    <div className="flex items-baseline gap-2.5 mb-4">
                      <span className="text-[18px] font-bold text-gray-300">#{s.no}</span>
                      <span className="text-[32px] font-black text-gray-900 tracking-tight leading-none">{s.product}</span>
                    </div>

                    {/* 게이지 (탱크) */}
                    <div className="relative w-32 h-56 rounded-b-xl rounded-t-3xl border-[3px] border-gray-300 bg-gray-50 overflow-hidden shadow-inner">
                      <div className="absolute bottom-0 left-0 right-0 transition-[height] duration-700 ease-out"
                        style={{ height: `${h}%`, background: `linear-gradient(180deg, ${color}, ${color}cc)`, opacity: s.stale ? 0.45 : 1 }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[44px] font-black leading-none" style={{ color: h > 52 ? '#fff' : '#0f172a', textShadow: h > 52 ? '0 2px 6px rgba(0,0,0,.4)' : 'none' }}>
                          {s.pct == null ? '-' : `${s.pct}%`}
                        </span>
                      </div>
                    </div>

                    {/* 벌크 수치 */}
                    <div className="text-center mt-4">
                      <div className="text-[18px] font-bold text-gray-600 tabular-nums leading-tight">
                        벌크 {fmt(s.weight)}<span className="text-[14px] text-gray-400 font-bold"> / {fmt(s.max)}톤</span>
                      </div>
                      <div className="text-[12.5px] mt-1 font-semibold" style={{ color: s.stale ? '#dc2626' : '#94a3b8' }}>
                        {s.stale ? '⚠ 데이터 지연' : (s.measuredAt ? new Date(s.measuredAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '측정값 없음')}
                      </div>
                    </div>

                    {/* 톤백 (1~8번만) */}
                    {hasTonbag && (
                      <div className="w-full mt-4 flex items-center justify-between">
                        <span className="text-[16px] font-bold text-indigo-700">🅱 톤백 {fmt(bt)}<span className="text-[12px] text-gray-400">톤</span></span>
                        <button onClick={() => setModalSilo(s)}
                          className="text-[14px] font-bold px-3.5 py-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                          {canEdit ? '톤백 관리' : '톤백 보기'}
                        </button>
                      </div>
                    )}

                    {/* 총 재고 (강조) */}
                    <div className="w-full mt-4 pt-4 border-t-2 border-gray-100">
                      <div className="rounded-2xl px-4 py-3.5 text-center" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
                        <div className="text-[13px] font-bold text-slate-300 tracking-wide">총 재고 {hasTonbag ? '(벌크+톤백)' : '(벌크)'}</div>
                        <div className="text-[38px] font-black text-white tabular-nums leading-none mt-1.5">
                          {fmt(combined)}<span className="text-lg text-slate-400 font-bold ml-1">톤</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">데이터를 불러오지 못했습니다.</div>
        )}
      </div>

      {modalSilo && (
        <TonBagModal
          silo={modalSilo}
          bags={bagsBySilo.get(modalSilo.no) || []}
          canEdit={canEdit}
          onClose={() => setModalSilo(null)}
          onChanged={loadBags}
          supabase={supabase}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ── 톤백 관리 모달 ── */
function TonBagModal({ silo, bags, canEdit, onClose, onChanged, supabase, toast }: {
  silo: Silo; bags: TonBag[]; canEdit: boolean; onClose: () => void; onChanged: () => void;
  supabase: ReturnType<typeof createClient>; toast: ReturnType<typeof useToast>;
}) {
  const [count, setCount] = useState('');
  const [tonPer, setTonPer] = useState('1');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const total = bags.reduce((s, b) => s + Number(b.total_ton || 0), 0);

  const add = async () => {
    const c = parseInt(count, 10);
    const tp = parseFloat(tonPer);
    if (!c || c <= 0) { toast.warning('톤백 개수를 입력하세요.'); return; }
    setSaving(true);
    const { error } = await supabase.from('silo_tonbags').insert({
      silo_no: silo.no, product: silo.product, bag_count: c, ton_per_bag: isNaN(tp) ? 1 : tp, memo: memo || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setCount(''); setMemo(''); onChanged(); toast.success('톤백이 기록되었습니다.');
  };
  const del = async (id: string) => {
    if (!confirm('이 톤백 기록을 삭제할까요?')) return;
    const { error } = await supabase.from('silo_tonbags').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">#{silo.no} {silo.product} · 톤백 관리</h2>
            <p className="text-[14px] text-gray-500 mt-0.5">현재 톤백 합계 <b className="text-indigo-600">{fmt(total)}톤</b> · {bags.length}건</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        {canEdit && (
          <div className="px-5 py-4 bg-slate-50 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[14px] font-bold text-gray-600 mb-1">톤백 개수</label>
                <input type="number" value={count} onChange={e => setCount(e.target.value)} placeholder="예: 25"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[16px]" />
              </div>
              <div>
                <label className="block text-[14px] font-bold text-gray-600 mb-1">개당 중량(톤)</label>
                <input type="number" step="0.1" value={tonPer} onChange={e => setTonPer(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[16px]" />
              </div>
            </div>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="비고 (선택)"
              className="w-full mt-3 px-3 py-2.5 border border-gray-300 rounded-lg text-[15px]" />
            <button onClick={add} disabled={saving}
              className="w-full mt-3 py-3 rounded-xl bg-indigo-600 text-white font-bold text-[16px] hover:bg-indigo-700 disabled:opacity-50">
              {saving ? '기록 중...' : '＋ 톤백 기록 추가'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {bags.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-[15px]">기록된 톤백이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {bags.map(b => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
                  <div>
                    <div className="text-[17px] font-extrabold text-gray-900 tabular-nums">
                      {b.bag_count}개 × {fmt(b.ton_per_bag)}톤 = <span className="text-indigo-600">{fmt(b.total_ton)}톤</span>
                    </div>
                    <div className="text-[13px] text-gray-400 mt-0.5">
                      {new Date(b.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {b.memo ? ` · ${b.memo}` : ''}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => del(b.id)} className="text-[14px] font-bold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50">삭제</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
