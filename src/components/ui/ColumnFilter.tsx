'use client';

import { useState } from 'react';

/** 여러 컬럼 필터 적용 (모든 활성 필터의 AND) */
export function applyColumnFilters<T>(rows: T[], filters: Record<string, string[]>, get: (row: T, key: string) => string): T[] {
  const active = Object.entries(filters);
  if (!active.length) return rows;
  return rows.filter(r => active.every(([k, vals]) => vals.includes(get(r, k))));
}

/** 컬럼 헤더 우측 상단 ▼ 필터 배지 + 드롭다운 (엑셀식). th는 position:relative/sticky 필요. */
export function ColumnFilterButton({
  colKey, values, filters, setFilters, dark,
}: {
  colKey: string;
  values: string[];
  filters: Record<string, string[]>;
  setFilters: (f: Record<string, string[]>) => void;
  dark?: boolean;
}) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState('');
  const active = !!filters[colKey]?.length;
  const sel = filters[colKey];
  const isChecked = (v: string) => !sel || sel.includes(v);
  const apply = (next: string[]) => {
    const cp = { ...filters };
    if (next.length >= values.length) delete cp[colKey]; else cp[colKey] = next;
    setFilters(cp);
  };
  const toggleVal = (v: string) => { const cur = sel ?? values; apply(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]); };
  const shown = values.filter(v => !search || (v === '' ? '(빈값)' : v).toLowerCase().includes(search.toLowerCase()));
  const allShownChecked = shown.length > 0 && shown.every(isChecked);

  return (
    <>
      <span
        onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setSearch(''); setOpen(open ? null : { x: r.left, y: r.bottom }); }}
        title="필터"
        style={{ position: 'absolute', top: 2, right: 8, cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: '2px 3px', borderRadius: 3, zIndex: 1, color: active ? '#fff' : (dark ? '#94a3b8' : '#64748b'), background: active ? '#2563eb' : (dark ? 'rgba(255,255,255,.14)' : '#e8ebef') }}
      >▼</span>
      {open && (
        <>
          <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
          <div style={{ position: 'fixed', left: Math.max(6, Math.min(open.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 254)), top: open.y + 2, zIndex: 301, width: 244, background: '#fff', color: '#111', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 10px 28px rgba(0,0,0,.18)', padding: 8, display: 'flex', flexDirection: 'column', maxHeight: 380, textAlign: 'left', fontWeight: 400 }}>
            <input autoFocus placeholder="검색…" value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 6 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px', fontSize: 12.5, fontWeight: 600, borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <input type="checkbox" checked={allShownChecked} onChange={() => apply(allShownChecked ? (sel ?? values).filter(v => !shown.includes(v)) : [...new Set([...(sel ?? []), ...shown])])} />
              (모두)
            </label>
            <div style={{ overflowY: 'auto', flex: 1, marginTop: 2 }}>
              {shown.map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <input type="checkbox" checked={isChecked(v)} onChange={() => toggleVal(v)} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v === '' ? '(빈값)' : v}</span>
                </label>
              ))}
              {shown.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', padding: 8 }}>검색 결과 없음</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => { const cp = { ...filters }; delete cp[colKey]; setFilters(cp); }}
                style={{ flex: 1, fontSize: 12, padding: '6px 0', border: '1px solid #d1d5db', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', color: '#475569', fontWeight: 600 }}>필터 해제</button>
              <button onClick={() => setOpen(null)}
                style={{ flex: 1, fontSize: 12, padding: '6px 0', border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>닫기</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
