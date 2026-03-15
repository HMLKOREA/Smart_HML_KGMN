/**
 * 2026 KGMN Data Import Script
 *
 * Reads Excel files from C# program export and inserts into Supabase.
 * One-time copy, no sync.
 *
 * Usage: node scripts/import-2026-data.mjs
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { resolve } from 'path';

// ── Supabase Config ──
const SUPABASE_URL = 'https://abfkeigvywakgjquqrhr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZmtlaWd2eXdha2dqcXVxcmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MDM4MzcsImV4cCI6MjA4NjA3OTgzN30.O9ioE3Zd1UMMadb-TMQx8XZRosU-zMcfpVCVMP4--eE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── File Paths ──
const BASE = 'C:/Users/gufid/OneDrive/바탕 화면';
const FILES = {
  companies: `${BASE}/2026_kgmn_data_운송사.xlsx`,
  customers: `${BASE}/2026_kgmn_data_거래처.xlsx`,
  products: `${BASE}/２０26_kgmn_data_제품.xlsx`,
  drivers: `${BASE}/2026_kgmn_data_기사.xlsx`,
  shipments: `${BASE}/2026_kgmn_data_출하관리데이터.xlsx`,
};

function readExcel(path) {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
}

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return d.toISOString();
}

function parseShipmentDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  // Format: "26-01-01" → "2026-01-01"
  const m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  // Already full date
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
  return null;
}

async function deleteExistingData() {
  console.log('🗑️  Deleting existing data...');
  // Delete in reverse FK order
  const tables = ['settlement_details', 'settlements', 'quality_reports', 'dispatches', 'shipments', 'unit_prices', 'drivers', 'products', 'customers', 'transport_companies'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`  ⚠️  ${table}: ${error.message}`);
    } else {
      console.log(`  ✓ ${table} cleared`);
    }
  }
}

async function importCompanies() {
  console.log('\n📦 Importing transport companies...');
  const rows = readExcel(FILES.companies);
  const records = rows.map(r => ({
    id: randomUUID(),
    name: String(r['회사명'] || '').trim(),
    business_number: String(r['사업자번호'] || '').trim() || null,
    representative: String(r['대표명'] || '').trim() || null,
    phone: String(r['대표 연락처'] || '').trim() || null,
    address: String(r['주소'] || '').trim() || null,
    email: String(r['대표 이메일'] || '').trim() || null,
    account_number: String(r['계좌번호'] || '').trim() || null,
    memo: r['CODE'] ? `CODE: ${r['CODE']}` : null,
    is_active: true,
  })).filter(r => r.name);

  const { data, error } = await supabase.from('transport_companies').insert(records).select('id, name');
  if (error) { console.error('  ❌', error.message); return {}; }
  console.log(`  ✓ ${data.length} companies inserted`);

  // Return name→id map
  const map = {};
  data.forEach(r => { map[r.name] = r.id; });
  return map;
}

async function importCustomers() {
  console.log('\n👥 Importing customers...');
  const rows = readExcel(FILES.customers);

  // Deduplicate by customer name
  const uniqueCustomers = new Map();
  rows.forEach(r => {
    const name = String(r['거래처'] || '').trim();
    if (!name) return;
    if (!uniqueCustomers.has(name)) {
      uniqueCustomers.set(name, {
        id: randomUUID(),
        name,
        business_number: String(r['거래처코드'] || '').trim() || null,
        email: String(r['담당자 이메일'] || '').trim() || null,
        address: String(r['주소'] || '').trim() || null,
        is_active: true,
      });
    }
  });

  const records = Array.from(uniqueCustomers.values());

  // Insert in batches of 50
  const map = {};
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase.from('customers').insert(batch).select('id, name');
    if (error) { console.error(`  ❌ batch ${i}:`, error.message); continue; }
    data.forEach(r => { map[r.name] = r.id; });
  }
  console.log(`  ✓ ${Object.keys(map).length} unique customers inserted`);
  return map;
}

async function importProducts() {
  console.log('\n📋 Importing products...');
  const rows = readExcel(FILES.products);
  const records = rows
    .filter(r => String(r['사용여부'] || '').trim() === 'Y')
    .map(r => ({
      id: randomUUID(),
      code: String(r['제품코드'] || '').trim(),
      name: String(r['제품명'] || '').trim(),
      unit: 'ton',
      is_active: true,
    }))
    .filter(r => r.code && r.name);

  const { data, error } = await supabase.from('products').insert(records).select('id, name, code');
  if (error) { console.error('  ❌', error.message); return {}; }
  console.log(`  ✓ ${data.length} products inserted`);

  const map = {};
  data.forEach(r => { map[r.name] = r.id; });
  return map;
}

async function importDrivers(companyMap) {
  console.log('\n🚗 Importing drivers...');
  const rows = readExcel(FILES.drivers);
  const records = rows.map(r => {
    const companyName = String(r['운송사'] || '').trim();
    const name = String(r['기사명'] || '').trim();
    const vehicleNumber = String(r['차량번호'] || '').trim();
    if (!name || !vehicleNumber) return null;

    return {
      id: randomUUID(),
      name,
      phone: String(r['연락처'] || '').trim() || null,
      vehicle_number: vehicleNumber,
      company_id: companyMap[companyName] || null,
      is_active: true,
    };
  }).filter(Boolean);

  // Insert in batches
  const map = {};       // vehicleNumber → id
  const driverMap = {}; // vehicleNumber → { id, company_id }
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase.from('drivers').insert(batch).select('id, name, vehicle_number, company_id');
    if (error) { console.error(`  ❌ batch ${i}:`, error.message); continue; }
    data.forEach(r => {
      map[r.vehicle_number] = r.id;
      driverMap[r.vehicle_number] = { id: r.id, company_id: r.company_id };
    });
  }
  console.log(`  ✓ ${Object.keys(map).length} drivers inserted`);
  return { vehicleToDriverId: map, vehicleToDriver: driverMap };
}

async function importShipments(customerMap, productMap, companyMap, driverMaps) {
  console.log('\n📤 Importing shipments...');
  const rows = readExcel(FILES.shipments);

  let count = 0;
  let skipped = 0;
  const records = [];

  for (const r of rows) {
    const shipmentDate = parseShipmentDate(r['출하일자']);
    if (!shipmentDate) { skipped++; continue; }

    const customerName = String(r['거래처'] || '').trim();
    const productName = String(r['제품명'] || '').trim();
    const companyName = String(r['운송사'] || '').trim();
    const vehicleNumber = String(r['차량정보'] || '').trim();

    const customerId = customerMap[customerName] || null;
    const productId = productMap[productName] || null;
    const companyId = companyMap[companyName] || null;
    const driverInfo = driverMaps.vehicleToDriver[vehicleNumber];
    const driverId = driverInfo?.id || null;

    const isShipped = String(r['출하'] || '').trim() === 'Y';
    const weightNet = typeof r['계근결과'] === 'number' ? r['계근결과'] : parseFloat(r['계근결과']) || null;
    const hasAttachment = String(r['첨부파일'] || '').trim() === 'O';
    const dispatchNotified = String(r['배차통보여부'] || '').trim() === 'O';
    const notes = String(r['기타'] || '').trim() || null;
    const silo = String(r['사일로'] || '').trim() || null;
    const transportType = String(r['운송구분'] || '').trim() || '탱크';

    // Certificate time from Excel serial date
    let certificateTime = null;
    if (r['출하증 발급시간'] && typeof r['출하증 발급시간'] === 'number') {
      certificateTime = excelDateToISO(r['출하증 발급시간']);
    }

    const seq = Math.random().toString(36).substring(2, 6).toUpperCase();
    const dateStr = shipmentDate.replace(/-/g, '');

    records.push({
      shipment_date: shipmentDate,
      shipment_number: `SH-${dateStr}-${seq}`,
      customer_id: customerId,
      product_id: productId,
      company_id: companyId || driverInfo?.company_id || null,
      driver_id: driverId,
      vehicle_number: vehicleNumber || null,
      transport_type: transportType,
      silo,
      quantity: weightNet || 0,
      unit: 'ton',
      is_shipped: isShipped,
      weight_net: weightNet,
      certificate_time: certificateTime,
      has_attachment: hasAttachment,
      dispatch_notified: dispatchNotified,
      is_confirmed: isShipped,
      notes,
      status: isShipped ? 'completed' : 'pending',
    });
  }

  // Insert in batches of 100
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const { error } = await supabase.from('shipments').insert(batch);
    if (error) {
      console.error(`  ❌ batch ${i}-${i + batch.length}:`, error.message);
    } else {
      count += batch.length;
      process.stdout.write(`  ✓ ${count}/${records.length} shipments...\r`);
    }
  }
  console.log(`\n  ✓ ${count} shipments inserted (${skipped} skipped)`);
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  SmartHML 2026 Data Import');
  console.log('═══════════════════════════════════════\n');

  // Step 1: Delete existing
  await deleteExistingData();

  // Step 2: Import master data (FK order)
  const companyMap = await importCompanies();
  const customerMap = await importCustomers();
  const productMap = await importProducts();
  const driverMaps = await importDrivers(companyMap);

  // Step 3: Import transaction data
  await importShipments(customerMap, productMap, companyMap, driverMaps);

  console.log('\n═══════════════════════════════════════');
  console.log('  Import Complete!');
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
