/**
 * 텔레그램 일일보고 발송 API
 *
 * POST /api/telegram
 * Body: { date?: "2026-06-20" }  (기본: 오늘)
 *
 * 환경변수:
 *   TELEGRAM_BOT_TOKEN  — BotFather에서 발급받은 토큰
 *   TELEGRAM_CHAT_ID    — 메시지를 받을 채팅 ID (개인/그룹)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const PAGE_SIZE = 1000;

/**
 * 페이지네이션으로 전체 행 조회 (Supabase 1000행 제한 우회)
 */
async function fetchAllShipments(dateStr: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        transport_companies!shipments_company_id_fkey(name),
        customers!shipments_customer_id_fkey(name),
        products!shipments_product_id_fkey(name)
      `)
      .eq('shipment_date', dateStr)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;

    const rows = (data || []) as Record<string, unknown>[];
    all.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }

  return all;
}

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json(
      { error: '텔레그램 설정이 필요합니다. .env.local에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID를 설정하세요.' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const dateStr = body.date || new Date().toISOString().slice(0, 10);

  try {
    // 출하 데이터 조회 (페이지네이션)
    const shipments = await fetchAllShipments(dateStr);

    const rows = (shipments || []).map((s: Record<string, unknown>) => ({
      company: (s.transport_companies as Record<string, string>)?.name || '미지정',
      customer: (s.customers as Record<string, string>)?.name || '미지정',
      product: (s.products as Record<string, string>)?.name || '미지정',
      weight: Number(s.weight_net) || 0,
      type: (s.transport_type as string) || '',
      status: s.status as string,
      vehicle: s.vehicle_number as string,
    }));

    const message = formatTelegramMessage(dateStr, rows);

    // 텔레그램 전송
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      return NextResponse.json({ error: '텔레그램 전송 실패', detail: tgData }, { status: 500 });
    }

    return NextResponse.json({ success: true, date: dateStr, messageLength: message.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET: 텔레그램 설정 상태 확인
export async function GET() {
  const configured = !!BOT_TOKEN && !!CHAT_ID;
  return NextResponse.json({
    configured,
    botToken: BOT_TOKEN ? `${BOT_TOKEN.slice(0, 8)}...` : '미설정',
    chatId: CHAT_ID || '미설정',
  });
}

interface Row {
  company: string;
  customer: string;
  product: string;
  weight: number;
  type: string;
  status: string;
  vehicle: string;
}

function formatTelegramMessage(date: string, rows: Row[]): string {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(date);
  const dayName = dayNames[d.getDay()];

  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  const completed = rows.filter(r => r.status === 'completed').length;

  // 운송사별 집계
  const byCompany = new Map<string, { count: number; weight: number }>();
  for (const r of rows) {
    const prev = byCompany.get(r.company) || { count: 0, weight: 0 };
    byCompany.set(r.company, { count: prev.count + 1, weight: prev.weight + r.weight });
  }

  // 운송유형별
  const byType = new Map<string, { count: number; weight: number }>();
  for (const r of rows) {
    const type = r.type || '기타';
    const prev = byType.get(type) || { count: 0, weight: 0 };
    byType.set(type, { count: prev.count + 1, weight: prev.weight + r.weight });
  }

  let msg = `📊 <b>일일 배차결과 보고</b>\n`;
  msg += `📅 ${date} (${dayName})\n\n`;

  msg += `<b>▸ 총괄</b>\n`;
  msg += `  출하 ${rows.length}건 / ${totalWeight.toFixed(1)}톤\n`;
  msg += `  완료 ${completed}건 (${rows.length > 0 ? Math.round((completed / rows.length) * 100) : 0}%)\n`;
  msg += `  운송사 ${byCompany.size}개사\n\n`;

  msg += `<b>▸ 운송사별</b>\n`;
  const companyEntries = Array.from(byCompany.entries()).sort((a, b) => b[1].weight - a[1].weight);
  for (const [name, v] of companyEntries) {
    msg += `  ${name}: ${v.count}건 / ${v.weight.toFixed(1)}t\n`;
  }

  msg += `\n<b>▸ 운송유형별</b>\n`;
  for (const [type, v] of byType.entries()) {
    msg += `  ${type}: ${v.count}건 / ${v.weight.toFixed(1)}t\n`;
  }

  msg += `\n🔗 <a href="https://smart-hml.vercel.app/daily-report">상세보기</a>`;
  msg += `\n⏰ ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;

  return msg;
}
