/**
 * 컷오버 전체 백업 — Supabase 전 테이블을 JSON으로 덤프 → zip → 매뉴얼\backups 에 저장.
 *
 * 실행: node --env-file=.env.local scripts/backup-supabase.mjs
 * 필요 env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 한글 경로(바탕 화면\...\SmartHML_매뉴얼\backups) 문제 회피:
 *  - PowerShell 압축은 ASCII 임시경로에서만 수행, 최종 zip은 Node fs로 한글 폴더에 복사.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('환경변수 없음(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const TABLES = [
  'customers', 'customer_products', 'products', 'unit_prices', 'transport_companies',
  'user_profiles', 'drivers', 'shipments', 'shipment_pods', 'production_schedules',
  'production_logs', 'production_workers', 'tonbag_stock_checks', 'silo_snapshot', 'silo_tonbags',
  'settlement_closings', 'settlement_details', 'settlements', 'quality_reports',
  'deliveries', 'dispatches', 'app_activity_logs', 'system_logs', 'sync_status', 'country_codes',
];

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

// 최종 백업 폴더(한글 경로) — Node fs는 UTF-8 경로 정상 처리
const backupsDir = path.join(process.env.USERPROFILE || 'C:\\Users\\gufid', 'OneDrive', '바탕 화면', 'KGMN_Newprogram', 'SmartHML_매뉴얼', 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

// ASCII 임시 작업 폴더
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smarthml_bak_'));

async function dumpTable(name) {
  const PAGE = 1000; let from = 0; let all = []; let more = true;
  while (more) {
    const { data, error } = await sb.from(name).select('*').range(from, from + PAGE - 1);
    if (error) { return { name, error: error.message, count: 0 }; }
    all = all.concat(data || []);
    more = (data || []).length === PAGE; from += PAGE;
  }
  fs.writeFileSync(path.join(tmp, `${name}.json`), JSON.stringify(all));
  return { name, count: all.length };
}

const results = [];
for (const t of TABLES) {
  process.stdout.write(`  ${t} … `);
  const r = await dumpTable(t);
  results.push(r);
  console.log(r.error ? `건너뜀(${r.error})` : `${r.count}건`);
}

const manifest = { created_at: now.toISOString(), stamp, source: URL, tables: results };
fs.writeFileSync(path.join(tmp, '_manifest.json'), JSON.stringify(manifest, null, 2));

// 압축(ASCII 경로에서만)
const tmpZip = path.join(tmp, `smarthml_backup_${stamp}.zip`);
execFileSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${tmp}\\*.json' -DestinationPath '${tmpZip}' -Force`], { stdio: 'inherit' });

// 최종 한글 폴더로 복사
const finalZip = path.join(backupsDir, `smarthml_backup_${stamp}.zip`);
fs.copyFileSync(tmpZip, finalZip);

// 임시 정리
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }

const totalRows = results.reduce((s, r) => s + (r.count || 0), 0);
const sizeMB = Math.round(fs.statSync(finalZip).size / 1024 / 1024 * 10) / 10;
console.log(`\n✅ 백업 완료: ${finalZip}`);
console.log(`   테이블 ${results.length}개 · 총 ${totalRows.toLocaleString()}행 · ${sizeMB}MB`);
