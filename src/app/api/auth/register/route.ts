import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient();
    const { email, password, name, role, company_id, phone } = await request.json();

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { success: false, error: '필수 항목이 누락되었습니다.' },
        { status: 400 }
      );
    }

    // Supabase Auth로 사용자 생성
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json(
        { success: false, error: `계정 생성 실패: ${authError.message}` },
        { status: 500 }
      );
    }

    // user_profiles에 프로필 등록
    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: authData.user.id,
      email,
      name,
      role,
      company_id: company_id || null,
      phone: phone || null,
      is_active: true,
    });

    if (profileError) {
      // 프로필 생성 실패 시 Auth 사용자도 삭제
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { success: false, error: `프로필 생성 실패: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { id: authData.user.id, email, name, role } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    );
  }
}
