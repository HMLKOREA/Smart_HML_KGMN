'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';

interface Silo {
  no: number; product: string; max: number; table: string; field: number;
  weight: number | null; pct: number | null; measuredAt: string | null; stale: boolean;
}
interface SiloResp { source: string; warn: string | null; staleHours: number; silos: Silo[]; fetchedAt: string; }

const fmt = (n: number | null) => n == null ? '-' : n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

function fillColor(pct: number | null): string {
  if (pct == null) return '#94a3b8';
  if (pct >= 90) return '#dc2626';   // 가득
  if (pct >= 70) return '#f59e0b';   // 높음
  if (pct >= 30) return '#16a34a';   // 정상
  return '#0ea5e9';                  // 낮음
}

export default function SiloPage() {
  const [data, setData] = useState<SiloResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/silo', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // 60초마다 최신값 재조회 (저장 안 함)
    return () => clearInterval(t);
  }, [load]);

  const srcLabel: Record<string, { t: string; c: string }> = {
    api: { t: '벤더 API 연동', c: '#16a34a' },
    db: { t: 'SQL 직접조회', c: '#16a34a' },
    dummy: { t: '샘플 데이터 (미연동)', c: '#b45309' },
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-border)] bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">사일로 현황</h1>
          {data && (
            <span style={{ color: srcLabel[data.source]?.c }} className="text-[13px] font-bold px-2.5 py-1 rounded-full border"
              title="데이터 소스">
              {srcLabel[data.source]?.t || data.source}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {data && <span>조회: {new Date(data.fetchedAt).toLocaleTimeString('ko-KR')}</span>}
          <button onClick={load} className="px-3 py-2 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700">
            새로고침
          </button>
        </div>
      </div>

      {data?.source === 'dummy' && (
        <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[14px] text-amber-800">
          ⚠️ 아직 사일로 실데이터에 연동되지 않아 <b>샘플값</b>을 표시 중입니다. 벤더 API 또는 읽기전용 계정이 확보되면 실데이터로 자동 전환됩니다.
        </div>
      )}
      {err && <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">조회 오류: {err}</div>}

      {/* Silo grid */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center h-40 text-gray-400">불러오는 중...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-5">
            {data?.silos.map(s => {
              const color = fillColor(s.pct);
              const h = s.pct == null ? 0 : s.pct;
              return (
                <div key={s.no} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col items-center">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[15px] font-bold text-gray-400">#{s.no}</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-gray-900">{s.product}</span>
                  </div>
                  {/* 사일로 게이지 (세로 채움) */}
                  <div className="relative w-20 sm:w-24 h-40 sm:h-48 my-2 rounded-b-[10px] rounded-t-2xl border-2 border-gray-300 bg-gray-50 overflow-hidden">
                    <div className="absolute bottom-0 left-0 right-0 transition-[height] duration-500"
                      style={{ height: `${h}%`, background: color, opacity: s.stale ? 0.45 : 1 }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-black" style={{ color: h > 50 ? '#fff' : '#1e293b', textShadow: h > 50 ? '0 1px 3px rgba(0,0,0,.35)' : 'none' }}>
                        {s.pct == null ? '-' : `${s.pct}%`}
                      </span>
                    </div>
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-lg sm:text-xl font-extrabold text-gray-900 tabular-nums">
                      {fmt(s.weight)}<span className="text-sm text-gray-400 font-bold"> / {fmt(s.max)} 톤</span>
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: s.stale ? '#dc2626' : '#94a3b8' }}>
                      {s.stale ? '⚠ 데이터 지연' : (s.measuredAt ? new Date(s.measuredAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
