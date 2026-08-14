/**
 * 레거시 MySQL → Supabase 증분 동기화 (클라우드 크론)
 * Vercel Cron이 vercel.json 스케줄에 따라 호출한다. PC 의존 없음.
 * 보안: CRON_SECRET 설정 시 Authorization: Bearer <secret> 검증.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
  const started = Date.now();
  try {
    const mod = await import('../../../../../scripts/sync-mysql-to-supabase.mjs');
    await mod.runSync(true); // 증분(delta)
    return Response.json({ ok: true, ms: Date.now() - started, at: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg, ms: Date.now() - started }, { status: 500 });
  }
}
