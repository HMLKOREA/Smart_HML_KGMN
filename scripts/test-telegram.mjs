/**
 * 텔레그램 일일보고 테스트 발송
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// .env.local 로드
try {
  const envContent = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq > 0 && !process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
} catch {}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// 오늘 또는 가장 최근 데이터 있는 날짜 찾기
let dateStr = process.argv[2] || new Date().toISOString().slice(0, 10);

// 해당일 데이터 없으면 가장 최근 날짜 찾기
let { data: shipments } = await supabase
  .from('shipments')
  .select(`*, transport_companies!shipments_company_id_fkey(name), customers!shipments_customer_id_fkey(name), products!shipments_product_id_fkey(name)`)
  .eq('shipment_date', dateStr);

if (!shipments || shipments.length === 0) {
  console.log(`${dateStr}에 데이터 없음, 최근 날짜 검색...`);
  const { data: recent } = await supabase
    .from('shipments')
    .select('shipment_date')
    .order('shipment_date', { ascending: false })
    .limit(1)
    .single();
  if (recent) {
    dateStr = recent.shipment_date;
    const res = await supabase
      .from('shipments')
      .select(`*, transport_companies!shipments_company_id_fkey(name), customers!shipments_customer_id_fkey(name), products!shipments_product_id_fkey(name)`)
      .eq('shipment_date', dateStr);
    shipments = res.data;
  }
}

const rows = (shipments || []).map(s => ({
  company: s.transport_companies?.name || '미지정',
  customer: s.customers?.name || '미지정',
  product: s.products?.name || '미지정',
  weight: Number(s.weight_net) || 0,
  type: s.transport_type || '기타',
  status: s.status,
}));

console.log(`${dateStr}: ${rows.length}건 데이터`);

// 메시지 포맷
const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
const d = new Date(dateStr);
const dayName = dayNames[d.getDay()];
const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
const completed = rows.filter(r => r.status === 'completed').length;

const byCompany = new Map();
for (const r of rows) {
  const prev = byCompany.get(r.company) || { count: 0, weight: 0 };
  byCompany.set(r.company, { count: prev.count + 1, weight: prev.weight + r.weight });
}

const byType = new Map();
for (const r of rows) {
  const prev = byType.get(r.type) || { count: 0, weight: 0 };
  byType.set(r.type, { count: prev.count + 1, weight: prev.weight + r.weight });
}

let msg = `📊 <b>일일 배차결과 보고</b>\n`;
msg += `📅 ${dateStr} (${dayName})\n\n`;
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

console.log('\n--- 메시지 미리보기 ---');
console.log(msg.replace(/<[^>]+>/g, ''));
console.log('--- 전송 중... ---');

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'HTML' }),
});

const result = await res.json();
if (result.ok) {
  console.log('✅ 텔레그램 전송 성공!');
} else {
  console.log('❌ 전송 실패:', JSON.stringify(result));
}
