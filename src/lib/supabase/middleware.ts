import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 인증되지 않은 사용자를 로그인 페이지로 리다이렉트
  // 단, 데모 모드(클라이언트 localStorage)는 서버에서 확인 불가하므로
  // 클라이언트 측 useAuth에서 처리하도록 리다이렉트 하지 않음
  // 대신 클라이언트 DashboardLayout에서 !user 시 /login으로 라우팅
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/api')
  ) {
    // 데모모드 쿠키가 없으면 리다이렉트하지 않고 클라이언트에서 처리
    // (미들웨어에서 강제 리다이렉트 시 데모모드가 동작하지 않음)
    return supabaseResponse;
  }

  // 인증된 사용자가 로그인 페이지에 접근하면 대시보드로 리다이렉트
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
