'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: number;
}

/**
 * 엑셀 값 필터형 다중선택 드롭다운.
 * - 선택 없음 = 전체
 * - 검색, 모두선택/해제 지원
 */
export default function MultiSelectFilter({ label, options, selected, onChange, width = 150 }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(
    () => options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())),
    [options, q],
  );

  const allChecked = selected.length === 0 || selected.length === options.length;
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };

  const summary = selected.length === 0
    ? '전체'
    : selected.length === 1 ? selected[0] : `${selected.length}개 선택`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-1 px-3 py-2 text-[15px] font-medium rounded-lg border bg-white truncate
          ${selected.length ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700'}`}
        title={selected.join(', ')}
      >
        <span className="truncate"><b className="font-semibold text-gray-500">{label}</b> {summary}</span>
        <span className="text-gray-400 shrink-0">▾</span>
      </button>

      {open && (
        <div style={{ minWidth: Math.max(width, 200) }}
          className="absolute z-50 mt-1 left-0 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="검색..."
              className="w-full px-2 py-1.5 text-[14px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-[13px]">
            <button type="button" onClick={() => onChange([])} className={`font-semibold ${allChecked ? 'text-blue-700' : 'text-gray-500'}`}>
              전체(선택해제)
            </button>
            <button type="button" onClick={() => onChange([...options])} className="text-gray-500 font-medium">모두선택</button>
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-[13px] text-gray-400">항목 없음</div>}
            {filtered.map(o => (
              <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-[15px] text-gray-800 hover:bg-blue-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="w-4 h-4" />
                <span className="truncate">{o}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
