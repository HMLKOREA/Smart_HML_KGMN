/**
 * 네이버웍스 일일 배차결과 발송 API
 * POST /api/naverworks  Body: { date?: "2026-08-15" }
 * GET  /api/naverworks  → 설정 상태
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchDailyDigest, formatCaption } from '@/lib/notify/dailyReport';
import { isConfigured, hasChannel, sendChannelMessage, sendChannelImage } from '@/lib/notify/naverworks';

const IMG_BASE = 'https://smart-hml.vercel.app/api/daily-image';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ configured: isConfigured(), hasChannel: hasChannel() });
}

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: '네이버웍스 설정이 필요합니다 (NAVERWORKS_* 환경변수).' }, { status: 400 });
  }
  if (!hasChannel()) {
    return NextResponse.json({ error: 'NAVERWORKS_CHANNEL_ID가 설정되지 않았습니다 (그룹채팅 연결 필요).' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const dateStr = body.date || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // KST 오늘

  try {
    const digest = await fetchDailyDigest(dateStr);
    await sendChannelImage(`${IMG_BASE}?date=${dateStr}`); // 다음날 배차 표 이미지
    await sendChannelMessage(formatCaption(digest));        // 요약 텍스트
    // 크론 생존 하트비트(온라인 독립성 점검용)
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const { recordHeartbeat } = await import('@/lib/telegram/checks');
      await recordHeartbeat(await createServiceRoleClient(), 'daily-report', { date: dateStr });
    } catch { /* 무시 */ }
    return NextResponse.json({ success: true, date: dateStr, mode: 'image+text' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
