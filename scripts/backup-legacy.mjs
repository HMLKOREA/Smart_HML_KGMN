/**
 * 레거시(MySQL) 전체 백업 — 모든 테이블을 JSON으로 덤프 → zip → 매뉴얼\backups.
 * 실행: node scripts/backup-legacy.mjs
 */
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of env.split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
} catch { /* env */ }

const MYSQL = { host: process.env.MYSQL_HOST || '127.0.0.1', port: +(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE };
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
const backupsDir = path.join(process.env.USERPROFILE || 'C:\\Users\\gufid', 'OneDrive', '바탕 화면', 'KGMN_Newprogram', 'SmartHML_매뉴얼', 'backups');
fs.mkdirSync(backupsDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy_bak_'));

const conn = await mysql.createConnection(MYSQL);
const [tbls] = await conn.query(
  `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?`, [MYSQL.database]);
const results = [];
for (const { t } of tbls) {
  try {
    const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
    fs.writeFileSync(path.join(tmp, `${t}.json`), JSON.stringify(rows));
    results.push({ table: t, count: rows.length });
    console.log(`  ${t}: ${rows.length}건`);
  } catch (e) { results.push({ table: t, error: String(e.message) }); console.log(`  ${t}: 오류(${e.message})`); }
}
await conn.end();

fs.writeFileSync(path.join(tmp, '_manifest.json'), JSON.stringify({ created_at: now.toISOString(), db: MYSQL.database, host: MYSQL.host, tables: results }, null, 2));
const tmpZip = path.join(tmp, `legacy_backup_${stamp}.zip`);
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${tmp}\\*.json' -DestinationPath '${tmpZip}' -Force`], { stdio: 'inherit' });
const finalZip = path.join(backupsDir, `legacy_backup_${stamp}.zip`);
fs.copyFileSync(tmpZip, finalZip);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
const total = results.reduce((s, r) => s + (r.count || 0), 0);
console.log(`\n✅ 레거시 백업 완료: ${finalZip}`);
console.log(`   테이블 ${results.length}개 · 총 ${total.toLocaleString()}행 · ${Math.round(fs.statSync(finalZip).size / 1024 / 1024 * 10) / 10}MB`);
