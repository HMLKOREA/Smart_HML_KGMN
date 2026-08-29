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
import { fileURLToPath, pathToFileURL } from 'url';

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

let isDelta = process.argv.includes('--delta');
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
  productNames: new Map(),// mysql code → 제품명(제품명 누락 폴백용)
  drivers: new Map(),     // mysql uid → supabase uuid
  driversByVehicle: new Map(), // 차량번호(car_no) → supabase driver uuid
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
    if (mp.name || match?.name) cache.productNames.set(mp.code, mp.name || match?.name);
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
  // 차량번호 → 기사 매핑 (out_info.car_no 로 기사 자동 연결용)
  for (const d of (sbDrivers || [])) {
    if (d.vehicle_number) cache.driversByVehicle.set(String(d.vehicle_number).trim(), d.id);
  }
  log(`  기사 매핑: ${cache.drivers.size}/${mysqlDrivers.length} (차량번호 맵: ${cache.driversByVehicle.size})`);
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

  // 기존 shipment_number로 매핑 (OUT-{uid} 형식) — 페이징(1000행 제한 회피)
  const existingMap = new Map();
  {
    const PAGE = 1000;
    let pg = 0, more = true;
    while (more) {
      const { data } = await supabase.from('shipments')
        .select('id, shipment_number').range(pg * PAGE, (pg + 1) * PAGE - 1);
      const rows = data || [];
      for (const e of rows) existingMap.set(e.shipment_number, e.id);
      more = rows.length === PAGE;
      pg++;
    }
  }

  // 거래처(cus_uid) → 제품(product_id) 매핑: 거래처별 기본 제품(prod_code) 기준
  const custProduct = new Map();
  const custTransport = new Map(); // custom_mst.uid → 거래처 운송구분(carr_gubun_cd), 상차도 등 car_type 빈값 폴백용
  {
    const [custRows] = await conn.query('SELECT uid, prod_code, carr_gubun_cd FROM custom_mst');
    for (const c of custRows) {
      const pid = cache.products.get(c.prod_code);
      if (pid) custProduct.set(String(c.uid), pid);
      if (c.carr_gubun_cd) custTransport.set(String(c.uid), c.carr_gubun_cd);
    }
  }

  let whereClause = '';
  if (isDelta) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 19);
    whereClause = `WHERE update_date >= '${twoHoursAgo}' OR insert_date >= '${twoHoursAgo}'`;
  }

  const [rows] = await conn.query(
    `SELECT *, DATE_FORMAT(out_time, '%Y-%m-%d %H:%i:%s') AS out_time_str FROM out_info ${whereClause} ORDER BY uid`
  );
  log(`  MySQL 출하 조회: ${rows.length}건 ${isDelta ? '(증분)' : '(전체)'}`);

  let created = 0, updated = 0, errors = 0;
  const BATCH_SIZE = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // 우선순위 규칙(컷오버 이후):
    //  · 새 시스템 우선 — 이미 존재하는(OUT-) 행은 레거시가 다른 필드를 덮어쓰지 않는다.
    //    (운송사가 새 시스템에서 입력한 계근/기사/배차통보 등은 싱크로 사라지지 않음)
    //  · 예외: '출하증 발급'은 현장이 레거시에서 하므로 레거시 우선 →
    //    기존 행에는 certificate_time(발급시간)만, 그것도 레거시에 값이 있을 때만 반영.
    //  · 새 행(레거시에만 있는 신규 출고)은 전체 필드 신규 삽입.
    const fullInserts = [];   // 새 행: 전체 삽입
    const certUpdates = [];   // 기존 행: 출하증 발급시간만 레거시 우선 반영

    for (const r of batch) {
      const shipmentNumber = `OUT-${r.uid}`;
      const companyId = cache.companies.get(String(r.carr_uid)) || null;
      const customerId = cache.customers.get(String(r.cus_uid)) || null;

      // 출하증 발급시간(out_time): 레거시 KST 벽시계 → UTC instant(Z)로 확정 변환
      const certificateTime = r.out_time_str
        ? new Date(`${r.out_time_str.replace(' ', 'T')}+09:00`).toISOString()
        : null;

      if (existingMap.has(shipmentNumber)) {
        // 기존 행: 새 시스템 데이터 보존. 레거시에 발급시간이 있을 때만 그 값만 갱신.
        if (certificateTime) {
          certUpdates.push({ shipment_number: shipmentNumber, certificate_time: certificateTime });
        }
        // 레거시 발급시간이 없으면 아무것도 건드리지 않음(새 시스템 값 유지)
        continue;
      }

      // car_type → transport_type 매핑
      const typeMap = { BCT: '탱크', DUMP: '덤프', CGO: '카고' };

      // 새 행: 레거시 전체 스냅샷으로 신규 삽입
      fullInserts.push({
        shipment_number: shipmentNumber,
        shipment_date: normalizeDate(r.out_date),
        company_id: companyId,
        customer_id: customerId,
        product_id: custProduct.get(String(r.cus_uid)) || null,
        vehicle_number: r.car_no || null,
        // 차량번호로 기사 자동 연결 (기사성명/연락처가 딸려오도록)
        driver_id: cache.driversByVehicle.get(String(r.car_no || '').trim()) || null,
        transport_type: typeMap[r.car_type] || r.car_type || typeMap[custTransport.get(String(r.cus_uid))] || null,
        silo: r.silo_no || null,
        weight_net: r.weight ? parseFloat(r.weight) : null,
        status: r.comp_yn === 'Y' ? 'completed' : (r.out_yn === 'Y' ? 'delivered' : 'pending'),
        is_shipped: r.out_yn === 'Y',
        is_confirmed: r.confirm === 'Y',
        dispatch_notified: r.noti_yn === 'Y',
        certificate_time: certificateTime,
        // 기타/비고 (그리드 '기타' 컬럼은 notes 를 표시)
        notes: r.remarks || null,
        memo: r.remarks || null,
      });
    }

    // ① 새 행 전체 삽입 (shipment_number 충돌 시 갱신)
    if (fullInserts.length) {
      const { error } = await supabase.from('shipments')
        .upsert(fullInserts, { onConflict: 'shipment_number' });
      if (error) {
        log(`  ⚠️ 신규 배치 ${i} 오류: ${error.message} → 개별 폴백`);
        for (const rec of fullInserts) {
          const { error: e2 } = await supabase.from('shipments')
            .upsert(rec, { onConflict: 'shipment_number' });
          if (e2) errors++; else created++;
        }
      } else created += fullInserts.length;
    }

    // ② 기존 행: 출하증 발급시간만 갱신 (다른 필드는 새 시스템 값 보존)
    if (certUpdates.length) {
      const { error } = await supabase.from('shipments')
        .upsert(certUpdates, { onConflict: 'shipment_number' });
      if (error) {
        log(`  ⚠️ 발급시간 배치 ${i} 오류: ${error.message} → 개별 폴백`);
        for (const rec of certUpdates) {
          const { error: e2 } = await supabase.from('shipments')
            .update({ certificate_time: rec.certificate_time })
            .eq('shipment_number', rec.shipment_number);
          if (e2) errors++; else updated++;
        }
      } else updated += certUpdates.length;
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

  // 기존 단가 전체 조회 (페이지네이션 — 기본 1000행 제한 우회)
  // key → {id, price} : 존재 여부 + 변경분 반영(update)용
  const existingMap = new Map();
  {
    const PAGE = 1000;
    let pg = 0, more = true;
    while (more) {
      const { data } = await supabase.from('unit_prices')
        .select('id, company_id, customer_id, effective_date, price')
        .range(pg * PAGE, (pg + 1) * PAGE - 1);
      const chunk = data || [];
      for (const e of chunk) existingMap.set(`${e.company_id}:${e.customer_id}:${e.effective_date}`, { id: e.id, price: Number(e.price) });
      more = chunk.length === PAGE;
      pg++;
    }
  }

  // 월 정규화: 'YYYY-M' / 'YYYY-MM' → 'YYYY-MM-01'
  const normMonth = (m) => {
    const s = String(m).trim();
    const mm = s.match(/^(\d{4})-(\d{1,2})/);
    return mm ? `${mm[1]}-${mm[2].padStart(2, '0')}-01` : null;
  };

  let created = 0, updated = 0, skipped = 0;
  const seen = new Set(); // 같은 실행 내 중복 방지

  for (const r of rows) {
    const companyId = cache.companies.get(String(r.carr_uid));
    const customerId = cache.customers.get(String(r.cus_uid));
    if (!companyId) { skipped++; continue; }

    const effectiveDate = normMonth(r.month);
    if (!effectiveDate) { skipped++; continue; }
    const key = `${companyId}:${customerId || null}:${effectiveDate}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    const price = parseFloat(r.unit) || 0;
    const ex = existingMap.get(key);
    if (ex) {
      // 이미 존재 → 단가 변경분만 반영
      if (Math.abs((ex.price || 0) - price) > 0.001) {
        const { error } = await supabase.from('unit_prices').update({ price }).eq('id', ex.id);
        if (!error) updated++; else skipped++;
      } else skipped++;
      continue;
    }

    const { error } = await supabase.from('unit_prices').insert({
      company_id: companyId,
      customer_id: customerId || null,
      price,
      effective_date: effectiveDate,
      is_active: r.confirm === 'Y',
    });
    if (!error) created++;
    else skipped++;
  }
  log(`  단가: 신규 ${created}, 갱신 ${updated}, 건너뜀 ${skipped}`);
}

// ─── 6. 성적서 동기화 ──────────────────────────────
// ─── 거래처×제품 마스터 동기화 (custom_mst → customer_products) ───
async function syncCustomerProducts(conn) {
  log('── 거래처×제품 마스터 동기화 ──');
  const typeMap = { BCT: '탱크', DUMP: '덤프', CGO: '카고' };
  const [rows] = await conn.query('SELECT * FROM custom_mst ORDER BY uid');
  log(`  MySQL custom_mst: ${rows.length}건`);

  const records = rows.map(r => ({
    source_uid: r.uid,
    transport_type: typeMap[r.carr_gubun_cd] || r.carr_gubun_cd || null,
    customer_id: cache.customers.get(String(r.uid)) || null,
    customer_name: r.cp_name || null,
    customer_code: r.cus_code || null,
    product_id: cache.products.get(r.prod_code) || null,
    product_name: r.product || cache.productNames.get(r.prod_code) || null, // 제품명 누락 시 prod_code로 폴백
    product_code: r.prod_code || null,
    warehouse_code: r.storage_code || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('customer_products')
    .upsert(records, { onConflict: 'source_uid' });
  if (error) { log(`  ⚠️ 오류: ${error.message}`); return; }
  const withCust = records.filter(r => r.customer_id).length;
  const withProd = records.filter(r => r.product_id).length;
  log(`  거래처×제품: ${records.length}건 (거래처연결 ${withCust}, 제품연결 ${withProd})`);
}

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
// deltaOverride: true=증분, false=전체, undefined=argv 기준 (라우트/크론에서 호출용)
// 삭제 반영: 최근 구간에서 레거시(out_info)에 더 이상 없는 출하를 우리 DB에서 제거.
// (레거시가 미배정/중복 출하를 삭제해도 upsert만으로는 고아행이 남는 문제 해결)
async function reconcileDeletedShipments(conn) {
  log('── 삭제 반영(출하 정리) ──');
  const RECONCILE_DAYS = 14;
  const d = new Date();
  d.setDate(d.getDate() - RECONCILE_DAYS);
  const since = d.toISOString().slice(0, 10);

  const [live] = await conn.query(`SELECT uid FROM out_info WHERE out_date >= '${since}'`);
  if (!live.length) { log('  레거시 조회 0건 → 삭제 반영 건너뜀(안전장치)'); return; }
  const liveSet = new Set(live.map(x => `OUT-${x.uid}`));

  const ours = [];
  let pg = 0, more = true;
  while (more) {
    const { data } = await supabase.from('shipments')
      .select('id, shipment_number').gte('shipment_date', since)
      .range(pg * 1000, (pg + 1) * 1000 - 1);
    const ch = data || [];
    ours.push(...ch);
    more = ch.length === 1000;
    pg++;
  }
  // 레거시 원본(OUT-)만 삭제 대상. 새 시스템에서 생성한 행(SH-)은 레거시에 없어도 절대 삭제하지 않음.
  const orphanIds = ours
    .filter(o => o.shipment_number?.startsWith('OUT-') && !liveSet.has(o.shipment_number))
    .map(o => o.id);
  if (!orphanIds.length) { log('  고아 출하 없음(새 시스템 SH- 행은 보존)'); return; }

  let del = 0;
  for (let i = 0; i < orphanIds.length; i += 200) {
    const chunk = orphanIds.slice(i, i + 200);
    const { error } = await supabase.from('shipments').delete().in('id', chunk);
    if (!error) del += chunk.length;
    else log(`  ⚠️ 삭제 오류: ${error.message}`);
  }
  log(`  삭제 반영: ${del}건 (레거시에서 제거된 출하 정리)`);
}

export async function runSync(deltaOverride) {
  if (deltaOverride !== undefined) isDelta = deltaOverride;
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
    await syncCustomerProducts(conn);

    // 트랜잭션 데이터
    await syncShipments(conn);
    await reconcileDeletedShipments(conn);
    await syncUnitPrices(conn);
    await syncQualityReports(conn);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`========================================`);
    log(`동기화 완료! (${elapsed}초 소요)`);

    // 동기화 하트비트 기록 (health-check 신선도 판정용)
    try {
      const nowIso = new Date().toISOString();
      await supabase.from('sync_status').upsert({
        id: 'main', last_run_at: nowIso, is_delta: isDelta, duration_sec: Number(elapsed), updated_at: nowIso,
      });
    } catch (e) { log(`  ⚠️ 하트비트 기록 실패: ${e.message}`); }
  } catch (err) {
    log(`❌ 오류: ${err.message}`);
    console.error(err);
  } finally {
    if (conn) await conn.end();
  }
}

// ─── CLI 실행 (import 시에는 실행 안 함) ─────────────
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (isCron) {
    log('⏰ 크론 모드 시작 — 매시간 자동 동기화');
    await runSync();
    setInterval(() => runSync(true), 60 * 60 * 1000); // 1시간마다 증분
  } else {
    await runSync();
  }
}
