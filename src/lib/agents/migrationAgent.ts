/**
 * 데이터 마이그레이션 에이전트
 *
 * 기존 시스템(SQL Server/MySQL/SQLite)에서 Supabase(PostgreSQL)로
 * 데이터를 마이그레이션하는 에이전트입니다.
 *
 * 마이그레이션 순서:
 * 1. 운송사 (transport_companies)
 * 2. 거래처 (customers)
 * 3. 제품코드 (products)
 * 4. 기사 (drivers) - 운송사 FK
 * 5. 단가 (unit_prices) - 운송사, 제품 FK
 * 6. 출하 (shipments) - 거래처, 제품, 기사, 운송사 FK
 * 7. 배차 (dispatches) - 출하, 운송사, 기사, 거래처, 제품 FK
 * 8. 성적서 (quality_reports) - 출하, 제품, 거래처 FK
 * 9. 정산 (settlements) - 운송사 FK
 * 10. 정산상세 (settlement_details) - 정산, 출하 FK
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MigrationResult {
  table: string;
  total: number;
  success: number;
  failed: number;
  errors: string[];
  duration_ms: number;
}

export interface MigrationProgress {
  currentTable: string;
  currentStep: number;
  totalSteps: number;
  results: MigrationResult[];
  status: 'idle' | 'running' | 'completed' | 'error';
}

// CSV 데이터를 파싱
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });
    records.push(record);
  }

  return records;
}

// 마이그레이션 테이블 순서
const MIGRATION_ORDER = [
  'transport_companies',
  'customers',
  'products',
  'drivers',
  'unit_prices',
  'shipments',
  'dispatches',
  'quality_reports',
  'settlements',
  'settlement_details',
];

export class MigrationAgent {
  private supabase: SupabaseClient;
  private progress: MigrationProgress;
  private onProgressCallback: ((progress: MigrationProgress) => void) | null = null;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.progress = {
      currentTable: '',
      currentStep: 0,
      totalSteps: MIGRATION_ORDER.length,
      results: [],
      status: 'idle',
    };
  }

  onProgress(callback: (progress: MigrationProgress) => void) {
    this.onProgressCallback = callback;
  }

  private updateProgress(updates: Partial<MigrationProgress>) {
    this.progress = { ...this.progress, ...updates };
    if (this.onProgressCallback) {
      this.onProgressCallback({ ...this.progress });
    }
  }

  // CSV 파일에서 특정 테이블로 데이터 마이그레이션
  async migrateFromCSV(
    tableName: string,
    csvData: string,
    fieldMapping?: Record<string, string>
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      table: tableName,
      total: 0,
      success: 0,
      failed: 0,
      errors: [],
      duration_ms: 0,
    };

    try {
      let records = parseCSV(csvData);
      result.total = records.length;

      // 필드명 매핑
      if (fieldMapping) {
        records = records.map(record => {
          const mapped: Record<string, string> = {};
          for (const [oldKey, newKey] of Object.entries(fieldMapping)) {
            if (record[oldKey] !== undefined) {
              mapped[newKey] = record[oldKey];
            }
          }
          // 매핑되지 않은 필드도 유지
          for (const [key, value] of Object.entries(record)) {
            if (!fieldMapping[key]) {
              mapped[key] = value;
            }
          }
          return mapped;
        });
      }

      // 배치 크기 (Supabase 제한)
      const BATCH_SIZE = 100;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        const { error } = await this.supabase
          .from(tableName)
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          result.failed += batch.length;
          result.errors.push(`배치 ${i / BATCH_SIZE + 1} 실패: ${error.message}`);
        } else {
          result.success += batch.length;
        }
      }
    } catch (err) {
      result.errors.push(`마이그레이션 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }

    result.duration_ms = Date.now() - startTime;
    return result;
  }

  // JSON 데이터에서 마이그레이션
  async migrateFromJSON(
    tableName: string,
    jsonData: Record<string, unknown>[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      table: tableName,
      total: jsonData.length,
      success: 0,
      failed: 0,
      errors: [],
      duration_ms: 0,
    };

    const BATCH_SIZE = 100;
    for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
      const batch = jsonData.slice(i, i + BATCH_SIZE);

      const { error } = await this.supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        result.failed += batch.length;
        result.errors.push(`배치 ${i / BATCH_SIZE + 1} 실패: ${error.message}`);
      } else {
        result.success += batch.length;
      }
    }

    result.duration_ms = Date.now() - startTime;
    return result;
  }

  // 전체 마이그레이션 상태 조회
  getProgress(): MigrationProgress {
    return { ...this.progress };
  }
}

// 필드 매핑 사전 정의 (기존 DB → Supabase)
export const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  transport_companies: {
    '운송사명': 'name',
    '사업자번호': 'business_number',
    '대표자': 'representative',
    '전화번호': 'phone',
    '팩스': 'fax',
    '주소': 'address',
    '이메일': 'email',
    '은행명': 'bank_name',
    '계좌번호': 'account_number',
    '예금주': 'account_holder',
    '비고': 'memo',
  },
  customers: {
    '거래처명': 'name',
    '사업자번호': 'business_number',
    '대표자': 'representative',
    '전화번호': 'phone',
    '팩스': 'fax',
    '주소': 'address',
    '납품주소': 'delivery_address',
    '이메일': 'email',
    '비고': 'memo',
  },
  drivers: {
    '기사명': 'name',
    '연락처': 'phone',
    '차량번호': 'vehicle_number',
    '차종': 'vehicle_type',
    '톤수': 'vehicle_tonnage',
    '면허번호': 'license_number',
    '비고': 'memo',
  },
  products: {
    '제품코드': 'code',
    '제품명': 'name',
    '규격': 'specification',
    '단위': 'unit',
    '단가': 'unit_price',
    '분류': 'category',
    '비고': 'memo',
  },
};
