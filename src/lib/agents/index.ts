/**
 * 에이전트 모듈 인덱스
 *
 * 각 모듈별 에이전트를 관리합니다:
 * - DataAgent: 데이터 CRUD 에이전트
 * - HealthCheckAgent: 자가점검 에이전트
 */

export { DataAgent } from './dataAgent';
export { HealthCheckAgent, validateRecord, validationRules } from './healthCheckAgent';

import { DataAgent } from './dataAgent';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Shipment,
  Dispatch,
  TransportCompany,
  Customer,
  Driver,
  Product,
  QualityReport,
  Settlement,
  UnitPrice,
} from '@/types';

/**
 * 모듈별 에이전트 팩토리
 * Supabase 클라이언트를 받아 각 모듈의 DataAgent를 생성합니다.
 */
export function createModuleAgents(supabase: SupabaseClient) {
  return {
    // 출하관리 에이전트
    shipments: new DataAgent<Shipment>(supabase, 'shipments', 'v_shipments'),

    // 배차관리 에이전트
    dispatches: new DataAgent<Dispatch>(supabase, 'dispatches', 'v_dispatches'),

    // 운송사관리 에이전트
    companies: new DataAgent<TransportCompany>(supabase, 'transport_companies'),

    // 거래처관리 에이전트
    customers: new DataAgent<Customer>(supabase, 'customers'),

    // 기사관리 에이전트
    drivers: new DataAgent<Driver>(supabase, 'drivers', 'v_drivers'),

    // 제품코드관리 에이전트
    products: new DataAgent<Product>(supabase, 'products'),

    // 성적서관리 에이전트
    reports: new DataAgent<QualityReport>(supabase, 'quality_reports', 'v_quality_reports'),

    // 정산관리 에이전트
    settlements: new DataAgent<Settlement>(supabase, 'settlements', 'v_settlements'),

    // 단가관리 에이전트
    unitPrices: new DataAgent<UnitPrice>(supabase, 'unit_prices'),
  };
}
