/**
 * 사일로 현재고 조회 API (온디맨드 · 저장 안 함)
 *
 * 소스 모드 자동 전환:
 *   1) 벤더 API   — SILO_API_URL (+ SILO_API_KEY). 파라미터 없이 호출 → JSON.
 *                   확정 형식: [{ "타임스탬프":"YYYY-MM-DD hh:mm:ss.s", "호기번호":n, "중량":int }, ...]
 *                   (또는 { "타임스탬프":..., "1":중량, "2":중량, ... } 형태도 처리)
 *   2) SQL Server — SILO_DB_SERVER (UTongAdmin.hogiNN 직접 조회)
 *   3) 더미       — 미설정 시 샘플값
 *
 * 데이터 저장 없이 호출 시점 최신값만 반환. 3시간 초과 시 stale=true.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
const STALE_HOURS = 3;

// ── 사일로 마스터 (configsilo1.cfg 기준) ──
interface SiloMaster { no: number; product: string; max: number; table: string; field: 750 | 760; }
// max: 실제 용량(톤). 레거시 표시가 10배(850→85 등)라 담당자 확인값으로 보정.
const SILO_MASTER: SiloMaster[] = [
  { no: 1, product: 'K325', max: 85, table: 'hogi03', field: 750 },
  { no: 2, product: 'K100', max: 95, table: 'hogi03', field: 750 },
  { no: 3, product: 'K200', max: 85, table: 'hogi03', field: 750 },
  { no: 4, product: 'K10+K18', max: 108, table: 'hogi04', field: 760 },
  { no: 5, product: 'K18', max: 420, table: 'hogi02', field: 760 },
  { no: 6, product: 'K10', max: 100, table: 'hogi05', field: 760 },
  { no: 7, product: 'K50', max: 180, table: 'hogi01', field: 760 },
  { no: 8, product: 'K18', max: 260, table: 'hogi06', field: 760 },
  { no: 9, product: '원석350', max: 350, table: 'hogi22', field: 760 },
  { no: 10, product: '원석500', max: 500, table: 'hogi21', field: 760 },
];

interface Reading { weight: number | null; measuredAt: string | null; }

// 벤더 값은 실제 톤의 10배(예: SILO1=850 → 85.0톤). 담당자 확인값.
const API_WEIGHT_SCALE = 0.1;
// 벤더 호출 제한(1회/60초) — 전역 스냅샷 캐시 TTL
const SNAPSHOT_TTL_MS = 60_000;

// "YYYY-MM-DD hh:mm:ss.s" (KST 벽시계) → UTC ISO
const kstToIso = (t: string | null): string | null =>
  t ? new Date(String(t).trim().replace(' ', 'T') + '+09:00').toISOString() : null;
const scale = (v: unknown): number | null => {
  const n = Number(v);
  return isNaN(n) ? null : Math.round(n * API_WEIGHT_SCALE * 10) / 10;
};

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const mapToJson = (m: Map<number, Reading>) => Object.fromEntries([...m].map(([k, v]) => [k, v]));
const jsonToMap = (o: Record<string, Reading>): Map<number, Reading> =>
  new Map(Object.entries(o || {}).map(([k, v]) => [Number(k), v]));

function parseVendor(json: unknown): Map<number, Reading> {
  const map = new Map<number, Reading>();
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const measuredAt = kstToIso((o['TIMESTAMP'] ?? o['타임스탬프'] ?? o['timestamp'] ?? null) as string | null);
    for (const [k, v] of Object.entries(o)) {
      const m = /^SILO\s*(\d+)$/i.exec(k.trim());
      if (!m) continue;
      map.set(Number(m[1]), { weight: scale(v), measuredAt });
    }
  } else if (Array.isArray(json)) {
    for (const row of json as Record<string, unknown>[]) {
      const hopper = Number(row['호기번호'] ?? row['hopper'] ?? row['silo'] ?? row['no']);
      const measuredAt = kstToIso((row['타임스탬프'] ?? row['timestamp'] ?? null) as string | null);
      if (!isNaN(hopper)) map.set(hopper, { weight: scale(row['중량'] ?? row['weight'] ?? row['value']), measuredAt });
    }
  }
  return map;
}

/**
 * 1안: 벤더 REST API (비즈에이앤씨) — 전역 스냅샷 캐시로 호출제한(1회/60초) 준수.
 *   응답: { "TIMESTAMP":"YYYY-MM-DD hh:mm:ss.s", "SILO1":중량, ... "SILO10":중량 }
 *   여러 서버 인스턴스가 Supabase silo_snapshot 한 행을 공유 → 60초에 최대 1회만 벤더 호출.
 */
async function fromApi(): Promise<Map<number, Reading> | null> {
  const url = process.env.SILO_API_URL;
  if (!url) return null;
  const sb = sbAdmin();

  // 1) 공유 스냅샷 확인 (신선하면 그대로 사용)
  type Snap = { readings: Record<string, Reading>; fetched_at: string };
  let snap: Snap | null = null;
  if (sb) {
    const { data } = await sb.from('silo_snapshot').select('readings, fetched_at').eq('id', 1).maybeSingle();
    if (data) snap = data as unknown as Snap;
  }
  if (snap && Date.now() - new Date(snap.fetched_at).getTime() < SNAPSHOT_TTL_MS) {
    return jsonToMap(snap.readings);
  }

  // 2) 벤더 호출
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.SILO_API_KEY) headers['X-API-Key'] = process.env.SILO_API_KEY;
  try {
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) throw new Error(`벤더 API 오류 HTTP ${res.status}`);
    const json = await res.json();
    const map = parseVendor(json);
    if (map.size === 0) throw new Error('벤더 응답 파싱 실패');
    if (sb) await sb.from('silo_snapshot').upsert({ id: 1, readings: mapToJson(map), fetched_at: new Date().toISOString() });
    return map;
  } catch (e) {
    // 429/오류 → 마지막 스냅샷 유지(더미로 떨어지지 않음). 없으면 상위에서 더미.
    if (snap) return jsonToMap(snap.readings);
    throw e;
  }
}

/** 2안: SQL Server(UTongAdmin.hogiNN) 직접 조회 */
async function fromSqlServer(): Promise<Map<number, Reading> | null> {
  const server = process.env.SILO_DB_SERVER;
  if (!server) return null;
  const modName = 'mssql';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;
  try { sql = (await import(/* webpackIgnore: true */ modName)).default; }
  catch { throw new Error('mssql 미설치 — DB 모드에는 mssql 필요'); }
  const pool = await sql.connect({
    server: server.split(',')[0], port: Number(server.split(',')[1] || process.env.SILO_DB_PORT || 1433),
    database: process.env.SILO_DB_NAME || 'UTongAdmin', user: process.env.SILO_DB_USER || '', password: process.env.SILO_DB_PASS || '',
    options: { trustServerCertificate: true, encrypt: false }, connectionTimeout: 8000, requestTimeout: 8000,
  });
  // 테이블별 최신 1행 조회 후, 각 사일로가 자기 field(750/760) 값 사용
  const byTable = new Map<string, { d750: number | null; d760: number | null; t: string | null }>();
  for (const t of [...new Set(SILO_MASTER.map(s => s.table))]) {
    try {
      const q = await pool.request().query(`SELECT TOP 1 CR_TIME, D000750, D000760 FROM [${t}] ORDER BY IDENTITY_COLUMN DESC`);
      const r = q.recordset[0] || {};
      byTable.set(t, { d750: r.D000750 != null ? Number(r.D000750) : null, d760: r.D000760 != null ? Number(r.D000760) : null, t: r.CR_TIME ?? null });
    } catch { byTable.set(t, { d750: null, d760: null, t: null }); }
  }
  await pool.close();
  const map = new Map<number, Reading>();
  for (const s of SILO_MASTER) {
    const r = byTable.get(s.table);
    map.set(s.no, { weight: r ? (s.field === 750 ? r.d750 : r.d760) : null, measuredAt: r?.t ?? null });
  }
  return map;
}

/** 3안: 더미 */
function dummy(): Map<number, Reading> {
  const map = new Map<number, Reading>();
  const now = new Date().toISOString();
  const fill: Record<number, number> = { 1: 0.62, 2: 0.78, 3: 0.41, 4: 0.9, 5: 0.55, 6: 0.33, 7: 0.7, 8: 0.85, 9: 0.48, 10: 0.6 };
  for (const s of SILO_MASTER) map.set(s.no, { weight: Math.round(s.max * (fill[s.no] ?? 0.5) * 10) / 10, measuredAt: now });
  return map;
}

export async function GET() {
  let source = 'dummy';
  let readings: Map<number, Reading> | null = null;
  let warn: string | null = null;
  try {
    readings = await fromApi();
    if (readings) source = 'api';
    else { readings = await fromSqlServer(); if (readings) source = 'db'; }
  } catch (e) { warn = e instanceof Error ? e.message : String(e); }
  if (!readings) { readings = dummy(); source = 'dummy'; }

  const nowMs = Date.now();
  const silos = SILO_MASTER.map(s => {
    const rd = readings!.get(s.no);
    const weight = rd?.weight ?? null;
    const measuredAt = rd?.measuredAt ?? null;
    const pct = weight != null && s.max > 0 ? Math.min(100, Math.round((weight / s.max) * 100)) : null;
    const ageH = measuredAt ? (nowMs - new Date(measuredAt).getTime()) / 3.6e6 : null;
    return { no: s.no, product: s.product, max: s.max, table: s.table, field: s.field, weight, pct, measuredAt, stale: ageH == null ? true : ageH > STALE_HOURS };
  });

  return NextResponse.json({ source, warn, staleHours: STALE_HOURS, silos, fetchedAt: new Date().toISOString() });
}
