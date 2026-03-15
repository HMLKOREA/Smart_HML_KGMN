/**
 * 자가점검 에이전트 (Health Check Agent)
 *
 * 각 모듈의 상태를 주기적으로 점검하고 문제 발생 시
 * 로그를 기록하며 관리자에게 알림을 보냅니다.
 */

import type { HealthCheckResult } from '@/types';

// 클라이언트 사이드 Health Check Agent
export class HealthCheckAgent {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly checkIntervalMs: number;
  private onResultCallback: ((results: HealthCheckResult[]) => void) | null = null;

  constructor(checkIntervalMinutes: number = 5) {
    this.checkIntervalMs = checkIntervalMinutes * 60 * 1000;
  }

  // 점검 시작
  start(onResult?: (results: HealthCheckResult[]) => void) {
    if (onResult) {
      this.onResultCallback = onResult;
    }

    // 즉시 1회 실행
    this.runCheck();

    // 주기적 실행
    this.interval = setInterval(() => {
      this.runCheck();
    }, this.checkIntervalMs);

    console.log(`[HealthCheckAgent] 시작됨 (${this.checkIntervalMs / 1000}초 간격)`);
  }

  // 점검 중지
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('[HealthCheckAgent] 중지됨');
  }

  // 단일 점검 실행
  async runCheck(): Promise<HealthCheckResult[]> {
    try {
      const response = await fetch('/api/health-check');
      const data = await response.json();

      if (this.onResultCallback) {
        this.onResultCallback(data.results);
      }

      // 에러가 있으면 콘솔에 경고
      if (data.status === 'error') {
        console.error('[HealthCheckAgent] 오류 감지:', data.results.filter((r: HealthCheckResult) => r.status === 'error'));
      } else if (data.status === 'warning') {
        console.warn('[HealthCheckAgent] 경고 감지:', data.results.filter((r: HealthCheckResult) => r.status === 'warning'));
      }

      return data.results;
    } catch (error) {
      console.error('[HealthCheckAgent] 점검 실행 실패:', error);
      return [{
        module: 'health_check_agent',
        status: 'error',
        message: '자가점검 에이전트 실행 실패',
        timestamp: new Date().toISOString(),
      }];
    }
  }

  // 특정 모듈 점검
  async checkModule(moduleName: string): Promise<HealthCheckResult> {
    try {
      const results = await this.runCheck();
      const moduleResult = results.find(r => r.module === moduleName);
      return moduleResult || {
        module: moduleName,
        status: 'warning',
        message: '모듈을 찾을 수 없습니다',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        module: moduleName,
        status: 'error',
        message: '모듈 점검 실패',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// 모듈별 유효성 검증 규칙
export const validationRules = {
  shipments: {
    requiredFields: ['shipment_date', 'shipment_number', 'customer_id', 'product_id'],
    statusValues: ['pending', 'dispatched', 'in_transit', 'delivered', 'completed', 'cancelled'],
  },
  dispatches: {
    requiredFields: ['dispatch_date', 'dispatch_number', 'company_id', 'driver_id'],
    statusValues: ['assigned', 'departed', 'arrived', 'completed', 'cancelled'],
  },
  transport_companies: {
    requiredFields: ['name'],
  },
  customers: {
    requiredFields: ['name'],
  },
  drivers: {
    requiredFields: ['name', 'vehicle_number'],
  },
  products: {
    requiredFields: ['code', 'name'],
  },
  quality_reports: {
    requiredFields: ['report_number', 'report_date', 'product_id'],
    statusValues: ['draft', 'approved', 'issued'],
  },
  settlements: {
    requiredFields: ['settlement_number', 'company_id', 'period_start', 'period_end'],
    statusValues: ['draft', 'confirmed', 'paid', 'cancelled'],
  },
};

// 데이터 유효성 검증
export function validateRecord(
  module: keyof typeof validationRules,
  record: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const rules = validationRules[module];
  const errors: string[] = [];

  // 필수 필드 체크
  for (const field of rules.requiredFields) {
    if (!record[field] && record[field] !== 0) {
      errors.push(`필수 항목 누락: ${field}`);
    }
  }

  // 상태값 체크
  if ('statusValues' in rules && record.status) {
    if (!rules.statusValues.includes(record.status as string)) {
      errors.push(`유효하지 않은 상태값: ${record.status}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
