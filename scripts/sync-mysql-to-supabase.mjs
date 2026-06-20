#!/usr/bin/env node
/**
 * MySQL → Supabase 실시간 동기화 스크립트
 *
 * 기능:
 * 1. MySQL 원본 DB에서 데이터 조회
 * 2. Supabase에 upsert (이름 기반 매핑)
 * 3. 증분 동기화 (updated_at 기준)
 * 4. --cron 옵션으로 매시간 자동 실행 가능
 *
 * 사용법:
 *   node scripts/sync-mysql-to-supabase.mjs          # 전체 동기화
 *   node scripts/sync-mysql-to-supabase.mjs --delta   # 증분만 (최근 2시간)
 *   node scripts/sync-mysql-to-supabase.mjs --cron    # 매시간 반복
 */

import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── .env.local 로드 ──────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = resolve(__dirname, '..', '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* .env.local 없으면 환경변수 사용 */ }

// ─── 설정 ──────────────────────────────────────────
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || '',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || '',
  connectTimeout: 15000,
  charset: 'utf8mb4',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

const isDelta = process.argv.includes('--delta');
const isCron = process.argv.includes('--cron');

// ─── 유틸 ──────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString().slice(0, 19)}] ${msg}`);
}

function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

/** out_date 정규화 — 전각문자, 불완전 날짜 등 보정 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // 전각 → 반각 변환
  let s = dateStr.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[－]/g, '-');
  // YYYY-MM-DD 형식 확인
  const match = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  // MM-DD만 있으면 올해로 보정
  const mmdd = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mmdd) return `${new Date().getFullYear()}-${mmdd[1].padStart(2, '0')}-${mmdd[2].padStart(2, '0')}`;
  return null;
}

// ─── ID 매핑 캐시 ──────────────────────────────────
const cache = {
  companies: new Map(),   // mysql uid → supabase uuid
  customers: new Map(),   // mysql uid → supabase uuid
  products: new Map(),    // mysql code → supabase uuid
  drivers: new Map(),     // mysql uid → supabase uuid
};

async function buildMappingCache(mysqlConn) {
  log('매핑 캐시 구축 중...');

  // 1. 운송사: carr_mst.uid → transport_companies.id (이름 매칭)
  const [mysqlCarrs] = await mysqlConn.query('SELECT uid, cp_name FROM carr_mst');
  const { data: sbCompanies } = await supabase.from('transport_companies').select('id, name');
  for (const mc of mysqlCarrs) {
    const match = (sbCompanies || []).find(c => c.name === mc.cp_name);
    if (match) cache.companies.set(String(mc.uid), match.id);
  }
  log(`  운송사 매핑: ${cache.companies.size}/${mysqlCarrs.length}`);

  // 2. 제품: prod_code_mst.code → products.id (코드 매칭)
  const [mysqlProds] = await mysqlConn.query('SELECT code, name FROM prod_code_mst');
  const { data: sbProducts } = await supabase.from('products').select('id, code, name');
  for (const mp of mysqlProds) {
    const match = (sbProducts || []).find(p => p.code === mp.code);
    if (match) cache.products.set(mp.code, match.id);
  }
  log(`  제품 매핑: ${cache.products.size}/${mysqlProds.length}`);

  // 3. 거래처: custom_mst.uid → customers.id (이름 매칭)
  const [mysqlCusts] = await mysqlConn.query('SELECT uid, cp_name, cus_code FROM custom_mst');
  const { data: sbCustomers } = await supabase.from('customers').select('id, name, customer_code');
  for (const mc of mysqlCusts) {
    const match = (sbCustomers || []).find(c => c.name === mc.cp_name);
    if (match) cache.customers.set(String(mc.uid), match.id);
  }
  log(`  거래처 매핑: ${cache.customers.size}/${mysqlCusts.length}`);

  // 4. 기사: driver_mst.uid → drivers.id (이름+전화번호 매칭)
  const [mysqlDrivers] = await mysqlConn.query('SELECT uid, name, phone, car_no FROM driver_mst');
  const { data: sbDrivers } = await supabase.from('drivers').select('id, name, phone, vehicle_number');
  for (const md of mysqlDrivers) {
    const match = (sbDrivers || []).find(d => d.name === md.name && d.vehicle_number === md.car_no);
    if (match) cache.drivers.set(String(md.uid), match.id);
  }
  log(`  기사 매핑: ${cache.drivers.size}/${mysqlDrivers.length}`);
}

// ─── 1. 운송사 동기화 ──────────────────────────────
async function syncCompanies(conn) {
  log('── 운송사 동기화 ──');
  const [rows] = await conn.query('SELECT * FROM carr_mst');

  for (const r of rows) {
    const existing = [...cache.companies.entries()].find(([k]) => k === String(r.uid));
    if (existing) continue; // 이미 매핑됨

    const record = {
      name: r.cp_name,
      business_number: r.biz_no || null,
      address: r.addr || null,
      account_number: r.acc_no || null,
      representative_name: r.ow_name || null,
      phone: r.ow_phone || null,
      email: r.ow_email || null,
      dispatch_manager: r.cmng_name || null,
      business_manager: r.bmng_name || null,
      default_vehicle_type: r.car_type || null,
      is_active: true,
    };

    const { data, error } = await supabase.from('transport_companies')
      .upsert(record, { onConflict: 'name', ignoreDuplicates: false })
      .select('id')
      .single();

    if (error) {
      // name에 unique 제약이 없으면 insert
      const { data: ins } = await supabase.from('transport_companies').insert(record).select('id').single();
      if (ins) cache.companies.set(String(r.uid), ins.id);
    } else if (data) {
      cache.companies.set(String(r.uid), data.id);
    }
  }
  log(`  운송사 동기화 완료: ${cache.companies.size}건`);
}

// ─── 2. 거래처 동기화 ──────────────────────────────
async function syncCustomers(conn) {
  log('── 거래처 동기화 ──');
  const [rows] = await conn.query('SELECT * FROM custom_mst');
  let created = 0, updated = 0;

  for (const r of rows) {
    const record = {
      name: r.cp_name,
      contact_email: r.mng_email || null,
      address: r.addr || null,
      transport_type: r.carr_gubun_cd || null,
      customer_code: r.cus_code || null,
      warehouse_code: r.storage_code || null,
      default_product_id: cache.products.get(r.prod_code) || null,
      is_active: true,
    };

    const existingId = cache.customers.get(String(r.uid));
    if (existingId) {
      await supabase.from('customers').update(record).eq('id', existingId);
      updated++;
    } else {
      const { data } = await supabase.from('customers').insert(record).select('id').single();
      if (data) {
        cache.customers.set(String(r.uid), data.id);
        created++;
      }
    }
  }
  log(`  거래처: 신규 ${created}, 갱신 ${updated}`);
}

// ─── 3. 기사 동기화 ────────────────────────────────
async function syncDrivers(conn) {
  log('── 기사 동기화 ──');
  const [rows] = await conn.query('SELECT * FROM driver_mst');
  let created = 0, updated = 0;

  for (const r of rows) {
    const record = {
      name: r.name,
      phone: r.phone || null,
      vehicle_number: r.car_no || null,
      company_id: cache.companies.get(String(r.carr_uid)) || null,
      is_active: true,
    };

    const existingId = cache.drivers.get(String(r.uid));
    if (existingId) {
      await supabase.from('drivers').update(record).eq('id', existingId);
      updated++;
    } else {
      const { data } = await supabase.from('drivers').insert(record).select('id').single();
      if (data) {
        cache.drivers.set(String(r.uid), data.id);
        created++;
      }
    }
  }
  log(`  기사: 신규 ${created}, 갱신 ${updated}`);
}

// ─── 4. 출하 동기화 (핵심!) ────────────────────────
async function syncShipments(conn) {
  log('── 출하 동기화 ──');

  // 기존 shipment_number로 매핑 (OUT-{uid} 형식)
  const { data: existing } = await supabase.from('shipments')
    .select('id, shipment_number');
  const existingMap = new Map((existing || []).map(e => [e.shipment_number, e.id]));

  let whereClause = '';
  if (isDelta) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 19);
    whereClause = `WHERE update_date >= '${twoHoursAgo}' OR insert_date >= '${twoHoursAgo}'`;
  }

  const [rows] = await conn.query(`SELECT * FROM out_info ${whereClause} ORDER BY uid`);
  log(`  MySQL 출하 조회: ${rows.length}건 ${isDelta ? '(증분)' : '(전체)'}`);

  let created = 0, updated = 0, errors = 0;
  const BATCH_SIZE = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const upserts = [];

    for (const r of batch) {
      const shipmentNumber = `OUT-${r.uid}`;
      const companyId = cache.companies.get(String(r.carr_uid)) || null;
      const customerId = cache.customers.get(String(r.cus_uid)) || null;

      // car_no로 기사 찾기
      let driverId = null;
      if (r.car_no) {
        for (const [mysqlUid, sbId] of cache.drivers) {
          // driver_mst의 gubun이 car_no의 뒷 4자리
          if (String(r.car_no) === mysqlUid.slice(-4) ||
              cache.drivers.get(mysqlUid) === sbId) {
            // 차량번호 뒷자리로 매칭 시도
          }
        }
      }

      // car_type → transport_type 매핑
      const typeMap = { BCT: '탱크', DUMP: '덤프', CGO: '카고' };

      const record = {
        shipment_number: shipmentNumber,
        shipment_date: normalizeDate(r.out_date),
        company_id: companyId,
        customer_id: customerId,
        vehicle_number: r.car_no || null,
        transport_type: typeMap[r.car_type] || r.car_type || null,
        silo: r.silo_no || null,
        weight_net: r.weight ? parseFloat(r.weight) : null,
        status: r.comp_yn === 'Y' ? 'completed' : (r.out_yn === 'Y' ? 'delivered' : 'pending'),
        is_shipped: r.out_yn === 'Y',
        is_confirmed: r.confirm === 'Y',
        dispatch_notified: r.noti_yn === 'Y',
        memo: r.remarks || null,
      };

      if (existingMap.has(shipmentNumber)) {
        // UPDATE
        upserts.push({ ...record, id: existingMap.get(shipmentNumber) });
      } else {
        upserts.push(record);
      }
    }

    // Batch upsert
    const { error } = await supabase.from('shipments')
      .upsert(upserts, { onConflict: 'shipment_number' });

    if (error) {
      log(`  ⚠️ 배치 ${i}~${i + batch.length} 오류: ${error.message}`);
      // 개별 삽입으로 폴백
      for (const rec of upserts) {
        const { error: e2 } = await supabase.from('shipments')
          .upsert(rec, { onConflict: 'shipment_number' });
        if (e2) errors++;
        else if (existingMap.has(rec.shipment_number)) updated++;
        else created++;
      }
    } else {
      const newCount = upserts.filter(u => !u.id).length;
      created += newCount;
      updated += upserts.length - newCount;
    }

    if (i % 2000 === 0 && i > 0) log(`  진행: ${i}/${rows.length}`);
  }
  log(`  출하: 신규 ${created}, 갱신 ${updated}, 오류 ${errors}`);
}

// ─── 5. 단가 동기화 ────────────────────────────────
async function syncUnitPrices(conn) {
  log('── 단가 동기화 ──');

  const [rows] = await conn.query('SELECT * FROM unit_mst');
  log(`  MySQL 단가: ${rows.length}건`);

  // 기존 단가 모두 조회
  const { data: existing } = await supabase.from('unit_prices').select('id, company_id, customer_id, effective_date');
  const existingSet = new Set((existing || []).map(e => `${e.company_id}:${e.customer_id}:${e.effective_date}`));

  let created = 0, skipped = 0;

  for (const r of rows) {
    const companyId = cache.companies.get(String(r.carr_uid));
    const customerId = cache.customers.get(String(r.cus_uid));
    if (!companyId) { skipped++; continue; }

    const effectiveDate = `${r.month}-01`; // '2024-03' → '2024-03-01'
    const key = `${companyId}:${customerId || null}:${effectiveDate}`;

    if (existingSet.has(key)) { skipped++; continue; }

    const record = {
      company_id: companyId,
      customer_id: customerId || null,
      price: parseFloat(r.unit) || 0,
      effective_date: effectiveDate,
      is_active: r.confirm === 'Y',
    };

    const { error } = await supabase.from('unit_prices').insert(record);
    if (!error) created++;
    else skipped++;
  }
  log(`  단가: 신규 ${created}, 건너뜀 ${skipped}`);
}

// ─── 6. 성적서 동기화 ──────────────────────────────
async function syncQualityReports(conn) {
  log('── 성적서 동기화 ──');

  const [rows] = await conn.query('SELECT * FROM grade_form_11');
  log(`  MySQL 성적서: ${rows.length}건`);

  // 기존 report_number로 체크
  const { data: existing } = await supabase.from('quality_reports').select('report_number');
  const existingSet = new Set((existing || []).map(e => e.report_number));

  let created = 0, skipped = 0;

  for (const r of rows) {
    const reportNumber = `GR11-${r.uid}`;
    if (existingSet.has(reportNumber)) { skipped++; continue; }

    // 거래처 이름으로 customer_id 찾기
    let customerId = null;
    if (r.delivery) {
      const { data: cust } = await supabase.from('customers')
        .select('id').eq('name', r.delivery).limit(1).single();
      if (cust) customerId = cust.id;
    }

    // 제품 이름으로 product_id 찾기
    let productId = null;
    if (r.product) {
      const { data: prod } = await supabase.from('products')
        .select('id').ilike('name', `%${r.product.split(' ')[0]}%`).limit(1).single();
      if (prod) productId = prod.id;
    }

    const testResults = {
      caco3: r.caco3 || null,
      fe2o3: r.fe2o3 || null,
      mgo: r.mgo || null,
      sio2: r.sio2 || null,
      al2o3: r.al2o3 || null,
      water: r.water || null,
      m24: r.m24 || null,
      m32: r.m32 || null,
      m100_m150: r.m100_m150 || null,
      under_m150: r.under_m150 || null,
      lot_no: r.lot_no || null,
      test_way: r.test_way || null,
    };

    const record = {
      report_number: reportNumber,
      report_date: r.test_date || r.delivery_date || null,
      customer_id: customerId,
      product_id: productId,
      template_type: 11,
      test_results: testResults,
      status: 'issued',
    };

    const { error } = await supabase.from('quality_reports').insert(record);
    if (!error) created++;
    else { skipped++; }
  }
  log(`  성적서: 신규 ${created}, 건너뜀 ${skipped}`);
}

// ─── 메인 실행 ─────────────────────────────────────
async function runSync() {
  const startTime = Date.now();
  log('========================================');
  log(`동기화 시작 (${isDelta ? '증분' : '전체'} 모드)`);

  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);
    log('MySQL 연결 성공');

    // 매핑 캐시 구축
    await buildMappingCache(conn);

    // 마스터 데이터 먼저 (FK 의존성 순서)
    await syncCompanies(conn);
    await syncCustomers(conn);
    await syncDrivers(conn);

    // 트랜잭션 데이터
    await syncShipments(conn);
    await syncUnitPrices(conn);
    await syncQualityReports(conn);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`========================================`);
    log(`동기화 완료! (${elapsed}초 소요)`);
  } catch (err) {
    log(`❌ 오류: ${err.message}`);
    console.error(err);
  } finally {
    if (conn) await conn.end();
  }
}

// ─── 크론 모드 ─────────────────────────────────────
if (isCron) {
  log('⏰ 크론 모드 시작 — 매시간 자동 동기화');
  // 즉시 1회 실행 후 매시간 반복
  await runSync();
  setInterval(async () => {
    // 크론 모드에서는 항상 delta
    process.argv.push('--delta');
    await runSync();
  }, 60 * 60 * 1000); // 1시간
} else {
  await runSync();
}
