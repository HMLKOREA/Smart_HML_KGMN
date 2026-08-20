/**
 * 일일 배차 다이제스트 — 공용 데이터 조회 + 포맷터
 * 구성: ① 다음날 배차 목록  ② 그날 배차 완료 결과  ③ 특이사항
 * 텔레그램(HTML)·네이버웍스/Teams(평문)에서 재사용.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const PAGE_SIZE = 1000;
const DAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD'에 일수 더하기 (UTC 기준, TZ 무관) */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayName = (dateStr: string) => DAY[new Date(dateStr + 'T00:00:00Z').getUTCDay()];

export interface DispatchRow {
  date: string; type: string; customer: string; product: string; company: string;
  vehicle: string; driver: string; silo: string; weight: number;
  done: boolean; note: string;
}
type Row = DispatchRow;

async function fetchRange(from: string, to: string): Promise<Row[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0, hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('shipments')
      .select(`*, transport_companies!shipments_company_id_fkey(name), customers!shipments_customer_id_fkey(name), products!shipments_product_id_fkey(name)`)
      .gte('shipment_date', from).lte('shipment_date', to)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    all.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }
  return all.map(s => ({
    date: String(s.shipment_date || ''),
    type: (s.transport_type as string) || '',
    customer: (s.customers as Record<string, string>)?.name || '미지정',
    product: (s.products as Record<string, string>)?.name || '미지정',
    company: (s.transport_companies as Record<string, string>)?.name || '미지정',
    vehicle: (s.vehicle_number as string) || '',
    driver: (s.driver_name as string) || '',
    silo: (s.silo as string) || '',
    weight: Number(s.weight_net) || 0,
    done: !!s.is_shipped || !!s.certificate_time,
    note: (s.notes as string) || '',
  }));
}

export interface DailyDigest {
  date: string; dayName: string; nextDate: string; nextDayName: string;
  today: { total: number; completed: number; totalWeight: number; completedWeight: number;
           byCompany: Array<{ name: string; count: number; done: number; weight: number }> };
  next: { total: number; byCustomer: Array<{ customer: string; count: number; products: string[]; companies: string[] }> };
  issues: { pendingToday: number; notes: Array<{ when: string; customer: string; company: string; note: string }> };
}

export async function fetchDailyDigest(dateStr: string): Promise<DailyDigest> {
  const nextDate = addDays(dateStr, 1);
  const rows = await fetchRange(dateStr, nextDate);
  const today = rows.filter(r => r.date === dateStr);
  const next = rows.filter(r => r.date === nextDate);

  // ② 오늘 완료 결과
  const compMap = new Map<string, { count: number; done: number; weight: number }>();
  for (const r of today) {
    const e = compMap.get(r.company) || { count: 0, done: 0, weight: 0 };
    e.count++; if (r.done) e.done++; e.weight += r.weight;
    compMap.set(r.company, e);
  }
  const completed = today.filter(r => r.done).length;
  const completedWeight = today.filter(r => r.done).reduce((s, r) => s + r.weight, 0);

  // ① 다음날 목록 — 거래처별 묶음
  const custMap = new Map<string, { count: number; products: Set<string>; companies: Set<string> }>();
  for (const r of next) {
    const e = custMap.get(r.customer) || { count: 0, products: new Set<string>(), companies: new Set<string>() };
    e.count++; if (r.product) e.products.add(r.product); if (r.company) e.companies.add(r.company);
    custMap.set(r.customer, e);
  }

  // ③ 특이사항 — 오늘 미완료 + 비고 있는 건(오늘/내일)
  const noted = [...today.map(r => ({ ...r, when: '오늘' })), ...next.map(r => ({ ...r, when: '내일' }))]
    .filter(r => r.note && r.note.trim())
    .slice(0, 10)
    .map(r => ({ when: r.when, customer: r.customer, company: r.company, note: r.note.trim() }));

  return {
    date: dateStr, dayName: dayName(dateStr), nextDate, nextDayName: dayName(nextDate),
    today: {
      total: today.length, completed, totalWeight: today.reduce((s, r) => s + r.weight, 0), completedWeight,
      byCompany: [...compMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.weight - a.weight),
    },
    next: {
      total: next.length,
      byCustomer: [...custMap.entries()].map(([customer, v]) => ({ customer, count: v.count, products: [...v.products], companies: [...v.companies] }))
        .sort((a, b) => b.count - a.count),
    },
    issues: { pendingToday: today.length - completed, notes: noted },
  };
}

/** 특정 날짜의 배차 건별 행 (이미지 표 등) — 거래처·제품·운송사 순 정렬 */
export async function fetchDayRows(dateStr: string): Promise<DispatchRow[]> {
  const rows = await fetchRange(dateStr, dateStr);
  return rows.sort((a, b) => a.customer.localeCompare(b.customer, 'ko') || a.product.localeCompare(b.product, 'ko'));
}
export const nextDayOf = (dateStr: string) => addDays(dateStr, 1);
export const dayNameOf = (dateStr: string) => dayName(dateStr);

// 표시폭 기반 패딩 (한글·CJK = 2칸)
const vw = (s: string) => [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const padR = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - vw(s)));
const padL = (s: string, w: number) => ' '.repeat(Math.max(0, w - vw(s))) + s;

// ── HTML (텔레그램) — 모노스페이스 표 ──
export function formatDigestHTML(d: DailyDigest): string {
  const t = d.today, n = d.next;
  const pct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
  let m = `📋 <b>경기광업 일일 배차 보고</b> · ${d.date}(${d.dayName})\n`;

  // ① 다음날
  m += `\n<b>▶ 다음날 배차</b>  ${d.nextDate}(${d.nextDayName}) · <b>${n.total}건</b>\n`;
  if (n.total === 0) m += `<pre>예정 배차 없음</pre>`;
  else {
    const rows = n.byCustomer.slice(0, 10);
    const cw = Math.min(16, Math.max(6, ...rows.map(c => vw(c.customer))));
    let tbl = padR('거래처', cw) + ' 건 제품\n';
    for (const c of rows) tbl += padR(c.customer, cw) + ' ' + padL(String(c.count), 2) + ' ' + c.products.join(',').slice(0, 22) + '\n';
    if (n.byCustomer.length > 10) tbl += `…외 ${n.byCustomer.length - 10}곳\n`;
    m += `<pre>${esc(tbl)}</pre>`;
  }

  // ② 오늘 완료
  m += `\n<b>▶ 오늘 완료</b>  <b>${t.completed}/${t.total}건</b>(${pct}%) · ${t.completedWeight.toFixed(1)}/${t.totalWeight.toFixed(1)}톤\n`;
  if (t.total > 0) {
    const rows = t.byCompany.slice(0, 12);
    const cw = Math.min(14, Math.max(6, ...rows.map(c => vw(c.name))));
    let tbl = padR('운송사', cw) + ' 완료   톤\n';
    for (const c of rows) tbl += padR(c.name, cw) + ' ' + padL(`${c.done}/${c.count}`, 5) + ' ' + padL(c.weight.toFixed(1), 6) + '\n';
    m += `<pre>${esc(tbl)}</pre>`;
  }

  // ③ 특이사항
  m += `\n<b>▶ 특이사항</b>\n`;
  const lines: string[] = [];
  if (d.issues.pendingToday > 0) lines.push(`⚠ 오늘 미완료 ${d.issues.pendingToday}건`);
  for (const x of d.issues.notes.slice(0, 6)) lines.push(`[${x.when}] ${x.customer} — ${x.note}`);
  m += lines.length ? esc(lines.join('\n')) : '없음';

  m += `\n\n🔗 <a href="https://smart-hml.vercel.app/daily-report">상세보기</a>`;
  return m;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── 평문 (네이버웍스 / Teams) ──
export function formatDigestPlain(d: DailyDigest): string {
  const t = d.today, n = d.next;
  const pct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
  let m = `[경기광업 일일 배차 보고]\n${d.date} (${d.dayName})\n\n`;

  m += `▶ 다음날 배차 (${d.nextDate} ${d.nextDayName})\n`;
  if (n.total === 0) m += `- 예정 배차 없음\n`;
  else {
    m += `- 총 ${n.total}건 · 거래처 ${n.byCustomer.length}곳\n`;
    for (const c of n.byCustomer) m += `  · ${c.customer} ${c.count}건 (${c.products.join(',')} / ${c.companies.join(',')})\n`;
  }
  m += `\n`;

  m += `▶ 오늘 배차 완료 결과\n`;
  m += `- 완료 ${t.completed}/${t.total}건 (${pct}%) · ${t.completedWeight.toFixed(1)}/${t.totalWeight.toFixed(1)}톤\n`;
  for (const c of t.byCompany) m += `  · ${c.name}: ${c.done}/${c.count}건 · ${c.weight.toFixed(1)}t\n`;
  m += `\n`;

  m += `▶ 특이사항\n`;
  if (d.issues.pendingToday > 0) m += `- 오늘 미완료 ${d.issues.pendingToday}건\n`;
  if (d.issues.notes.length) for (const x of d.issues.notes) m += `  · [${x.when}] ${x.customer} — ${x.note}\n`;
  if (d.issues.pendingToday === 0 && d.issues.notes.length === 0) m += `- 없음\n`;

  m += `\n▶ 상세: https://smart-hml.vercel.app/daily-report`;
  return m;
}
