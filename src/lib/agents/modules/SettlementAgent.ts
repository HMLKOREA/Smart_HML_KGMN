/**
 * SettlementAgent — 정산관리 에이전트
 *
 * 기능:
 * - 운송사별 월간 정산 자동 계산
 * - shipments × unit_prices 크로스 조인으로 금액 산출
 * - 정산서 생성/확정/취소
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settlement, UnitPrice } from '@/types';
import { ModuleAgent } from '../core/ModuleAgent';
import type { AgentConfig, ValidationRule } from '../core/types';

export const SETTLEMENT_AGENT_CONFIG: AgentConfig = {
  id: 'settlement',
  name: '정산관리',
  description: '운송사별 월간 운송비 정산',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'monitor'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true, custom: { confirm: true, generateAll: true } },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
  },
  options: {},
};

/** 정산 계산 결과 (한 운송사) */
export interface SettlementCalcResult {
  companyId: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  items: {
    shipmentId: string;
    shipmentDate: string;
    customerName: string;
    productName: string;
    transportType: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  totalQuantity: number;
  totalAmount: number;
  taxAmount: number;
  finalAmount: number;
}

export class SettlementAgent extends ModuleAgent<Settlement> {
  protected validationRules: ValidationRule[] = [
    { field: 'company_id', type: 'required', message: '운송사를 선택하세요' },
    { field: 'period_start', type: 'required', message: '정산 시작일을 입력하세요' },
    { field: 'period_end', type: 'required', message: '정산 종료일을 입력하세요' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(
      supabase,
      { ...SETTLEMENT_AGENT_CONFIG, ...config },
      'settlements',
      'v_settlements',
    );
  }

  // ─── 정산 계산 ────────────────────────────────

  /** 특정 운송사의 기간별 정산 계산 */
  async calculateSettlement(
    companyId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<SettlementCalcResult> {
    // 1) 해당 기간 출하 데이터
    const { data: shipments } = await this.supabase
      .from('v_shipments')
      .select('*')
      .eq('company_id', companyId)
      .gte('shipment_date', periodStart)
      .lte('shipment_date', periodEnd)
      .order('shipment_date', { ascending: true });

    // 2) 해당 운송사 단가 데이터
    const { data: prices } = await this.supabase
      .from('unit_prices')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true);

    const companyName = (shipments?.[0] as Record<string, unknown>)?.company_name as string || '';
    const priceMap = this.buildPriceMap(prices as UnitPrice[] || []);

    const items = ((shipments || []) as Record<string, unknown>[]).map(s => {
      const key = `${s.customer_id}:${s.product_id}`;
      const unitPrice = priceMap.get(key) || 0;
      const qty = Number(s.weight_net || s.quantity || 0);
      const amount = Math.round(qty * unitPrice);

      return {
        shipmentId: s.id as string,
        shipmentDate: s.shipment_date as string,
        customerName: (s.customer_name as string) || '',
        productName: (s.product_name as string) || '',
        transportType: (s.transport_type as string) || '',
        quantity: qty,
        unitPrice,
        amount,
      };
    });

    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const taxAmount = Math.round(totalAmount * 0.1);

    return {
      companyId,
      companyName,
      periodStart,
      periodEnd,
      items,
      totalQuantity,
      totalAmount,
      taxAmount,
      finalAmount: totalAmount + taxAmount,
    };
  }

  /** 전체 운송사 월간 정산 요약 */
  async calculateAllCompanies(
    periodStart: string,
    periodEnd: string,
  ): Promise<SettlementCalcResult[]> {
    // 운송사 목록 조회
    const { data: companies } = await this.supabase
      .from('transport_companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    const results: SettlementCalcResult[] = [];
    for (const company of (companies || []) as { id: string; name: string }[]) {
      const calc = await this.calculateSettlement(company.id, periodStart, periodEnd);
      if (calc.items.length > 0) {
        results.push(calc);
      }
    }

    return results;
  }

  /** 정산 확정 */
  async confirmSettlement(id: string): Promise<Settlement> {
    return this.update(id, {
      status: 'confirmed',
      settlement_date: new Date().toISOString().split('T')[0],
    } as Partial<Settlement>);
  }

  // ─── 내부 유틸 ────────────────────────────────

  /** customer_id:product_id → price 매핑 */
  private buildPriceMap(prices: UnitPrice[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const p of prices) {
      // customer_id가 없는 unit_prices는 product_id만으로 매핑
      // 현재 unit_prices 스키마에 customer_id가 없으므로 product_id 기준
      const key = `${(p as unknown as Record<string, unknown>).customer_id || ''}:${p.product_id}`;
      map.set(key, p.price);
    }
    return map;
  }
}
