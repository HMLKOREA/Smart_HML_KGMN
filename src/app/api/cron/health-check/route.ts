/**
 * 일일 시스템 종합점검 → 텔레그램 (강화판)
 * GET  : 점검 결과 미리보기(미전송)
 * POST : 점검 후 텔레그램 전송 + 하트비트 기록
 *
 * 매일 23:58 KST GitHub Actions에서 POST 호출. (클라우드 크론 = PC 무관)
 * 점검 로직은 @/lib/telegram/checks 로 일원화(텔레그램 명령어 봇과 공유).
 */
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fullCheck, recordHeartbeat } from '@/lib/telegram/checks';

export const runtime = 'nodejs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function sendTelegram(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) throw new Error('텔레그램 미설정');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`텔레그램 전송 실패: ${JSON.stringify(j)}`);
}

export async function GET() {
  const svc = await createServiceRoleClient();
  const r = await fullCheck(svc);
  return NextResponse.json({ ok: r.warns.length === 0, warns: r.warns, preview: r.text });
}

export async function POST() {
  try {
    const svc = await createServiceRoleClient();
    const r = await fullCheck(svc);
    await sendTelegram(r.text);
    await recordHeartbeat(svc, 'daily-health-check', { warns: r.warns.length });
    return NextResponse.json({ success: true, ok: r.warns.length === 0, warns: r.warns, messageLength: r.text.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
