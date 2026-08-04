/**
 * 사일로 현재고 조회 API (온디맨드 · 저장 안 함)
 *
 * 3가지 소스 모드 자동 전환:
 *   1) 벤더 API   — SILO_API_URL (+ SILO_API_KEY) 설정 시
 *   2) SQL Server — SILO_DB_SERVER 등 설정 시 (UTongAdmin hogiNN 직접 조회)
 *   3) 더미       — 위 둘 다 없으면 샘플값 (화면 개발/미연동 상태)
 *
 * 데이터를 저장하지 않고 호출 시점의 최신값만 반환.
 * 스키마(분석 확정): hogi01~22, 컬럼 CR_TIME·D000750·D000760·IDENTITY_COLUMN,
 * 현재고 = SELECT TOP 1 ... ORDER BY IDENTITY_COLUMN DESC, 재고율 = weight/max×100.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const STALE_HOURS = 3;

// ── 사일로 마스터 (configsilo1.cfg 기준) ──
interface SiloMaster { no: number; product: string; max: number; table: string; field: 750 | 760; }
const SILO_MASTER: SiloMaster[] = [
  { no: 1, product: 'K325', max: 850, table: 'hogi03', field: 750 },
  { no: 2, product: 'K100', max: 950, table: 'hogi03', field: 750 },
  { no: 3, product: 'K200', max: 850, table: 'hogi03', field: 750 },
  { no: 4, product: 'K10+K18', max: 1080, table: 'hogi04', field: 760 },
  { no: 5, product: 'K18', max: 4200, table: 'hogi02', field: 760 },
  { no: 6, product: 'K10', max: 1000, table: 'hogi05', field: 760 },
  { no: 7, product: 'K50', max: 1800, table: 'hogi01', field: 760 },
  { no: 8, product: 'K18', max: 2600, table: 'hogi06', field: 760 },
  { no: 9, product: '원석350', max: 3500, table: 'hogi22', field: 760 },
  { no: 10, product: '원석500', max: 5000, table: 'hogi21', field: 760 },
];

// 테이블별 최신 판독값 (D000750/D000760 + 시각)
interface Reading { d750: number | null; d760: number | null; measuredAt: string | null; }

/** 1안: 벤더 REST API — 사일로별 현재고 반환 */
async function fromApi(): Promise<Map<string, Reading> | null> {
  const url = process.env.SILO_API_URL;
  if (!url) return null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.SILO_API_KEY) headers.Authorization = `Bearer ${process.env.SILO_API_KEY}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`벤더 API 오류 HTTP ${res.status}`);
  // 기대 형식: [{ table|hopper, d750?, d760?, weight?, measuredAt|cr_time }]
  const rows = (await res.json()) as Record<string, unknown>[];
  const map = new Map<string, Reading>();
  for (const r of rows) {
    const key = String(r.table ?? r.hopper ?? '').toLowerCase();
    if (!key) continue;
    const w = r.weight != null ? Number(r.weight) : null;
    map.set(key, {
      d750: r.d750 != null ? Number(r.d750) : w,
      d760: r.d760 != null ? Number(r.d760) : w,
      measuredAt: (r.measuredAt ?? r.cr_time ?? r.time ?? null) as string | null,
    });
  }
  return map;
}

/** 2안: SQL Server(UTongAdmin.hogiNN) 직접 조회 — 정식 계정 확보 시 활성화 */
async function fromSqlServer(): Promise<Map<string, Reading> | null> {
  const server = process.env.SILO_DB_SERVER;
  if (!server) return null;
  // mssql 은 선택적 의존성 — 타입 미설치라 동적 문자열 import로 타입검사 우회
  const modName = 'mssql';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;
  try { sql = (await import(/* webpackIgnore: true */ modName)).default; }
  catch { throw new Error('mssql 미설치 — DB 모드에는 mssql 필요'); }
  const pool = await sql.connect({
    server: server.split(',')[0],
    port: Number(server.split(',')[1] || process.env.SILO_DB_PORT || 1433),
    database: process.env.SILO_DB_NAME || 'UTongAdmin',
    user: process.env.SILO_DB_USER || '',
    password: process.env.SILO_DB_PASS || '',
    options: { trustServerCertificate: true, encrypt: false },
    connectionTimeout: 8000, requestTimeout: 8000,
  });
  const map = new Map<string, Reading>();
  const tables = [...new Set(SILO_MASTER.map(s => s.table))];
  for (const t of tables) {
    try {
      const q = await pool.request().query(
        `SELECT TOP 1 CR_TIME, D000750, D000760 FROM [${t}] ORDER BY IDENTITY_COLUMN DESC`);
      const r = q.recordset[0] || {};
      map.set(t.toLowerCase(), {
        d750: r.D000750 != null ? Number(r.D000750) : null,
        d760: r.D000760 != null ? Number(r.D000760) : null,
        measuredAt: r.CR_TIME ?? null,
      });
    } catch { map.set(t.toLowerCase(), { d750: null, d760: null, measuredAt: null }); }
  }
  await pool.close();
  return map;
}

/** 3안: 더미 (미연동 시 화면 동작용) */
function dummy(): Map<string, Reading> {
  const map = new Map<string, Reading>();
  const now = new Date().toISOString();
  const fill: Record<number, number> = { 1: 0.62, 2: 0.78, 3: 0.41, 4: 0.9, 5: 0.55, 6: 0.33, 7: 0.7, 8: 0.85, 9: 0.48, 10: 0.6 };
  for (const s of SILO_MASTER) {
    const w = Math.round(s.max * (fill[s.no] ?? 0.5));
    const prev = map.get(s.table.toLowerCase());
    map.set(s.table.toLowerCase(), {
      d750: s.field === 750 ? w : (prev?.d750 ?? null),
      d760: s.field === 760 ? w : (prev?.d760 ?? null),
      measuredAt: now,
    });
  }
  return map;
}

export async function GET() {
  let source = 'dummy';
  let readings: Map<string, Reading> | null = null;
  let warn: string | null = null;
  try {
    readings = await fromApi();
    if (readings) source = 'api';
    else { readings = await fromSqlServer(); if (readings) source = 'db'; }
  } catch (e) { warn = e instanceof Error ? e.message : String(e); }
  if (!readings) { readings = dummy(); source = 'dummy'; }

  const nowMs = Date.now();
  const silos = SILO_MASTER.map(s => {
    const rd = readings!.get(s.table.toLowerCase());
    const weight = rd ? (s.field === 750 ? rd.d750 : rd.d760) : null;
    const measuredAt = rd?.measuredAt ?? null;
    const pct = weight != null && s.max > 0 ? Math.min(100, Math.round((weight / s.max) * 100)) : null;
    const ageH = measuredAt ? (nowMs - new Date(measuredAt).getTime()) / 3.6e6 : null;
    return { no: s.no, product: s.product, max: s.max, table: s.table, field: s.field, weight, pct, measuredAt, stale: ageH == null ? true : ageH > STALE_HOURS };
  });

  return NextResponse.json({ source, warn, staleHours: STALE_HOURS, silos, fetchedAt: new Date().toISOString() });
}
