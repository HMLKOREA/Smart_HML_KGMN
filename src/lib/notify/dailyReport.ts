/**
 * 일일 배차결과 리포트 — 공용 데이터 조회 + 포맷터
 * 텔레그램(HTML)·네이버웍스(평문) 등 여러 채널에서 재사용.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const PAGE_SIZE = 1000;

export interface DailyReport {
  date: string;
  dayName: string;
  count: number;
  totalWeight: number;
  completed: number;
  byCompany: Array<[string, { count: number; weight: number }]>;
  byType: Array<[string, { count: number; weight: number }]>;
}

export async function fetchDailyReport(dateStr: string): Promise<DailyReport> {
  const all: Record<string, unknown>[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('shipments')
      .select(`*, transport_companies!shipments_company_id_fkey(name), customers!shipments_customer_id_fkey(name), products!shipments_product_id_fkey(name)`)
      .eq('shipment_date', dateStr)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    all.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }

  const rows = all.map(s => ({
    company: (s.transport_companies as Record<string, string>)?.name || '미지정',
    product: (s.products as Record<string, string>)?.name || '미지정',
    weight: Number(s.weight_net) || 0,
    type: (s.transport_type as string) || '기타',
    status: s.status as string,
  }));

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  const completed = rows.filter(r => r.status === 'completed').length;

  const byCompanyMap = new Map<string, { count: number; weight: number }>();
  const byTypeMap = new Map<string, { count: number; weight: number }>();
  for (const r of rows) {
    const c = byCompanyMap.get(r.company) || { count: 0, weight: 0 };
    byCompanyMap.set(r.company, { count: c.count + 1, weight: c.weight + r.weight });
    const t = byTypeMap.get(r.type) || { count: 0, weight: 0 };
    byTypeMap.set(r.type, { count: t.count + 1, weight: t.weight + r.weight });
  }

  return {
    date: dateStr,
    dayName: dayNames[new Date(dateStr).getDay()],
    count: rows.length,
    totalWeight,
    completed,
    byCompany: [...byCompanyMap.entries()].sort((a, b) => b[1].weight - a[1].weight),
    byType: [...byTypeMap.entries()],
  };
}

/** 평문 포맷 (네이버웍스 봇 등 — HTML 미지원 채널용) */
export function formatPlainText(d: DailyReport): string {
  const pct = d.count > 0 ? Math.round((d.completed / d.count) * 100) : 0;
  let m = `[경기광업 일일 배차결과]\n`;
  m += `${d.date} (${d.dayName})\n\n`;
  m += `■ 총괄\n`;
  m += `- 출하 ${d.count}건 / ${d.totalWeight.toFixed(1)}톤\n`;
  m += `- 완료 ${d.completed}건 (${pct}%)\n`;
  m += `- 운송사 ${d.byCompany.length}개사\n\n`;
  if (d.byCompany.length) {
    m += `■ 운송사별\n`;
    for (const [name, v] of d.byCompany) m += `- ${name}: ${v.count}건 / ${v.weight.toFixed(1)}t\n`;
    m += `\n`;
  }
  if (d.byType.length) {
    m += `■ 운송유형별\n`;
    for (const [type, v] of d.byType) m += `- ${type}: ${v.count}건 / ${v.weight.toFixed(1)}t\n`;
  }
  m += `\n▶ 상세보기: https://smart-hml.vercel.app/daily-report`;
  return m;
}
