/**
 * ProductionAgent — 생산현황 에이전트
 *
 * 기능:
 * - 주간 생산 일정 관리
 * - KPI 집계 (계획 vs 실적)
 * - 현장 모니터용 자동 새로고침
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductionSchedule } from '@/types';
import { ModuleAgent } from '../core/ModuleAgent';
import type { AgentConfig, ValidationRule } from '../core/types';

export const PRODUCTION_AGENT_CONFIG: AgentConfig = {
  id: 'production',
  name: '생산현황',
  description: '생산 일정 및 실적 관리, 현장 모니터 지원',
  enabled: true,
  autoRefreshInterval: 30, // 30초 자동 갱신
  allowedRoles: ['admin', 'monitor', 'field'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
    field: { read: true, create: true, update: true, delete: false, export: true },
  },
  options: {
    transportCategories: [
      { value: 'cargo_truck', label: '화물차 (Cargo Truck)' },
      { value: 'tank_lorry', label: 'BCT (Tank Lorry)' },
    ],
    subCategories: {
      cargo_truck: ['K10', '광성화학', '기타'],
      tank_lorry: ['탈황용', '공업용'],
    },
  },
};

export class ProductionAgent extends ModuleAgent<ProductionSchedule> {
  protected validationRules: ValidationRule[] = [
    { field: 'schedule_date', type: 'required', message: '날짜는 필수입니다' },
    { field: 'sub_category', type: 'required', message: '세부구분을 선택하세요' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(
      supabase,
      { ...PRODUCTION_AGENT_CONFIG, ...config },
      'production_schedules',
      'v_production_schedules',
    );
  }

  // ─── 주간 데이터 ──────────────────────────────

  /** 주간 일정 조회 */
  async getWeekSchedules(weekStart: Date): Promise<ProductionSchedule[]> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = this.localDateStr(weekStart);
    const endStr = this.localDateStr(weekEnd);

    const { data, error } = await this.supabase
      .from('v_production_schedules')
      .select('*')
      .gte('schedule_date', startStr)
      .lte('schedule_date', endStr)
      .order('schedule_date', { ascending: true });

    if (error) {
      this.log('error', '주간 조회 실패:', error.message);
      return [];
    }

    this.cachedData = (data as ProductionSchedule[]) || [];
    return this.cachedData;
  }

  /** KPI 집계 */
  getKPI(schedules: ProductionSchedule[]): {
    cargo: { planned_trucks: number; actual_trucks: number; planned_qty: number; actual_qty: number; rate: number };
    tank: { planned_trucks: number; actual_trucks: number; planned_qty: number; actual_qty: number; rate: number };
    total: { planned_trucks: number; actual_trucks: number; planned_qty: number; actual_qty: number; rate: number };
  } {
    const calc = (items: ProductionSchedule[]) => {
      const planned_trucks = items.reduce((s, i) => s + (i.planned_trucks || 0), 0);
      const actual_trucks = items.reduce((s, i) => s + (i.actual_trucks || 0), 0);
      const planned_qty = items.reduce((s, i) => s + Number(i.planned_quantity || 0), 0);
      const actual_qty = items.reduce((s, i) => s + Number(i.actual_quantity || 0), 0);
      const rate = planned_qty > 0 ? Math.round((actual_qty / planned_qty) * 100) : 0;
      return { planned_trucks, actual_trucks, planned_qty, actual_qty, rate };
    };

    const cargo = schedules.filter(s => s.transport_category === 'cargo_truck');
    const tank = schedules.filter(s => s.transport_category === 'tank_lorry');

    return {
      cargo: calc(cargo),
      tank: calc(tank),
      total: calc(schedules),
    };
  }

  /** 실적 빠른 입력 */
  async updateActuals(
    id: string,
    actualQuantity: number,
    actualTrucks: number,
  ): Promise<ProductionSchedule> {
    return this.update(id, {
      actual_quantity: actualQuantity,
      actual_trucks: actualTrucks,
      status: 'in_progress',
    } as Partial<ProductionSchedule>);
  }

  /** 완료 처리 */
  async markCompleted(id: string): Promise<ProductionSchedule> {
    return this.update(id, { status: 'completed' } as Partial<ProductionSchedule>);
  }

  // ─── 유틸 ─────────────────────────────────────

  private localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
