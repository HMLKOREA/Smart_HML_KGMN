/* 다음날 배차 내역을 표 이미지(PNG)로 렌더 — 텔레그램/네이버웍스/Teams 공유용
 * GET /api/daily-image?date=YYYY-MM-DD  (date=보고일 D → D+1 배차를 렌더)
 */
import { ImageResponse } from 'next/og';
import { fetchDayRows, nextDayOf, dayNameOf } from '@/lib/notify/dailyReport';

export const runtime = 'edge';

const COLS = [
  { key: 'date', label: '출하일자', w: 110 },
  { key: 'type', label: '운송구분', w: 92 },
  { key: 'customer', label: '거래처', w: 230 },
  { key: 'product', label: '제품명', w: 210 },
  { key: 'company', label: '운송사', w: 96 },
] as const;
const MAXROWS = 45;

// Google Fonts 서브셋 TTF 로드 (구형 UA로 요청 → truetype 응답)
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
 try {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const nd = nextDayOf(date);
  const allRows = await fetchDayRows(nd);
  const total = allRows.length;
  const rows = allRows.slice(0, MAXROWS);
  const title = `경기광업 · 다음날 배차 내역 (${nd} ${dayNameOf(nd)}) · 총 ${total}건`;

  // 폰트 서브셋용 문자 수집
  const charset = new Set<string>(title + '출하일자운송구분거래처제품명운송사외건 -().:/0123456789');
  for (const r of rows) for (const v of [r.date, r.type, r.customer, r.product, r.company]) for (const ch of String(v)) charset.add(ch);
  const font = await loadFont([...charset].join(''));

  const W = COLS.reduce((s, c) => s + c.w, 0) + 2;
  const rowH = 30, headH = 38, titleH = 46;
  const H = titleH + headH + rows.length * rowH + (total > MAXROWS ? rowH : 0) + 4;

  const cell = (text: string, w: number, opts: { header?: boolean; center?: boolean; alt?: boolean } = {}) => ({
    type: 'div', props: {
      style: {
        width: w, height: opts.header ? headH : rowH, display: 'flex', alignItems: 'center',
        justifyContent: opts.center ? 'center' : 'flex-start', padding: '0 8px',
        fontSize: opts.header ? 15 : 14, fontWeight: opts.header ? 700 : 500,
        color: opts.header ? '#1e293b' : '#222', borderRight: '1px solid #d7dce2',
        borderBottom: '1px solid #e5e9ee', background: opts.header ? '#eef2f6' : (opts.alt ? '#fafbfc' : '#fff'),
        overflow: 'hidden', whiteSpace: 'nowrap',
      },
      children: text,
    },
  });

  const tree = {
    type: 'div', props: {
      style: { display: 'flex', flexDirection: 'column', width: W + 2, background: '#fff', fontFamily: 'NSK' },
      children: [
        { type: 'div', props: { style: { height: titleH, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 18, fontWeight: 700, color: '#fff', background: '#204080' }, children: title } },
        { type: 'div', props: { style: { display: 'flex' }, children: COLS.map(c => cell(c.label, c.w, { header: true, center: true })) } },
        ...rows.map((r, i) => ({ type: 'div', props: { style: { display: 'flex' }, children: [
          cell(r.date, COLS[0].w, { center: true, alt: i % 2 === 1 }),
          cell(r.type || '-', COLS[1].w, { center: true, alt: i % 2 === 1 }),
          cell(r.customer, COLS[2].w, { alt: i % 2 === 1 }),
          cell(r.product, COLS[3].w, { alt: i % 2 === 1 }),
          cell(r.company || '-', COLS[4].w, { center: true, alt: i % 2 === 1 }),
        ] } })),
        ...(total > MAXROWS ? [{ type: 'div', props: { style: { height: rowH, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 13, color: '#64748b' }, children: `…외 ${total - MAXROWS}건 (전체는 시스템에서 확인)` } }] : []),
      ],
    },
  };

  return new ImageResponse(tree as unknown as React.ReactElement, {
    width: W + 2, height: H,
    fonts: font ? [{ name: 'NSK', data: font, weight: 500, style: 'normal' }] : [],
  });
 } catch (err) {
  return new Response('IMG_ERR: ' + (err instanceof Error ? (err.stack || err.message) : String(err)), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
 }
}
