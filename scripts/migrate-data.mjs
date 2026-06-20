/**
 * 경기광업 RAW DATA → Supabase 마이그레이션 스크립트
 *
 * 사용법: node scripts/migrate-data.mjs
 *
 * 대상:
 *   1. 마스터 데이터 (거래처, 기사, 운송사, 제품코드) — upsert
 *   2. 출하 데이터 (2026 04~06월) — insert (기존 1~3월 유지)
 *   3. 정산 단가 데이터 — unit_prices upsert
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

// ── Supabase 설정 ──────────────────────────────────
const SUPABASE_URL = 'https://abfkeigvywakgjquqrhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZmtlaWd2eXdha2dqcXVxcmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MDM4MzcsImV4cCI6MjA4NjA3OTgzN30.O9ioE3Zd1UMMadb-TMQx8XZRosU-zMcfpVCVMP4--eE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BASE = 'C:\\Users\\gufid\\OneDrive\\바탕 화면\\KGMN_Newprogram\\경기광업 RAW DATA BACKUP (0619)';

// ── 유틸 ────────────────────────────────────────────
function readExcel(filePath, sheetIndex = 0) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[sheetIndex]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function log(label, msg) {
  console.log(`[${label}] ${msg}`);
}

/** Excel 시리얼 넘버 → ISO 날짜시간 문자열 */
function excelSerialToISO(serial) {
  if (!serial || isNaN(serial)) return null;
  const num = Number(serial);
  if (num < 40000) return null;
  const d = new Date((num - 25569) * 86400000);
  return d.toISOString();
}

/** Excel 날짜 → YYYY-MM-DD */
function parseDate(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  // 26-04-01 → 2026-04-01
  if (s.match(/^\d{2}-\d{2}-\d{2}$/)) return '20' + s;
  // 2026-04-01 이미 OK
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  // Excel serial
  if (!isNaN(s) && Number(s) > 40000) {
    const d = new Date((Number(s) - 25569) * 86400000);
    return d.toISOString().split('T')[0];
  }
  return null;
}

/** certificate_time 파싱 (Excel serial or datetime string) */
function parseCertTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // 이미 ISO 형식이면 그대로
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s;
  // Excel serial number → ISO
  if (!isNaN(s) && Number(s) > 40000) return excelSerialToISO(Number(s));
  return null;
}

async function batchUpsert(table, records, conflictCol = 'id', batchSize = 100) {
  let ok = 0, fail = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictCol });
    if (error) {
      console.error(`  batch ${Math.floor(i/batchSize)+1} error:`, error.message);
      fail += batch.length;
    } else {
      ok += batch.length;
    }
  }
  return { ok, fail };
}

async function batchInsert(table, records, batchSize = 100) {
  let ok = 0, fail = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  batch ${Math.floor(i/batchSize)+1} error:`, error.message);
      fail += batch.length;
    } else {
      ok += batch.length;
    }
  }
  return { ok, fail };
}

// ── 1. 거래처 마이그레이션 ──────────────────────────
async function migrateCustomers() {
  log('거래처', '시작...');
  const rows = readExcel(path.join(BASE, '경기광업 거래처 리스트 - 260619.xlsx'));

  // 기존 거래처 목록 가져오기 (name 기준 매칭)
  const { data: existing } = await supabase.from('customers').select('id, name');
  const nameMap = new Map((existing || []).map(c => [c.name, c.id]));

  const records = rows.map(r => {
    const name = String(r['거래처'] || '').trim();
    if (!name) return null;

    const rec = {
      name,
      address: String(r['주소'] || '').trim() || undefined,
      email: String(r['담당자 이메일'] || '').trim() || undefined,
      is_active: true,
    };

    // 기존에 있으면 id 포함 (upsert용)
    if (nameMap.has(name)) {
      rec.id = nameMap.get(name);
    }

    return rec;
  }).filter(Boolean);

  // 이름 중복 제거 (마지막 것 사용)
  const deduped = new Map();
  for (const r of records) deduped.set(r.name, r);
  const uniqueRecs = Array.from(deduped.values());

  const newRecs = uniqueRecs.filter(r => !r.id);
  const updateRecs = uniqueRecs.filter(r => r.id);

  if (updateRecs.length > 0) {
    // 개별 업데이트 (batch upsert 충돌 방지)
    let ok = 0;
    for (const r of updateRecs) {
      const { id, ...rest } = r;
      const { error } = await supabase.from('customers').update(rest).eq('id', id);
      if (!error) ok++;
    }
    log('거래처', `기존 업데이트: ${ok}건 성공`);
  }
  if (newRecs.length > 0) {
    const res = await batchInsert('customers', newRecs);
    log('거래처', `신규 등록: ${res.ok}건 성공, ${res.fail}건 실패`);
  }
  log('거래처', `완료 (총 ${records.length}건)`);
}

// ── 2. 운송사 마이그레이션 ──────────────────────────
async function migrateCompanies() {
  log('운송사', '시작...');
  const rows = readExcel(path.join(BASE, '경기광업 운송사 리스트 - 260619.xlsx'));

  const { data: existing } = await supabase.from('transport_companies').select('id, name');
  const nameMap = new Map((existing || []).map(c => [c.name, c.id]));

  const records = rows.map(r => {
    const name = String(r['회사명'] || '').trim();
    if (!name) return null;

    const rec = {
      name,
      business_number: String(r['사업자번호'] || '').trim() || undefined,
      representative: String(r['대표명'] || '').trim() || undefined,
      phone: String(r['대표 연락처'] || '').trim() || undefined,
      email: String(r['대표 이메일'] || '').trim() || undefined,
      address: String(r['주소'] || '').trim() || undefined,
      is_active: true,
    };

    // 은행 + 계좌번호 파싱
    const bankInfo = String(r['계좌번호'] || '').trim();
    if (bankInfo) {
      const parts = bankInfo.split(' ');
      if (parts.length >= 2) {
        rec.bank_name = parts[0];
        rec.account_number = parts.slice(1).join(' ');
      }
    }

    if (nameMap.has(name)) {
      rec.id = nameMap.get(name);
    }

    return rec;
  }).filter(Boolean);

  const res = await batchUpsert('transport_companies', records);
  log('운송사', `완료: ${res.ok}건 성공, ${res.fail}건 실패`);
}

// ── 3. 기사 마이그레이션 ────────────────────────────
async function migrateDrivers() {
  log('기사', '시작...');
  const rows = readExcel(path.join(BASE, '경기광업 기사님 리스트 - 260619.xlsx'));

  // 운송사 이름→ID 매핑
  const { data: companies } = await supabase.from('transport_companies').select('id, name');
  const companyMap = new Map((companies || []).map(c => [c.name, c.id]));

  // 기존 기사 (차량번호 기준)
  const { data: existing } = await supabase.from('drivers').select('id, vehicle_number');
  const vehicleMap = new Map((existing || []).map(d => [d.vehicle_number, d.id]));

  const records = rows.map(r => {
    const name = String(r['기사명'] || '').trim();
    const vehicle = String(r['차량번호'] || '').trim();
    const companyName = String(r['운송사'] || '').trim();
    if (!name || !vehicle) return null;

    const rec = {
      name,
      phone: String(r['연락처'] || '').trim() || undefined,
      vehicle_number: vehicle,
      company_id: companyMap.get(companyName) || undefined,
      is_active: true,
    };

    if (vehicleMap.has(vehicle)) {
      rec.id = vehicleMap.get(vehicle);
    }

    return rec;
  }).filter(r => r && r.company_id);

  const existingRecs = records.filter(r => r.id);
  const newDriverRecs = records.filter(r => !r.id);

  if (existingRecs.length > 0) {
    const res = await batchUpsert('drivers', existingRecs);
    log('기사', `기존 업데이트: ${res.ok}건 성공, ${res.fail}건 실패`);
  }
  if (newDriverRecs.length > 0) {
    // id 필드 제거 후 insert
    const cleaned = newDriverRecs.map(({ id, ...rest }) => rest);
    const res = await batchInsert('drivers', cleaned);
    log('기사', `신규 등록: ${res.ok}건 성공, ${res.fail}건 실패`);
  }
  log('기사', `완료 (기존 ${existingRecs.length} + 신규 ${newDriverRecs.length} = 총 ${records.length}건)`);
}

// ── 4. 제품코드 마이그레이션 ────────────────────────
async function migrateProducts() {
  log('제품코드', '시작...');
  const rows = readExcel(path.join(BASE, '경기광업 제품코드관리 - 260619.xlsx'));

  const { data: existing } = await supabase.from('products').select('id, code');
  const codeMap = new Map((existing || []).map(p => [p.code, p.id]));

  const records = rows.map(r => {
    const code = String(r['제품코드'] || '').trim();
    const name = String(r['제품명'] || '').trim();
    if (!code || !name) return null;

    const rec = {
      code,
      name,
      unit: 'ton',
      is_active: String(r['사용여부'] || 'Y').trim() === 'Y',
    };

    if (codeMap.has(code)) {
      rec.id = codeMap.get(code);
    }

    return rec;
  }).filter(Boolean);

  const res = await batchUpsert('products', records);
  log('제품코드', `완료: ${res.ok}건 성공, ${res.fail}건 실패`);
}

// ── 5. 출하 데이터 마이그레이션 (4~6월) ─────────────
async function migrateShipments() {
  log('출하', '시작...');

  // 조회용 매핑 데이터
  const { data: customers } = await supabase.from('customers').select('id, name');
  const { data: products } = await supabase.from('products').select('id, code, name');
  const { data: companies } = await supabase.from('transport_companies').select('id, name');
  const { data: drivers } = await supabase.from('drivers').select('id, vehicle_number, company_id');

  const customerMap = new Map((customers || []).map(c => [c.name, c.id]));
  const productMap = new Map((products || []).map(p => [p.name, p.id]));
  const companyMap = new Map((companies || []).map(c => [c.name, c.id]));
  const vehicleMap = new Map((drivers || []).map(d => [d.vehicle_number, { id: d.id, company_id: d.company_id }]));

  // 기존 출하번호 확인 (중복 방지)
  const { count: existingCount } = await supabase
    .from('shipments')
    .select('*', { count: 'exact', head: true })
    .gte('shipment_date', '2026-04-01');

  if (existingCount > 0) {
    log('출하', `4월 이후 데이터 ${existingCount}건 이미 존재 — 먼저 삭제`);
    await supabase.from('shipments').delete().gte('shipment_date', '2026-04-01');
  }

  const files = [
    { file: '2026 04 출하관리.xlsx', month: '04' },
    { file: '2026 05 출하관리.xlsx', month: '05' },
    { file: '2026 06 출하관리 (0619).xlsx', month: '06' },
  ];

  let totalInserted = 0;

  for (const { file, month } of files) {
    const rows = readExcel(path.join(BASE, '2026 출하관리', file));
    log('출하', `${file}: ${rows.length}건 읽음`);

    let seqByDate = {};

    const records = rows.map(r => {
      // 날짜 파싱
      const dateStr = parseDate(r['출하일자']);
      if (!dateStr) return null;

      // 출하번호 생성
      if (!seqByDate[dateStr]) seqByDate[dateStr] = 0;
      seqByDate[dateStr]++;
      const shipmentNumber = `${dateStr.replace(/-/g, '')}-${String(seqByDate[dateStr]).padStart(3, '0')}`;

      const customerName = String(r['거래처'] || '').trim();
      const productName = String(r['제품명'] || '').trim();
      const companyName = String(r['운송사'] || '').trim();
      const vehicleNumber = String(r['차량정보'] || '').trim();
      const transportType = String(r['운송구분'] || '').trim();
      const silo = String(r['사일로'] || '').trim();
      const isShipped = String(r['출하'] || '') === 'Y';
      const weightNet = parseFloat(r['계근결과']) || 0;
      const notes = String(r['기타'] || '').trim() || undefined;
      const certTime = parseCertTime(r['출하증 발급시간']);
      const hasAttachment = String(r['첨부파일'] || '') === 'O';
      const dispatchNotified = String(r['배차통보여부'] || '') === 'O';

      const driverInfo = vehicleMap.get(vehicleNumber);

      return {
        shipment_date: dateStr,
        shipment_number: shipmentNumber,
        customer_id: customerMap.get(customerName) || null,
        product_id: productMap.get(productName) || null,
        company_id: driverInfo?.company_id || companyMap.get(companyName) || null,
        driver_id: driverInfo?.id || null,
        vehicle_number: vehicleNumber || null,
        transport_type: transportType || null,
        silo: silo || null,
        quantity: weightNet,
        unit: 'ton',
        is_shipped: isShipped,
        weight_net: weightNet,
        notes: notes,
        certificate_time: certTime,
        has_attachment: hasAttachment,
        dispatch_notified: dispatchNotified,
        is_confirmed: isShipped,
        status: isShipped ? 'completed' : 'pending',
      };
    }).filter(Boolean);

    if (records.length > 0) {
      const res = await batchInsert('shipments', records);
      log('출하', `${month}월: ${res.ok}건 성공, ${res.fail}건 실패`);
      totalInserted += res.ok;
    }
  }

  log('출하', `완료 — 총 ${totalInserted}건 추가`);
}

// ── 6. 정산 단가 데이터 → unit_prices 업데이트 ──────
async function migrateUnitPrices() {
  log('단가', '시작...');

  const { data: companies } = await supabase.from('transport_companies').select('id, name');
  const { data: products } = await supabase.from('products').select('id, name');

  const companyMap = new Map((companies || []).map(c => [c.name, c.id]));
  const productMap = new Map((products || []).map(p => [p.name, p.id]));

  // 최신 정산 파일에서 단가 추출 (중복 제거)
  const priceMap = new Map(); // "companyId:productId" → price

  const files = [
    '2026 04 정산관리.xlsx',
    '2026 05 정산관리.xlsx',
    '2026 06 정산관리 (0618).xlsx',
  ];

  for (const file of files) {
    const rows = readExcel(path.join(BASE, '2026 정산관리', file));
    for (const r of rows) {
      const companyName = String(r['운송사'] || '').trim();
      const productName = String(r['제품명'] || '').trim();
      const price = parseFloat(r['단가(원)']) || 0;

      const companyId = companyMap.get(companyName);
      const productId = productMap.get(productName);

      if (companyId && productId && price > 0) {
        const key = `${companyId}:${productId}`;
        priceMap.set(key, { company_id: companyId, product_id: productId, price });
      }
    }
  }

  // 기존 unit_prices와 비교하여 upsert
  const { data: existingPrices } = await supabase.from('unit_prices').select('id, company_id, product_id, price');
  const existingMap = new Map((existingPrices || []).map(p => [`${p.company_id}:${p.product_id}`, p]));

  const toUpsert = [];
  for (const [key, val] of priceMap) {
    const existing = existingMap.get(key);
    if (existing) {
      // 가격 변동 시 업데이트
      if (existing.price !== val.price) {
        toUpsert.push({ id: existing.id, ...val, effective_date: '2026-04-01', is_active: true });
      }
    } else {
      // 신규
      toUpsert.push({ ...val, effective_date: '2026-04-01', is_active: true });
    }
  }

  if (toUpsert.length > 0) {
    const withId = toUpsert.filter(r => r.id);
    const withoutId = toUpsert.filter(r => !r.id);

    if (withId.length > 0) {
      const res = await batchUpsert('unit_prices', withId);
      log('단가', `업데이트: ${res.ok}건`);
    }
    if (withoutId.length > 0) {
      const res = await batchInsert('unit_prices', withoutId);
      log('단가', `신규: ${res.ok}건`);
    }
  }

  log('단가', `완료 — 총 ${priceMap.size}개 고유 단가 (${toUpsert.length}건 변경)`);
}

// ── 메인 실행 ───────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('경기광업 RAW DATA → Supabase 마이그레이션');
  console.log('='.repeat(60));

  // 연결 테스트
  const { count } = await supabase.from('shipments').select('*', { count: 'exact', head: true });
  console.log(`현재 shipments: ${count}건\n`);

  await migrateProducts();     console.log('');
  await migrateCompanies();    console.log('');
  await migrateCustomers();    console.log('');
  await migrateDrivers();      console.log('');
  await migrateShipments();    console.log('');
  await migrateUnitPrices();   console.log('');

  // 최종 카운트
  console.log('='.repeat(60));
  console.log('최종 데이터 현황');
  console.log('='.repeat(60));

  const tables = ['customers', 'transport_companies', 'drivers', 'products', 'shipments', 'unit_prices'];
  for (const t of tables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ${t}: ${count}건`);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
