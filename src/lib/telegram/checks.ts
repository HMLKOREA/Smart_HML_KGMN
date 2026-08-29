/**
 * 시스템 셀프 점검 모음 — 텔레그램 명령어 봇 + 일일 점검이 공유.
 * 핵심 관점: "휘의 PC on/off와 무관하게 온라인에서 완전 독립 작동하는가".
 *   - 클라우드(Vercel·Supabase·GitHub Actions·Solapi·Telegram)만으로 도는 항목 → 독립 ✅
 *   - 레거시 MySQL sync만 휘의 PC에 의존 → 컷오버 후 제거 대상. gap 발생 시 강력 경고.
 * 각 함수는 { text, warns } 반환. warns 는 종합 경고 집계에 사용.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';

type SB = Awaited<ReturnType<typeof createServiceRoleClient>>;
export interface CheckResult { text: string; warns: string[] }

const KST = 9 * 3_600_000;
export const kstNow = () => new Date(Date.now() + KST);
export const kstDate = (offsetDays = 0) => new Date(Date.now() + KST + offsetDays * 86_400_000).toISOString().slice(0, 10);
const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '기록 없음');
const minsAgo = (d: string | null) => (d ? (Date.now() - new Date(d).getTime()) / 60_000 : null);
const ago = (min: number | null) => (min == null ? '' : min < 60 ? ` (${Math.round(min)}분 전)` : min < 1440 ? ` (${(min / 60).toFixed(1)}시간 전)` : ` (${Math.floor(min / 1440)}일 전)`);
const isBizHours = () => { const h = kstNow().getUTCHours(); return h >= 8 && h < 18; }; // KST 업무시간

export async function recordHeartbeat(svc: SB, name: string, meta?: Record<string, unknown>) {
  try {
    await svc.from('app_heartbeats').upsert(
      { name, last_run_at: new Date().toISOString(), meta: meta ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'name' },
    );
  } catch { /* 하트비트 실패는 무시 */ }
}

/** ■ 서버·DB */
export async function checkServer(svc: SB): Promise<CheckResult> {
  const t0 = Date.now();
  const { error } = await svc.from('shipments').select('*', { count: 'exact', head: true });
  const latency = Date.now() - t0;
  const warns: string[] = [];
  if (error) warns.push('DB 조회 오류');
  if (latency > 4000) warns.push(`DB 응답 지연 ${latency}ms`);
  const text = `<b>■ 서버·DB (클라우드)</b>\n` +
    (error ? `  ❌ DB 오류: ${error.message}\n` : `  ✅ Vercel 앱 · Supabase 정상 (응답 ${latency}ms)\n`);
  return { text, warns };
}

/** ■ 동기화 — 유일한 PC 의존 항목 */
export async function checkSync(svc: SB): Promise<CheckResult> {
  const { data } = await svc.from('sync_status').select('last_run_at, is_delta').eq('id', 'main').maybeSingle();
  const at = (data as { last_run_at?: string } | null)?.last_run_at || null;
  const gap = minsAgo(at);
  const warns: string[] = [];
  // 컷오버 전: 매시간 실행. 업무시간에 3시간+ 공백이면 PC 꺼짐 등 의심.
  if (gap == null) warns.push('동기화 기록 없음');
  else if (gap > 180 && isBizHours()) warns.push(`동기화 ${(gap / 60).toFixed(1)}시간 지연 (PC 꺼짐 의심)`);
  else if (gap > 1440) warns.push(`동기화 ${Math.floor(gap / 1440)}일 지연`);
  const flag = gap == null ? '⚠️' : gap > 180 ? '⚠️' : '✅';
  const text = `<b>■ 데이터 동기화 (⚠️ 휘 PC 의존)</b>\n` +
    `  ${flag} 마지막 실행: ${fmt(at)}${ago(gap)}\n` +
    `  · 레거시 MySQL이 PC에 있어 클라우드화 불가 → <b>컷오버 후 제거</b>됨\n`;
  return { text, warns };
}

/** ■ 클라우드 독립성 — 휘 PC 없이 온라인만으로 도는가 */
export async function checkIndependence(svc: SB): Promise<CheckResult> {
  const warns: string[] = [];
  const rows: string[] = [];

  // 1) 앱·DB (이 점검이 Vercel에서 실행 = 앱 살아있음)
  const t0 = Date.now();
  const { error: dbErr } = await svc.from('shipments').select('*', { count: 'exact', head: true });
  rows.push(dbErr ? '  ❌ Vercel 앱·Supabase' : `  ✅ Vercel 앱·Supabase (${Date.now() - t0}ms)`);
  if (dbErr) warns.push('앱·DB 이상');

  // 2) 자동 크론 생존(하트비트) — GitHub Actions
  const { data: hbs } = await svc.from('app_heartbeats').select('name, last_run_at');
  const hb = (name: string) => (hbs as { name: string; last_run_at: string }[] | null)?.find(h => h.name === name)?.last_run_at || null;
  const crons: [string, string, number][] = [
    ['일일 점검', 'daily-health-check', 26 * 60],
    ['일일 보고', 'daily-report', 26 * 60],
    ['POD 정리', 'pod-cleanup', 26 * 60 * 30], // 월 1회 정도이므로 느슨
  ];
  for (const [label, name, maxMin] of crons) {
    const at = hb(name); const g = minsAgo(at);
    if (at == null) { rows.push(`  ▫️ ${label}: 아직 기록 없음(관측 대기)`); }
    else if (g! > maxMin) { rows.push(`  ⚠️ ${label}: ${fmt(at)}${ago(g)} — 중단 의심`); warns.push(`${label} 크론 중단 의심`); }
    else rows.push(`  ✅ ${label}: ${fmt(at)}${ago(g)}`);
  }

  // 3) 유일한 PC 의존: sync
  const { data: s } = await svc.from('sync_status').select('last_run_at').eq('id', 'main').maybeSingle();
  const sgap = minsAgo((s as { last_run_at?: string } | null)?.last_run_at || null);
  const pcDep = 1; // 현재 sync 하나
  rows.push(`  ⚠️ 동기화(PC 의존): ${fmt((s as { last_run_at?: string } | null)?.last_run_at || null)}${ago(sgap)}`);

  const text = `<b>■ 클라우드 독립성 점검</b>\n` +
    rows.join('\n') + `\n` +
    `  ─────────────\n` +
    `  <b>PC 의존 항목: ${pcDep}개 (동기화)</b> · 컷오버 완료 시 <b>0개</b>\n`;
  return { text, warns };
}

/** ■ 오늘 출하 */
export async function checkShipments(svc: SB): Promise<CheckResult> {
  const today = kstDate();
  const { data, error } = await svc.from('shipments')
    .select('is_shipped, certificate_time, dispatch_notified')
    .eq('shipment_date', today);
  const warns: string[] = [];
  if (error) { warns.push('출하 조회 오류'); return { text: `<b>■ 오늘 출하</b>\n  ❌ ${error.message}`, warns }; }
  const rows = data || [];
  const n = rows.length;
  const shipped = rows.filter(r => r.is_shipped).length;
  const cert = rows.filter(r => r.certificate_time).length;
  const noti = rows.filter(r => r.dispatch_notified).length;
  const h = kstNow().getUTCHours();
  if (n === 0 && h >= 14) warns.push('오후인데 오늘 출하 0건');
  const text = `<b>■ 오늘 출하 (${today})</b>\n` +
    `  · 배차 ${n}건 · 출하완료 ${shipped} · 출하증 ${cert} · 배차통보 ${noti}\n`;
  return { text, warns };
}

/** ■ 내일 배차·통보 */
export async function checkDispatch(svc: SB): Promise<CheckResult> {
  const tomo = kstDate(1);
  const { data } = await svc.from('shipments')
    .select('dispatch_notified, company_id')
    .eq('shipment_date', tomo);
  const rows = data || [];
  const n = rows.length;
  const noti = rows.filter(r => r.dispatch_notified).length;
  const warns: string[] = [];
  const text = `<b>■ 내일 배차 (${tomo})</b>\n` +
    `  · 배차 ${n}건 · 배차통보 ${noti} · 미통보 ${n - noti}\n`;
  return { text, warns };
}

/** ■ 계근증빙 미제출 (최근 3일, has_attachment=false) */
export async function checkPod(svc: SB): Promise<CheckResult> {
  const from = kstDate(-3);
  const { data } = await svc.from('shipments')
    .select('has_attachment, weight_net, shipment_date')
    .gte('shipment_date', from);
  const rows = data || [];
  const noProof = rows.filter(r => !r.has_attachment).length;
  const noWeight = rows.filter(r => r.weight_net == null).length;
  const warns: string[] = [];
  const text = `<b>■ 계근증빙 (최근 3일)</b>\n` +
    `  · 대상 ${rows.length}건 · 증빙없음 ${noProof} · 계근값없음 ${noWeight}\n`;
  return { text, warns };
}

/** ■ 사일로 최근 조회 */
export async function checkSilo(svc: SB): Promise<CheckResult> {
  const { data } = await svc.from('silo_snapshot').select('fetched_at').order('fetched_at', { ascending: false }).limit(1).maybeSingle();
  const at = (data as { fetched_at?: string } | null)?.fetched_at || null;
  const text = `<b>■ 사일로</b>\n  · 최근 조회: ${fmt(at)}${ago(minsAgo(at))} (필요시 조회식)\n`;
  return { text, warns: [] };
}

/** ■ 이번주 생산계획 vs 실적 */
export async function checkPlan(svc: SB): Promise<CheckResult> {
  const n = kstNow();
  const dow = (n.getUTCDay() + 6) % 7; // 월=0
  const mon = new Date(n.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
  const sun = new Date(n.getTime() + (6 - dow) * 86_400_000).toISOString().slice(0, 10);
  const { data: sch } = await svc.from('production_schedules')
    .select('planned_trucks, status').gte('schedule_date', mon).lte('schedule_date', sun);
  const rows = sch || [];
  const planned = rows.reduce((s, r) => s + (r.planned_trucks || 0), 0);
  const confirmed = rows.filter(r => r.status === 'confirmed').length;
  const { count: actual } = await svc.from('shipments')
    .select('*', { count: 'exact', head: true }).gte('shipment_date', mon).lte('shipment_date', sun);
  const warns: string[] = [];
  const text = `<b>■ 이번주 생산계획 (${mon}~${sun})</b>\n` +
    `  · 계획 ${planned}대 (확정행 ${confirmed}) · 실제 출하 ${actual ?? 0}건\n`;
  return { text, warns };
}

/** ■ 마스터 현황 */
export async function checkMaster(svc: SB): Promise<CheckResult> {
  const [co, cu, dr, pr, sh] = await Promise.all([
    svc.from('transport_companies').select('*', { count: 'exact', head: true }),
    svc.from('customers').select('*', { count: 'exact', head: true }),
    svc.from('drivers').select('*', { count: 'exact', head: true }),
    svc.from('unit_prices').select('*', { count: 'exact', head: true }).eq('is_active', true),
    svc.from('shipments').select('*', { count: 'exact', head: true }),
  ]);
  const warns: string[] = [];
  if ((co.count ?? 0) === 0) warns.push('운송사 마스터 없음');
  if ((cu.count ?? 0) === 0) warns.push('거래처 마스터 없음');
  const text = `<b>■ 마스터 현황</b>\n` +
    `  · 운송사 ${co.count ?? 0} · 거래처 ${cu.count ?? 0} · 기사 ${dr.count ?? 0} · 활성단가 ${pr.count ?? 0}\n` +
    `  · 누적 출하 ${(sh.count ?? 0).toLocaleString('ko-KR')}건\n`;
  return { text, warns };
}

/** 전체 종합 점검 (강화판) */
export async function fullCheck(svc: SB): Promise<CheckResult> {
  const parts = await Promise.all([
    checkServer(svc), checkIndependence(svc), checkSync(svc),
    checkShipments(svc), checkDispatch(svc), checkPod(svc),
    checkSilo(svc), checkPlan(svc), checkMaster(svc),
  ]);
  const warns = parts.flatMap(p => p.warns);
  const now = kstNow().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  const badge = warns.length === 0 ? '정상 ✅' : `점검요망 ⚠️ (${warns.length})`;
  let text = `🩺 <b>경기광업 시스템 종합점검</b>\n🗓 ${now}\n\n`;
  text += parts.map(p => p.text).join('\n');
  text += `\n<b>■ 종합: ${badge}</b>`;
  if (warns.length) text += `\n  ⚠️ ${warns.join(', ')}`;
  return { text, warns };
}
