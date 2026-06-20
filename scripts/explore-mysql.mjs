/**
 * MySQL 원본 DB 탐색 스크립트
 * 테이블 구조 + 샘플 데이터 조회
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

console.log('=== MySQL 연결 성공 ===\n');

// 1. 전체 테이블 목록
const [tables] = await conn.query('SHOW TABLES');
console.log(`테이블 수: ${tables.length}`);
for (const t of tables) {
  const name = Object.values(t)[0];
  const [countRes] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${name}\``);
  console.log(`  ${name}: ${countRes[0].cnt}건`);
}

console.log('\n=== 주요 테이블 구조 ===\n');

// 2. 주요 테이블 컬럼 확인
const keyTables = tables.map(t => Object.values(t)[0]);
for (const tbl of keyTables) {
  const [cols] = await conn.query(`DESCRIBE \`${tbl}\``);
  console.log(`\n[${tbl}]`);
  for (const c of cols) {
    console.log(`  ${c.Field} (${c.Type}) ${c.Key === 'PRI' ? 'PK' : ''} ${c.Null === 'NO' ? 'NOT NULL' : ''}`);
  }
  // 샘플 3건
  const [rows] = await conn.query(`SELECT * FROM \`${tbl}\` LIMIT 3`);
  if (rows.length > 0) {
    console.log(`  샘플:`, JSON.stringify(rows[0]).substring(0, 200));
  }
}

await conn.end();
console.log('\n=== 완료 ===');
