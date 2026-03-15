import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let isConfigured = false;

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'your_supabase_url_here' && key && key !== 'your_supabase_anon_key_here');
}

export function createClient(): SupabaseClient {
  if (client) return client;

  if (!isSupabaseConfigured()) {
    // Supabase 미설정 시 더미 클라이언트 반환 (캐시)
    isConfigured = false;
    client = createDummyClient();
    return client;
  }

  isConfigured = true;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}

// Supabase 미설정 시 에러 없이 동작하는 더미 클라이언트
function createDummyClient(): SupabaseClient {
  const noopQuery = () => ({
    select: () => noopQuery(),
    insert: () => noopQuery(),
    update: () => noopQuery(),
    delete: () => noopQuery(),
    eq: () => noopQuery(),
    neq: () => noopQuery(),
    gte: () => noopQuery(),
    lte: () => noopQuery(),
    or: () => noopQuery(),
    in: () => noopQuery(),
    is: () => noopQuery(),
    not: () => noopQuery(),
    order: () => noopQuery(),
    range: () => noopQuery(),
    limit: () => noopQuery(),
    single: () => noopQuery(),
    then: (resolve: (value: { data: null; error: null; count: 0 }) => void) => {
      resolve({ data: null, error: null, count: 0 });
    },
    data: null,
    error: null,
    count: 0,
  });

  return {
    from: () => noopQuery(),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase가 설정되지 않았습니다.' } }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      admin: {
        createUser: async () => ({ data: { user: null }, error: { message: 'Supabase가 설정되지 않았습니다.' } }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
  } as unknown as SupabaseClient;
}

export { isConfigured };
