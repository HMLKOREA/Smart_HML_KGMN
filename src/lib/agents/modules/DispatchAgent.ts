/**
 * DispatchAgent — 배차관리 에이전트
 *
 * 기능:
 * - 배차 등록/수정/삭제
 * - 출하 ↔ 배차 연동
 * - 운송사별 배차 현황
 * - (향후) SMS 알림 연동
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dispatch } from '@/types';
import { ModuleAgent } from '../core/ModuleAgent';
import type { AgentConfig, ValidationRule } from '../core/types';

export const DISPATCH_AGENT_CONFIG: AgentConfig = {
  id: 'dispatch',
  name: '배차관리',
  description: '운송사별 차량 배차 및 알림 관리',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'field'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true, custom: { notify: true, autoDispatch: true } },
    field: { read: true, create: true, update: true, delete: false, export: true, custom: { notify: true } },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
    transporter: { read: true, create: false, update: true, delete: false, export: false, custom: { updateStatus: true } },
  },
  options: {
    smsEnabled: false, // 향후 SMS API 연동 시 활성화
    autoDispatchEnabled: false,
  },
};

export class DispatchAgent extends ModuleAgent<Dispatch> {
  protected validationRules: ValidationRule[] = [
    { field: 'dispatch_date', type: 'required', message: '배차일자는 필수입니다' },
    { field: 'company_id', type: 'required', message: '운송사를 선택하세요' },
    { field: 'driver_id', type: 'required', message: '기사를 선택하세요' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(
      supabase,
      { ...DISPATCH_AGENT_CONFIG, ...config },
      'dispatches',
      'v_dispatches',
    );
  }

  // ─── 배차 고유 기능 ───────────────────────────

  /** 배차번호 자동 생성 */
  async generateDispatchNumber(date: string): Promise<string> {
    const prefix = `D${date.replace(/-/g, '')}`;
    const { count } = await this.supabase
      .from('dispatches')
      .select('*', { count: 'exact', head: true })
      .eq('dispatch_date', date);

    const seq = String((count || 0) + 1).padStart(3, '0');
    return `${prefix}-${seq}`;
  }

  /** 출하에서 배차 생성 */
  async createFromShipment(
    shipmentId: string,
    companyId: string,
    driverId: string,
    date: string,
  ): Promise<Dispatch> {
    const number = await this.generateDispatchNumber(date);

    return this.create({
      dispatch_date: date,
      dispatch_number: number,
      shipment_id: shipmentId,
      company_id: companyId,
      driver_id: driverId,
      status: 'assigned',
    } as Partial<Dispatch>);
  }

  /** 상태 업데이트 */
  async updateStatus(
    id: string,
    status: 'assigned' | 'departed' | 'arrived' | 'completed' | 'cancelled',
  ): Promise<Dispatch> {
    const updates: Partial<Dispatch> = { status };

    if (status === 'departed') {
      updates.departure_time = new Date().toISOString();
    } else if (status === 'arrived') {
      updates.arrival_time = new Date().toISOString();
    }

    return this.update(id, updates);
  }

  /** 운송사별 당일 배차 현황 */
  async getDailyByCompany(date: string): Promise<Record<string, Dispatch[]>> {
    const { data } = await this.supabase
      .from('v_dispatches')
      .select('*')
      .eq('dispatch_date', date)
      .order('created_at', { ascending: true });

    const byCompany: Record<string, Dispatch[]> = {};
    for (const d of (data || []) as Dispatch[]) {
      const name = d.company_name || '미배정';
      if (!byCompany[name]) byCompany[name] = [];
      byCompany[name].push(d);
    }
    return byCompany;
  }

  /** SMS 알림 발송 (향후 구현) */
  async sendNotification(_dispatchId: string): Promise<{ success: boolean; message: string }> {
    if (!this.config.options.smsEnabled) {
      return { success: false, message: 'SMS 기능이 비활성화되어 있습니다' };
    }
    // TODO: SMS API 연동
    return { success: false, message: 'SMS API 미구현' };
  }
}
