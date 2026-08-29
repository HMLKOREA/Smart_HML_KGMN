/**
 * 동기화 감시견(watchdog) — 클라우드에서 sync 지연을 감지해 지연 시에만 텔레그램 경고.
 *   휘 PC와 무관하게 GitHub Actions가 업무시간 중 주기 호출. 정상이면 조용, 지연이면 알림.
 * GET  : 상태 미리보기(미전송)
 * POST : 임계 초과 시 텔레그램 경고 + 하트비트 기록
 *
 * 임계: 마지막 sync 후 150분(2.5시간) 초과. (야간 PC-off는 정상이므로 KST 업무시간에만 경고)
 */
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordHeartbeat } from '@/lib/telegram/checks';

export const runtime = 'nodejs';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const STALE_MIN = 150;

const kstHour = () => new Date(Date.now() + 9 * 3_600_000).getUTCHours();

async function evaluate() {
  const svc = await createServiceRoleClient();
  const { data } = await svc.from('sync_status').select('last_run_at').eq('id', 'main').maybeSingle();
  const at = (data as { last_run_at?: string } | null)?.last_run_at || null;
  const gapMin = at ? Math.round((Date.now() - new Date(at).getTime()) / 60_000) : null;
  const biz = kstHour() >= 8 && kstHour() < 20;
  const stale = gapMin == null || gapMin > STALE_MIN;
  const shouldAlert = biz && stale;
  const lastKst = at ? new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '기록 없음';
  return { svc, at, gapMin, biz, stale, shouldAlert, lastKst };
}

async function sendTelegram(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

export async function GET() {
  const r = await evaluate();
  return NextResponse.json({ stale: r.stale, gapMin: r.gapMin, bizHours: r.biz, wouldAlert: r.shouldAlert, lastSync: r.lastKst });
}

export async function POST() {
  const r = await evaluate();
  await recordHeartbeat(r.svc, 'sync-watch', { gapMin: r.gapMin });
  if (r.shouldAlert) {
    const hrs = r.gapMin == null ? '기록 없음' : `${(r.gapMin / 60).toFixed(1)}시간`;
    await sendTelegram(
      `⚠️ <b>동기화 지연 경고</b>\n` +
      `마지막 동기화: ${r.lastKst} (${hrs} 전)\n` +
      `업무시간인데 ${Math.round(STALE_MIN / 60 * 10) / 10}시간+ 갱신이 없습니다.\n` +
      `→ 현장 PC가 켜져 있는지, 동기화 작업이 도는지 확인 필요.\n` +
      `(텔레그램에서 /동기화 로 상태 확인)`,
    );
  }
  return NextResponse.json({ success: true, alerted: r.shouldAlert, gapMin: r.gapMin });
}
