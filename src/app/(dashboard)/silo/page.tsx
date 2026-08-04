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

  const srcLabel: Record<string, { t: string; c: string; bg: string }> = {
    api: { t: '실데이터 · 벤더 API', c: '#15803d', bg: '#e7f6ec' },
    db: { t: '실데이터 · SQL', c: '#15803d', bg: '#e7f6ec' },
    dummy: { t: '샘플 데이터 (미연동)', c: '#b45309', bg: '#fdf2e0' },
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">사일로 현황</h1>
          {data && (
            <span style={{ color: srcLabel[data.source]?.c, background: srcLabel[data.source]?.bg }}
              className="text-[14px] font-bold px-3 py-1 rounded-full">
              {srcLabel[data.source]?.t || data.source}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[15px] text-gray-500">
          {data && <span>조회 {new Date(data.fetchedAt).toLocaleTimeString('ko-KR')}</span>}
          <button onClick={loadBulk} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700">새로고침</button>
        </div>
      </div>

      {data?.source === 'dummy' && (
        <div className="mx-5 sm:mx-7 mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[15px] text-amber-800">
          ⚠️ 사일로 <b>벌크 재고</b>는 아직 실데이터 미연동(<b>샘플값</b>) — 벤더 API/계정 확보 시 자동 전환됩니다. <b>톤백 저장은 지금부터 실제 기록·관리</b>됩니다.
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto p-5 sm:p-7 bg-slate-50">
        {loading && !data ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-lg">불러오는 중...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-5">
            {data?.silos.map(s => {
              const color = fillColor(s.pct);
              const h = s.pct == null ? 0 : s.pct;
              const bt = bagTotal(s.no);
              const combined = (s.weight ?? 0) + bt;
              return (
                <div key={s.no} className="bg-white rounded-3xl border border-gray-200 shadow-[0_2px_12px_rgba(15,23,42,0.05)] p-5 flex flex-col items-center">
                  <div className="flex items-baseline gap-2.5 mb-3">
                    <span className="text-[17px] font-bold text-gray-300">#{s.no}</span>
                    <span className="text-3xl font-black text-gray-900 tracking-tight">{s.product}</span>
                  </div>

                  {/* 게이지 */}
                  <div className="relative w-28 h-52 my-1.5 rounded-b-xl rounded-t-3xl border-[3px] border-gray-300 bg-gray-50 overflow-hidden shadow-inner">
                    <div className="absolute bottom-0 left-0 right-0 transition-[height] duration-700 ease-out"
                      style={{ height: `${h}%`, background: `linear-gradient(180deg, ${color}, ${color}cc)`, opacity: s.stale ? 0.45 : 1 }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-black leading-none" style={{ color: h > 52 ? '#fff' : '#0f172a', textShadow: h > 52 ? '0 2px 6px rgba(0,0,0,.4)' : 'none' }}>
                        {s.pct == null ? '-' : `${s.pct}%`}
                      </span>
                    </div>
                  </div>

                  {/* 벌크 수치 */}
                  <div className="text-center mt-2">
                    <div className="text-2xl font-black text-gray-900 tabular-nums leading-tight">
                      {fmt(s.weight)}<span className="text-base text-gray-400 font-bold"> / {fmt(s.max)}톤</span>
                    </div>
                    <div className="text-[13px] mt-1 font-semibold" style={{ color: s.stale ? '#dc2626' : '#94a3b8' }}>
                      {s.stale ? '⚠ 데이터 지연' : (s.measuredAt ? new Date(s.measuredAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '측정값 없음')}
                    </div>
                  </div>

                  {/* 톤백 (수동) */}
                  <div className="w-full mt-3.5 pt-3.5 border-t border-dashed border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-gray-500">🅱 톤백 저장</span>
                      <span className="text-xl font-black text-indigo-600 tabular-nums">{fmt(bt)}<span className="text-[13px] text-gray-400 font-bold">톤</span></span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[13px] text-gray-400 font-semibold">합계(벌크+톤백) {fmt(combined)}톤</span>
                      <button onClick={() => setModalSilo(s)}
                        className="text-[14px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                        {canEdit ? '톤백 관리' : '톤백 보기'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
