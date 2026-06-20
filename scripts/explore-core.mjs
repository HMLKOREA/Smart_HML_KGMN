/**
 * 핵심 비즈니스 테이블만 상세 조회
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// .env.local 로드
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envContent = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq > 0 && !process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
} catch {}

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE, connectTimeout: 10000,
});

const coreTables = [
  'carr_mst',       // 운송사
  'custom_mst',     // 거래처
  'driver_mst',     // 기사
  'prod_code_mst',  // 제품코드
  'out_info',       // 출하 (21290건 - 핵심!)
  'unit_mst',       // 단가 (2361건)
  'member_mst',     // 사용자
  'code_mst',       // 코드
  'grade_form_11',  // 성적서 (440건)
  'weight_change_hist', // 계근 변경이력 (47983건)
];

for (const tbl of coreTables) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${tbl}]`);

  const [cols] = await conn.query(`DESCRIBE \`${tbl}\``);
  console.log('컬럼:', cols.map(c => `${c.Field}(${c.Type.split('(')[0]})`).join(', '));

  const [countRes] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
  console.log(`건수: ${countRes[0].cnt}`);

  const [rows] = await conn.query(`SELECT * FROM \`${tbl}\` LIMIT 2`);
  for (const r of rows) {
    console.log('  →', JSON.stringify(r));
  }
}

await conn.end();
