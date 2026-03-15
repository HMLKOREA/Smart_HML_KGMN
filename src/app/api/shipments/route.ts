import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('page_size') || '50');

  let query = supabase.from('v_shipments').select('*', { count: 'exact' });

  if (startDate) query = query.gte('shipment_date', startDate);
  if (endDate) query = query.lte('shipment_date', endDate);
  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(
      `shipment_number.ilike.%${search}%,customer_name.ilike.%${search}%,product_name.ilike.%${search}%,driver_name.ilike.%${search}%,vehicle_number.ilike.%${search}%`
    );
  }

  const from = (page - 1) * pageSize;
  query = query.order('shipment_date', { ascending: false }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data,
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    body.created_by = user.id;
  }

  const { data, error } = await supabase
    .from('shipments')
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
