/**
 * 텔레그램 명령어 봇 웹훅 — 휘가 텔레그램에서 개별 점검을 즉시 실행.
 *   Telegram → (webhook) → 이 엔드포인트 → Supabase 점검 → 답장.
 *
 * 보안: 휘의 chat_id(TELEGRAM_CHAT_ID)에서 온 메시지만 처리하고, 답장도 그 chat 으로만.
 *       (스푸핑된 요청이 와도 답장은 휘에게만 가므로 정보 유출 없음)
 *       TELEGRAM_WEBHOOK_SECRET 설정 시 헤더도 검증.
 *
 * 등록(1회): setWebhook 으로 이 URL 을 텔레그램에 연결. (scripts/telegram-set-webhook 참고)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  fullCheck, checkServer, checkSync, checkIndependence, checkShipments,
  checkDispatch, checkPod, checkSilo, checkPlan, checkMaster, recordHeartbeat,
} from '@/lib/telegram/checks';

export const runtime = 'nodejs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

type SB = Awaited<ReturnType<typeof createServiceRoleClient>>;

// 명령어 → 핸들러. 별칭(한/영) 지원.
const COMMANDS: Record<string, { aliases: string[]; desc: string; run: (svc: SB) => Promise<string> }> = {
  help:         { aliases: ['help', 'start', '도움', '명령', '명령어'], desc: '명령어 목록', run: async () => helpText() },
  check:        { aliases: ['check', '점검', '전체', '종합'], desc: '전체 종합점검', run: async (s) => (await fullCheck(s)).text },
  independence: { aliases: ['independence', 'indep', '독립', '클라우드'], desc: '클라우드 독립성(내 PC 없이 도는지)', run: async (s) => (await checkIndependence(s)).text },
  sync:         { aliases: ['sync', '동기화', '싱크'], desc: '동기화 상태(PC 의존)', run: async (s) => (await checkSync(s)).text },
  server:       { aliases: ['server', '서버', 'db'], desc: '서버·DB 상태', run: async (s) => (await checkServer(s)).text },
  shipments:    { aliases: ['shipments', 'ship', '출하'], desc: '오늘 출하 현황', run: async (s) => (await checkShipments(s)).text },
  dispatch:     { aliases: ['dispatch', '배차'], desc: '내일 배차·통보 현황', run: async (s) => (await checkDispatch(s)).text },
  pod:          { aliases: ['pod', '증빙', '계근'], desc: '계근증빙 미제출 현황', run: async (s) => (await checkPod(s)).text },
  silo:         { aliases: ['silo', '사일로'], desc: '사일로 조회 상태', run: async (s) => (await checkSilo(s)).text },
  plan:         { aliases: ['plan', '계획', '생산계획'], desc: '이번주 생산계획 vs 실적', run: async (s) => (await checkPlan(s)).text },
  master:       { aliases: ['master', '마스터'], desc: '마스터 데이터 현황', run: async (s) => (await checkMaster(s)).text },
};

function resolve(cmd: string): string | null {
  const c = cmd.toLowerCase();
  for (const [key, def] of Object.entries(COMMANDS)) if (def.aliases.includes(c)) return key;
  return null;
}

function helpText(): string {
  let t = `🤖 <b>경기광업 점검 봇 — 명령어</b>\n`;
  t += `아무거나 눌러/입력하면 즉시 점검합니다.\n\n`;
  for (const def of Object.values(COMMANDS)) {
    t += `/${def.aliases[0]} — ${def.desc}\n`;
  }
  t += `\n한글도 됩니다: /점검 /독립 /동기화 /출하 /배차 /증빙 /사일로 /생산계획 /마스터`;
  return t;
}

async function send(chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

export async function POST(req: NextRequest) {
  // 선택적 secret 검증
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return NextResponse.json({ ok: true }); // 조용히 무시
  }
  if (!BOT_TOKEN || !CHAT_ID) return NextResponse.json({ ok: true });

  const update = await req.json().catch(() => null);
  const msg = update?.message || update?.edited_message;
  const chatId = msg?.chat?.id;
  const text: string = (msg?.text || '').trim();

  // 휘의 chat 에서 온 것만 처리 (답장도 이 chat 으로만 → 스푸핑 시에도 유출 없음)
  if (!chatId || String(chatId) !== String(CHAT_ID) || !text) {
    return NextResponse.json({ ok: true });
  }

  // "/check@bot arg" → "check"
  const raw = text.split(/\s+/)[0].replace(/^\//, '').split('@')[0];
  const key = resolve(raw);

  try {
    const svc = await createServiceRoleClient();
    if (!key) {
      await send(CHAT_ID, `❓ 모르는 명령: <b>${raw}</b>\n\n${helpText()}`);
      return NextResponse.json({ ok: true });
    }
    const reply = await COMMANDS[key].run(svc);
    await send(CHAT_ID, reply);
    await recordHeartbeat(svc, 'telegram-bot', { cmd: key });
  } catch (err) {
    await send(CHAT_ID, `⚠️ 점검 중 오류: ${err instanceof Error ? err.message : String(err)}`);
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, commands: Object.keys(COMMANDS), configured: !!BOT_TOKEN && !!CHAT_ID });
}
