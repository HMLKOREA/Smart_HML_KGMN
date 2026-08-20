/* 다음날 배차 내역을 표 이미지(PNG)로 렌더 — 텔레그램/네이버웍스/Teams 공유용
 * GET /api/daily-image?date=YYYY-MM-DD  (date=보고일 D → D+1 배차를 렌더)
 */
import { ImageResponse } from 'next/og';
import { fetchDayRows, nextDayOf, dayNameOf } from '@/lib/notify/dailyReport';

export const runtime = 'edge';

const COLS = [
  { key: 'date', label: '출하일자', w: 108, center: true },
  { key: 'type', label: '운송구분', w: 88, center: true },
  { key: 'customer', label: '거래처', w: 230, center: false },
  { key: 'product', label: '제품명', w: 210, center: false },
  { key: 'company', label: '운송사', w: 92, center: true },
] as const;
const MAXROWS = 45;

async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MSIE 6.0)' } })).text();
    const m = css.match(/src:\s*url\((.+?)\)\s*format\('(?:truetype|opentype)'\)/);
    if (!m) return null;
    return await (await fetch(m[1])).arrayBuffer();
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const nd = nextDayOf(date);
  const allRows = await fetchDayRows(nd);
  const total = allRows.length;
  const rows = allRows.slice(0, MAXROWS);
  const title = `경기광업 · 다음날 배차 내역  ${nd} (${dayNameOf(nd)}) · 총 ${total}건`;

  const charset = new Set<string>(title + '출하일자운송구분거래처제품명운송사외건 -().:/,0123456789');
  for (const r of rows) for (const v of [r.date, r.type, r.customer, r.product, r.company]) for (const ch of String(v || '')) charset.add(ch);
  const font = await loadFont([...charset].join(''));

  const W = COLS.reduce((s, c) => s + c.w, 0);
  const rowH = 30, headH = 36, titleH = 44;
  const extra = total > MAXROWS ? rowH : 0;
  const H = titleH + headH + rows.length * rowH + extra;

  const tdStyle = (w: number, center: boolean, alt: boolean): React.CSSProperties => ({
    display: 'flex', width: w, height: rowH, alignItems: 'center',
    justifyContent: center ? 'center' : 'flex-start', padding: '0 8px',
    fontSize: 14, color: '#222', borderRight: '1px solid #d7dce2', borderBottom: '1px solid #e8ecf0',
    background: alt ? '#fafbfc' : '#ffffff', overflow: 'hidden', whiteSpace: 'nowrap',
  });

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: W, background: '#ffffff', fontFamily: 'NSK', border: '1px solid #c9d0d8' }}>
        <div style={{ display: 'flex', height: titleH, alignItems: 'center', padding: '0 14px', fontSize: 18, fontWeight: 700, color: '#ffffff', background: '#204080' }}>{title}</div>
        <div style={{ display: 'flex' }}>
          {COLS.map(c => (
            <div key={c.key} style={{ display: 'flex', width: c.w, height: headH, alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#1e293b', background: '#eef2f6', borderRight: '1px solid #d7dce2', borderBottom: '2px solid #c9d0d8' }}>{c.label}</div>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex' }}>
            <div style={tdStyle(COLS[0].w, true, i % 2 === 1)}>{r.date}</div>
            <div style={tdStyle(COLS[1].w, true, i % 2 === 1)}>{r.type || '-'}</div>
            <div style={tdStyle(COLS[2].w, false, i % 2 === 1)}>{r.customer}</div>
            <div style={tdStyle(COLS[3].w, false, i % 2 === 1)}>{r.product}</div>
            <div style={tdStyle(COLS[4].w, true, i % 2 === 1)}>{r.company || '-'}</div>
          </div>
        ))}
        {total > MAXROWS && (
          <div style={{ display: 'flex', height: rowH, alignItems: 'center', padding: '0 12px', fontSize: 13, color: '#64748b' }}>…외 {total - MAXROWS}건 (전체는 시스템에서 확인)</div>
        )}
      </div>
    ),
    { width: W, height: H, fonts: font ? [{ name: 'NSK', data: font, weight: 500, style: 'normal' }] : [] },
  );
}
