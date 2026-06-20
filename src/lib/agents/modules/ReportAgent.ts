/**
 * ReportAgent — 성적서관리 에이전트
 *
 * 기능:
 * - 성적서 등록/수정/삭제
 * - 양식별 성적서 생성
 * - 승인 워크플로우
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QualityReport } from '@/types';
import { ModuleAgent } from '../core/ModuleAgent';
import type { AgentConfig, ValidationRule } from '../core/types';

export const REPORT_AGENT_CONFIG: AgentConfig = {
  id: 'report',
  name: '성적서관리',
  description: '품질 성적서 관리 및 인쇄',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'monitor', 'field'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true, custom: { approve: true, issue: true } },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
    field: { read: true, create: true, update: true, delete: false, export: true, custom: { approve: false } },
  },
  options: {
    templateTypes: Array.from({ length: 11 }, (_, i) => i + 1),
  },
};

export class ReportAgent extends ModuleAgent<QualityReport> {
  protected validationRules: ValidationRule[] = [
    { field: 'report_date', type: 'required', message: '성적서 날짜는 필수입니다' },
    { field: 'product_id', type: 'required', message: '제품을 선택하세요' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(
      supabase,
      { ...REPORT_AGENT_CONFIG, ...config },
      'quality_reports',
      'v_quality_reports',
    );
  }

  /** 성적서 번호 자동 생성 */
  async generateReportNumber(date: string): Promise<string> {
    const prefix = `QR${date.replace(/-/g, '')}`;
    const { count } = await this.supabase
      .from('quality_reports')
      .select('*', { count: 'exact', head: true })
      .like('report_number', `${prefix}%`);

    const seq = String((count || 0) + 1).padStart(3, '0');
    return `${prefix}-${seq}`;
  }

  /** 승인 처리 */
  async approve(id: string, approvedBy: string): Promise<QualityReport> {
    return this.update(id, {
      status: 'approved',
      approved_by: approvedBy,
    } as Partial<QualityReport>);
  }

  /** 발행 처리 */
  async issue(id: string): Promise<QualityReport> {
    return this.update(id, {
      status: 'issued',
    } as Partial<QualityReport>);
  }
}
