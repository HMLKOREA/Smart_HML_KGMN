/**
 * ShippingAgent — 출하관리 에이전트
 *
 * 기능:
 * - 출하 목록 조회 (날짜/거래처/운송구분 필터)
 * - 출하 등록/수정/삭제
 * - 출하 확정 (is_confirmed 토글)
 * - 출하증 발급시간 기록
 * - 운송사 대기화면 데이터 제공
 * - 엑셀 내보내기용 데이터 가공
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Shipment } from '@/types';
import { ModuleAgent } from '../core/ModuleAgent';
import type { AgentConfig, ValidationRule } from '../core/types';

/** 출하 에이전트 기본 설정 */
export const SHIPPING_AGENT_CONFIG: AgentConfig = {
  id: 'shipping',
  name: '출하관리',
  description: '출하 등록, 확정, 출하증 발급 관리',
  enabled: true,
  autoRefreshInterval: 0, // 페이지에서 수동 제어
  allowedRoles: ['admin', 'monitor', 'field', 'transporter'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true, custom: { confirm: true, print: true, bulkConfirm: true } },
    monitor: { read: true, create: false, update: false, delete: false, export: true, custom: { confirm: false, print: false } },
    field: { read: true, create: true, update: true, delete: false, export: true, custom: { confirm: true, print: true, bulkConfirm: false } },
    transporter: { read: true, create: false, update: true, delete: false, export: false, custom: { confirm: false, print: false, updateWeight: true } },
  },
  options: {
    /** 운송 구분 */
    transportTypes: ['탱크', '덤프', '카고'],
    /** 대기화면 비밀번호 */
    waitingScreenPassword: '1234',
    /** 운송사 표시 순서 */
    companyDisplayOrder: ['퍼스트', '성진', '대경', '강천', '우주', '성윤', '우신', '태윤', '동방', '진흥', '상차도'],
  },
};

export class ShippingAgent extends ModuleAgent<Shipment> {
  protected validationRules: ValidationRule[] = [
    { field: 'shipment_date', type: 'required', message: '출하일자는 필수입니다' },
    { field: 'customer_id', type: 'required', message: '거래처를 선택하세요' },
    { field: 'product_id', type: 'required', message: '제품을 선택하세요' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(
      supabase,
      { ...SHIPPING_AGENT_CONFIG, ...config },
      'shipments',
      'v_shipments',
    );

    // 미들웨어: 수정 전 shipment_number 자동 생성
    this.use('before', 'create', async (ctx) => {
      if (ctx.data && !('shipment_number' in ctx.data && (ctx.data as Record<string, unknown>).shipment_number)) {
        const num = await this.generateShipmentNumber(
          (ctx.data as Record<string, unknown>).shipment_date as string
        );
        (ctx.data as Record<string, unknown>).shipment_number = num;
      }
      return ctx;
    });

    // 미들웨어: 생성 후 activity_log 기록
    this.use('after', 'create', async (ctx) => {
      if (ctx.result && ctx.userId) {
        await this.logActivity('create', ctx.result.id, ctx.userId);
      }
      return ctx;
    });

    this.use('after', 'update', async (ctx) => {
      if (ctx.id && ctx.userId) {
        await this.logActivity('update', ctx.id, ctx.userId);
      }
      return ctx;
    });
  }

  // ─── 출하 고유 기능 ───────────────────────────

  /** 출하번호 자동 생성 (YYYYMMDD-NNN) */
  async generateShipmentNumber(date: string): Promise<string> {
    const datePrefix = date.replace(/-/g, '');
    const { count } = await this.supabase
      .from('shipments')
      .select('*', { count: 'exact', head: true })
      .eq('shipment_date', date);

    const seq = String((count || 0) + 1).padStart(3, '0');
    return `${datePrefix}-${seq}`;
  }

  /** 출하 확정 토글 */
  async toggleConfirm(id: string, confirmed: boolean): Promise<Shipment> {
    const updates: Partial<Shipment> = {
      is_confirmed: confirmed,
    };

    // 확정 시 출하증 발급시간 기록
    if (confirmed) {
      updates.certificate_time = new Date().toISOString();
    }

    return this.update(id, updates);
  }

  /** 일괄 확정 */
  async bulkConfirm(ids: string[], confirmed: boolean): Promise<void> {
    const updates: Partial<Shipment> = {
      is_confirmed: confirmed,
      ...(confirmed ? { certificate_time: new Date().toISOString() } : {}),
    };
    await this.bulkUpdate(ids, updates);
    this.emit('data:updated', { action: 'bulkConfirm', ids, confirmed });
  }

  /** 계근 결과 입력 (운송사용) */
  async updateWeight(
    id: string,
    weightEmpty: number,
    weightLoaded: number,
  ): Promise<Shipment> {
    return this.update(id, {
      weight_empty: weightEmpty,
      weight_loaded: weightLoaded,
      weight_net: weightLoaded - weightEmpty,
    } as Partial<Shipment>);
  }

  /** 날짜별 출하 통계 */
  async getDailyStats(date: string): Promise<{
    total: number;
    confirmed: number;
    unconfirmed: number;
    totalWeight: number;
    byTransportType: Record<string, number>;
    byCompany: Record<string, number>;
  }> {
    const { data } = await this.supabase
      .from('v_shipments')
      .select('*')
      .eq('shipment_date', date);

    const shipments = (data || []) as Shipment[];
    const confirmed = shipments.filter(s => s.is_confirmed);
    const byTransportType: Record<string, number> = {};
    const byCompany: Record<string, number> = {};

    for (const s of shipments) {
      const tt = s.transport_type || '미분류';
      byTransportType[tt] = (byTransportType[tt] || 0) + 1;
      const cn = s.company_name || '미배정';
      byCompany[cn] = (byCompany[cn] || 0) + 1;
    }

    return {
      total: shipments.length,
      confirmed: confirmed.length,
      unconfirmed: shipments.length - confirmed.length,
      totalWeight: shipments.reduce((sum, s) => sum + (s.weight_net || 0), 0),
      byTransportType,
      byCompany,
    };
  }

  /** 운송사 대기화면용 데이터 (회사별 당일 배차) */
  async getWaitingScreenData(
    date: string,
    companyId?: string,
  ): Promise<Shipment[]> {
    let query = this.supabase
      .from('v_shipments')
      .select('*')
      .eq('shipment_date', date)
      .order('created_at', { ascending: true });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data } = await query;
    return (data as Shipment[]) || [];
  }

  // ─── 내부 유틸 ────────────────────────────────

  private async logActivity(
    action: string,
    targetId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.supabase.from('activity_logs').insert({
        action: `shipment:${action}`,
        target_id: targetId,
        user_id: userId,
        module: 'shipping',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // 로그 실패는 무시
    }
  }
}
