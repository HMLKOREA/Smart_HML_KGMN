/**
 * 일일 배차결과 보고 API
 * GET /api/daily-report?date=2026-06-20
 *
 * 반환: 해당일 출하 요약 (운송사별, 제품별, 거래처별)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE_SIZE = 1000;

/**
 * 페이지네이션으로 전체 행 조회 (Supabase 1000행 제한 우회)
 */
async function fetchAllRows<T = Record<string, unknown>>(
  table: string,
  columns: string,
  filters: { column: string; value: string }[],
  orderCol?: string,
  orderAsc = true,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let q = supabase
      .from(table)
      .select(columns)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    for (const f of filters) {
      q = q.eq(f.column, f.value);
    }
    if (orderCol) {
      q = q.order(orderCol, { ascending: orderAsc });
    }

    const { data, error } = await q;
    if (error) return { data: [], error };

    const rows = (data || []) as T[];
    all.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }

  return { data: all, error: null };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  try {
    // 1. 해당일 전체 출하
    const { data: shipments, error } = await fetchAllRows(
      'v_shipments',
      '*',
      [{ column: 'shipment_date', value: dateStr }],
      'shipment_date',
      true,
    );

    if (error) {
      // v_shipments 뷰가 없으면 직접 조인
      const { data: raw, error: rawError } = await fetchAllRows(
        'shipments',
        `*,
          transport_companies!shipments_company_id_fkey(name),
          customers!shipments_customer_id_fkey(name),
          products!shipments_product_id_fkey(name, code)`,
        [{ column: 'shipment_date', value: dateStr }],
        'created_at',
        true,
      );

      if (rawError) throw rawError;

      const mapped = (raw || []).map((s: Record<string, unknown>) => ({
        ...s,
        company_name: (s.transport_companies as Record<string, string>)?.name || '',
        customer_name: (s.customers as Record<string, string>)?.name || '',
        product_name: (s.products as Record<string, string>)?.name || '',
        product_code: (s.products as Record<string, string>)?.code || '',
      }));

      return NextResponse.json(buildReport(dateStr, mapped));
    }

    return NextResponse.json(buildReport(dateStr, shipments || []));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

interface ShipmentRow {
  company_name?: string;
  customer_name?: string;
  product_name?: string;
  transport_type?: string;
  weight_net?: number;
  status?: string;
  vehicle_number?: string;
  is_confirmed?: boolean;
  shipment_number?: string;
  [key: string]: unknown;
}

function buildReport(date: string, shipments: ShipmentRow[]) {
  const totalCount = shipments.length;
  const totalWeight = shipments.reduce((s, r) => s + (Number(r.weight_net) || 0), 0);
  const completedCount = shipments.filter(r => r.status === 'completed' || r.is_confirmed).length;

  // 운송사별 집계
  const byCompany = new Map<string, { count: number; weight: number }>();
  for (const s of shipments) {
    const name = s.company_name || '미지정';
    const prev = byCompany.get(name) || { count: 0, weight: 0 };
    byCompany.set(name, {
      count: prev.count + 1,
      weight: prev.weight + (Number(s.weight_net) || 0),
    });
  }

  // 제품별 집계
  const byProduct = new Map<string, { count: number; weight: number }>();
  for (const s of shipments) {
    const name = s.product_name || '미지정';
    const prev = byProduct.get(name) || { count: 0, weight: 0 };
    byProduct.set(name, {
      count: prev.count + 1,
      weight: prev.weight + (Number(s.weight_net) || 0),
    });
  }

  // 거래처별 집계
  const byCustomer = new Map<string, { count: number; weight: number }>();
  for (const s of shipments) {
    const name = s.customer_name || '미지정';
    const prev = byCustomer.get(name) || { count: 0, weight: 0 };
    byCustomer.set(name, {
      count: prev.count + 1,
      weight: prev.weight + (Number(s.weight_net) || 0),
    });
  }

  // 운송유형별
  const byType = new Map<string, { count: number; weight: number }>();
  for (const s of shipments) {
    const type = s.transport_type || '미지정';
    const prev = byType.get(type) || { count: 0, weight: 0 };
    byType.set(type, {
      count: prev.count + 1,
      weight: prev.weight + (Number(s.weight_net) || 0),
    });
  }

  const mapToArray = (m: Map<string, { count: number; weight: number }>) =>
    Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, weight: Math.round(v.weight * 100) / 100 }))
      .sort((a, b) => b.weight - a.weight);

  return {
    date,
    summary: {
      totalCount,
      totalWeight: Math.round(totalWeight * 100) / 100,
      completedCount,
      completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      companyCount: byCompany.size,
      customerCount: byCustomer.size,
    },
    byCompany: mapToArray(byCompany),
    byProduct: mapToArray(byProduct),
    byCustomer: mapToArray(byCustomer),
    byTransportType: mapToArray(byType),
    details: shipments.map(s => ({
      shipmentNumber: s.shipment_number,
      company: s.company_name,
      customer: s.customer_name,
      product: s.product_name,
      vehicle: s.vehicle_number,
      weight: Number(s.weight_net) || 0,
      type: s.transport_type,
      status: s.status,
    })),
  };
}
