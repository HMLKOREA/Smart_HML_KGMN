/**
 * 텔레그램 일일 배차 보고 발송 API
 * POST /api/telegram  Body: { date?: "2026-06-20" }  (기본: 오늘)
 * 내용: 다음날 배차 목록 / 그날 완료 결과 / 특이사항
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchDailyDigest, formatCaption } from '@/lib/notify/dailyReport';

export const runtime = 'nodejs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const IMG_BASE = 'https://smart-hml.vercel.app/api/daily-image';

export async function GET() {
  return NextResponse.json({
    configured: !!BOT_TOKEN && !!CHAT_ID,
    botToken: BOT_TOKEN ? `${BOT_TOKEN.slice(0, 8)}...` : '미설정',
    chatId: CHAT_ID || '미설정',
  });
}

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json(
      { error: '텔레그램 설정이 필요합니다. .env.local에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID를 설정하세요.' },
      { status: 400 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const dateStr = body.date || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // KST 오늘

  try {
    const digest = await fetchDailyDigest(dateStr);
    const caption = formatCaption(digest);
    // 다음날 배차 표 이미지 + 요약 캡션
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, photo: `${IMG_BASE}?date=${dateStr}`, caption }),
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) return NextResponse.json({ error: '텔레그램 전송 실패', detail: tgData }, { status: 500 });
    return NextResponse.json({ success: true, date: dateStr, mode: 'photo' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
