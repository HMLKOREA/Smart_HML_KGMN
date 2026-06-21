import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const companyId = searchParams.get('company_id');

  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;
  let totalCount = 0;

  while (hasMore) {
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;
    let query = supabase
      .from('v_settlements')
      .select('*', page === 0 ? { count: 'exact' } : {})
      .range(start, end);

    if (startDate) query = query.gte('settlement_date', startDate);
    if (endDate) query = query.lte('settlement_date', endDate);
    if (status) query = query.eq('status', status);
    if (companyId) query = query.eq('company_id', companyId);
    if (search) {
      query = query.or(
        `settlement_number.ilike.%${search}%,company_name.ilike.%${search}%`
      );
    }

    query = query.order('settlement_date', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (page === 0 && count != null) totalCount = count;
    const rows = data || [];
    allData = [...allData, ...rows];
    hasMore = rows.length === PAGE_SIZE;
    page++;
  }

  return NextResponse.json({ success: true, data: allData, total: totalCount });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    body.created_by = user.id;
  }

  // 세액 및 최종금액 자동 계산
  if (body.total_amount) {
    body.tax_amount = body.tax_amount ?? Math.round(body.total_amount * 0.1);
    body.final_amount = body.total_amount + body.tax_amount;
  }

  const { data, error } = await supabase
    .from('settlements')
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;

  // 세액 및 최종금액 자동 재계산
  if (updates.total_amount) {
    updates.tax_amount = updates.tax_amount ?? Math.round(updates.total_amount * 0.1);
    updates.final_amount = updates.total_amount + updates.tax_amount;
  }

  const { data, error } = await supabase
    .from('settlements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'ID가 필요합니다' }, { status: 400 });
  }

  // 정산상세도 함께 삭제 (CASCADE)
  const { error } = await supabase.from('settlements').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
