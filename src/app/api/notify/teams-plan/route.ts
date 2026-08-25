/**
 * 주간 생산(출하)계획 확정 → Teams 알림
 * POST /api/notify/teams-plan  Body: { title: string, lines: string[] }
 * 환경변수: TEAMS_WEBHOOK_URL
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
const WEBHOOK = process.env.TEAMS_WEBHOOK_URL || '';

export async function GET() {
  return NextResponse.json({ configured: !!WEBHOOK });
}

export async function POST(req: NextRequest) {
  if (!WEBHOOK) {
    return NextResponse.json({ error: 'TEAMS_WEBHOOK_URL이 설정되지 않았습니다.' }, { status: 400 });
  }
  try {
    const { title, lines } = (await req.json().catch(() => ({}))) as { title?: string; lines?: string[] };
    const bodyBlocks: Record<string, unknown>[] = [
      { type: 'TextBlock', text: title || '주간 생산계획 확정', weight: 'Bolder', size: 'Medium', wrap: true },
    ];
    for (const l of (lines || [])) bodyBlocks.push({ type: 'TextBlock', text: l, wrap: true, spacing: 'Small' });

    const payload = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          body: bodyBlocks,
        },
      }],
    };
    const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.status < 200 || res.status >= 300) {
      const detail = await res.text();
      return NextResponse.json({ error: `Teams 전송 실패 (HTTP ${res.status}): ${detail}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
