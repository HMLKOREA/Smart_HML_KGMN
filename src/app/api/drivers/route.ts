import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const companyId = searchParams.get('company_id');
  const activeOnly = searchParams.get('active_only') !== 'false';

  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;
  let totalCount = 0;

  while (hasMore) {
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;
    let query = supabase
      .from('v_drivers')
      .select('*', page === 0 ? { count: 'exact' } : {})
      .range(start, end);

    if (activeOnly) query = query.eq('is_active', true);
    if (companyId) query = query.eq('company_id', companyId);
    if (search) {
      query = query.or(`name.ilike.%${search}%,vehicle_number.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%`);
    }

    query = query.order('name');
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

  const { data, error } = await supabase
    .from('drivers')
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

  const { data, error } = await supabase
    .from('drivers')
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

  const { error } = await supabase.from('drivers').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
