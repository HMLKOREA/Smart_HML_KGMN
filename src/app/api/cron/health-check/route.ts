/**
 * 일일 시스템/데이터 점검 리포트 → 텔레그램
 * GET  : 점검 결과 JSON 반환 (미전송, 프리뷰)
 * POST : 점검 후 텔레그램 전송
 *
 * 매일 23:58 KST GitHub Actions에서 POST 호출.
 */
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const kstStr = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '-';
const hoursAgo = (d: string | null) => (d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : null);

async function gather() {
  const svc = await createServiceRoleClient();
  const t0 = Date.now();

  // KST 오늘 날짜
  const kstToday = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

  const cnt = (table: string) => svc.from(table).select('*', { count: 'exact', head: true });

  const [shipTotal, shipToday, lastUpd, silo, sync, companies, customers, drivers, prices] = await Promise.all([
    cnt('shipments'),
    svc.from('shipments').select('*', { count: 'exact', head: true }).eq('shipment_date', kstToday),
    svc.from('shipments').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    svc.from('silo_snapshot').select('fetched_at').order('fetched_at', { ascending: false }).limit(1).maybeSingle(),
    svc.from('sync_status').select('last_run_at, is_delta').eq('id', 'main').maybeSingle(),
    cnt('transport_companies'),
    cnt('customers'),
    cnt('drivers'),
    svc.from('unit_prices').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const latency = Date.now() - t0;
  const dbError = shipTotal.error || companies.error;

  const lastUpdAt = (lastUpd.data as { updated_at?: string } | null)?.updated_at || null;
  const siloAt = (silo.data as { fetched_at?: string } | null)?.fetched_at || null;
  const syncAt = (sync.data as { last_run_at?: string } | null)?.last_run_at || null;
  const lastUpdH = hoursAgo(lastUpdAt);
  const siloH = hoursAgo(siloAt);
  const syncMin = syncAt ? (Date.now() - new Date(syncAt).getTime()) / 60_000 : null;

  // 경고 판정 — 실제 시스템 이상만. (사일로는 on-demand 갱신이라 경고 제외, 정보로만 표시)
  const warns: string[] = [];
  if (dbError) warns.push('DB 조회 오류');
  if ((shipTotal.count ?? 0) === 0) warns.push('출하 데이터 없음');
  if ((companies.count ?? 0) === 0) warns.push('운송사 마스터 없음');
  if ((customers.count ?? 0) === 0) warns.push('거래처 마스터 없음');

  return {
    ok: warns.length === 0,
    warns,
    latency,
    kstToday,
    shipTotal: shipTotal.count ?? 0,
    shipToday: shipToday.count ?? 0,
    lastUpdAt, lastUpdH,
    syncAt, syncMin,
    siloAt, siloH,
    companies: companies.count ?? 0,
    customers: customers.count ?? 0,
    drivers: drivers.count ?? 0,
    prices: prices.count ?? 0,
    dbError: dbError ? dbError.message : null,
  };
}

function format(r: Awaited<ReturnType<typeof gather>>): string {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  const badge = r.ok ? '정상 ✅' : `점검요망 ⚠️ (${r.warns.length})`;
  const fresh = (h: number | null) => (h == null ? '' : h < 1 ? ' (방금)' : ` (${h.toFixed(0)}시간 전)`);

  let m = `🩺 <b>경기광업 시스템 점검</b>\n`;
  m += `🗓 ${now}\n\n`;

  m += `<b>■ 서버 · DB</b>\n`;
  m += r.dbError ? `  ❌ DB 오류: ${r.dbError}\n` : `  ✅ 앱 · Supabase 정상 (응답 ${r.latency}ms)\n`;
  m += `\n`;

  const syncFresh = r.syncMin == null ? '' : r.syncMin < 60 ? ` (${Math.round(r.syncMin)}분 전)` : ` (${(r.syncMin / 60).toFixed(0)}시간 전)`;
  m += `<b>■ 데이터 동기화</b>\n`;
  m += `  · 마지막 동기화 실행: ${r.syncAt ? kstStr(r.syncAt) + syncFresh : '기록 없음'}\n`;
  m += `  · 최근 데이터 반영: ${kstStr(r.lastUpdAt)}${fresh(r.lastUpdH)}\n`;
  m += `  · 오늘 출하: ${r.shipToday}건\n`;
  m += `  · 사일로 조회: ${kstStr(r.siloAt)}${fresh(r.siloH)}\n`;
  m += `\n`;

  m += `<b>■ 마스터 현황</b>\n`;
  m += `  · 운송사 ${r.companies} · 거래처 ${r.customers} · 기사 ${r.drivers} · 활성단가 ${r.prices}\n`;
  m += `  · 누적 출하 ${r.shipTotal.toLocaleString('ko-KR')}건\n`;
  m += `\n`;

  m += `<b>■ 종합: ${badge}</b>`;
  if (!r.ok) m += `\n  ⚠️ ${r.warns.join(', ')}`;
  return m;
}

async function sendTelegram(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) throw new Error('텔레그램 미설정');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`텔레그램 전송 실패: ${JSON.stringify(j)}`);
}

export async function GET() {
  const r = await gather();
  return NextResponse.json({ ...r, preview: format(r) });
}

export async function POST() {
  try {
    const r = await gather();
    const text = format(r);
    await sendTelegram(text);
    return NextResponse.json({ success: true, ok: r.ok, warns: r.warns, messageLength: text.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
