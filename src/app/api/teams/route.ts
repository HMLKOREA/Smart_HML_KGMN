/**
 * Microsoft Teams 일일 배차 보고 발송 API (Incoming Webhook / Workflows)
 * POST /api/teams  Body: { date?: "2026-06-20" }
 * 환경변수: TEAMS_WEBHOOK_URL  (Teams 채널 → Workflows "웹훅 요청 시 채널에 게시" URL)
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchDailyDigest, formatCaption } from '@/lib/notify/dailyReport';

export const runtime = 'nodejs';

const WEBHOOK = process.env.TEAMS_WEBHOOK_URL || '';
const IMG_BASE = 'https://smart-hml.vercel.app/api/daily-image';

export async function GET() {
  return NextResponse.json({ configured: !!WEBHOOK });
}

export async function POST(request: NextRequest) {
  if (!WEBHOOK) {
    return NextResponse.json({ error: 'TEAMS_WEBHOOK_URL이 설정되지 않았습니다.' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const dateStr = body.date || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // KST 오늘

  try {
    const digest = await fetchDailyDigest(dateStr);
    const text = formatCaption(digest);
    // Adaptive Card (Workflows 웹훅 형식) — 요약 + 다음날 배차 표 이미지
    const payload = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: `경기광업 일일 배차 보고 · ${digest.date} (${digest.dayName})`, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: text, wrap: true },
            { type: 'Image', url: `${IMG_BASE}?date=${dateStr}`, altText: '다음날 배차 내역' },
          ],
        },
      }],
    };
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status < 200 || res.status >= 300) {
      const detail = await res.text();
      return NextResponse.json({ error: `Teams 전송 실패 (HTTP ${res.status}): ${detail}` }, { status: 500 });
    }
    return NextResponse.json({ success: true, date: dateStr, messageLength: text.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
