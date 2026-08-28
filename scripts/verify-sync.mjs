/**
 * 레거시(out_info) ↔ 신규(Supabase shipments) 최종 대조.
 * 실행: node scripts/verify-sync.mjs [FROM] [TO]   (기본: 최근 12일)
 */
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* use env */ }

const MYSQL = { host: process.env.MYSQL_HOST || '127.0.0.1', port: +(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE };
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const d0 = new Date(); d0.setDate(d0.getDate() - 12);
const FROM = args[0] || d0.toISOString().slice(0, 10);
const TO = args[1] || '2026-12-31';
const nd = (v) => v ? String(v).slice(0, 10) : null;

const conn = await mysql.createConnection(MYSQL);
const [rows] = await conn.query(
  `SELECT uid, DATE_FORMAT(out_date,'%Y-%m-%d') od, car_no, car_type, silo_no, weight, out_time, out_yn
   FROM out_info WHERE out_date BETWEEN ? AND ? ORDER BY uid`, [FROM, TO]);
await conn.end();

// Supabase 해당 구간
let sbRows = []; let pg = 0; const P = 1000; let more = true;
while (more) {
  const { data } = await sb.from('shipments')
    .select('shipment_number, shipment_date, vehicle_number, silo, weight_net, certificate_time, is_shipped')
    .gte('shipment_date', FROM).lte('shipment_date', TO).range(pg * P, pg * P + P - 1);
  sbRows = sbRows.concat(data || []); more = (data || []).length === P; pg++;
}
const sbMap = new Map(sbRows.map(r => [r.shipment_number, r]));

let missing = 0, dateM = 0, vehM = 0, certM = 0, siloM = 0, wM = 0, ok = 0;
const samples = [];
for (const r of rows) {
  const sn = `OUT-${r.uid}`;
  const s = sbMap.get(sn);
  if (!s) { missing++; if (samples.length < 15) samples.push(`누락 ${sn} ${r.od} ${r.car_no || ''}`); continue; }
  let bad = false;
  if (nd(s.shipment_date) !== r.od) { dateM++; bad = true; }
  if ((s.vehicle_number || '') !== (r.car_no || '')) { vehM++; bad = true; }
  const legCert = !!r.out_time, sbCert = !!s.certificate_time;
  if (legCert !== sbCert) { certM++; bad = true; }
  if ((s.silo || '') !== (r.silo_no || '')) { siloM++; }
  const lw = r.weight ? parseFloat(r.weight) : null, sw = s.weight_net != null ? parseFloat(s.weight_net) : null;
  if ((lw || 0) !== (sw || 0)) { wM++; }
  if (bad && samples.length < 15) samples.push(`불일치 ${sn} ${r.od}|${nd(s.shipment_date)} veh:${r.car_no || '-'}|${s.vehicle_number || '-'} cert:${legCert}|${sbCert}`);
  if (!bad) ok++;
}

console.log(`\n=== 대조 결과 (${FROM} ~ ${TO}) ===`);
console.log(`레거시 out_info: ${rows.length}건 / Supabase 해당구간: ${sbRows.length}건`);
console.log(`핵심(날짜·차량·출하증) 일치: ${ok}건`);
console.log(`누락(신규에 없음): ${missing}`);
console.log(`날짜 불일치: ${dateM} · 차량번호 불일치: ${vehM} · 출하증유무 불일치: ${certM}`);
console.log(`(참고) 사일로 표기차: ${siloM} · 계근값차: ${wM}`);
if (samples.length) { console.log('\n--- 샘플 ---'); samples.forEach(s => console.log('  ' + s)); }
