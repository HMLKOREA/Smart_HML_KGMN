/**
 * Agent Core Types
 * 에이전트 시스템의 공통 타입 정의
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole, PaginationParams, DateRange } from '@/types';

// ── Agent 설정 ──────────────────────────────────────
export interface AgentConfig {
  /** 에이전트 고유 ID */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 설명 */
  description: string;
  /** 활성 여부 */
  enabled: boolean;
  /** 자동 새로고침 간격 (초). 0이면 비활성 */
  autoRefreshInterval: number;
  /** 접근 가능 역할 */
  allowedRoles: UserRole[];
  /** 역할별 권한 */
  permissions: RolePermissions;
  /** 추가 설정 (모듈별 커스텀) */
  options: Record<string, unknown>;
}

export interface RolePermissions {
  /** CRUD 권한 매트릭스 */
  [role: string]: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    export: boolean;
    /** 모듈별 추가 권한 */
    custom?: Record<string, boolean>;
  };
}

// ── Agent 상태 ──────────────────────────────────────
export type AgentStatus = 'idle' | 'loading' | 'ready' | 'error' | 'refreshing';

export interface AgentState {
  status: AgentStatus;
  lastRefresh: string | null;
  error: string | null;
  dataCount: number;
}

// ── Agent 이벤트 ────────────────────────────────────
export type AgentEventType =
  | 'data:loaded'
  | 'data:created'
  | 'data:updated'
  | 'data:deleted'
  | 'data:refreshed'
  | 'error'
  | 'status:changed'
  | 'config:changed';

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  timestamp: string;
  payload?: unknown;
}

export type AgentEventHandler = (event: AgentEvent) => void;

// ── 쿼리 파라미터 ───────────────────────────────────
export interface QueryParams {
  dateRange?: DateRange;
  dateField?: string;
  search?: string;
  searchFields?: string[];
  filters?: Record<string, unknown>;
  orderBy?: string;
  orderAsc?: boolean;
  pagination?: PaginationParams;
}

// ── Middleware (훅) ──────────────────────────────────
export type MiddlewarePhase = 'before' | 'after';
export type MiddlewareAction = 'create' | 'update' | 'delete' | 'list';

export interface MiddlewareContext<T = unknown> {
  action: MiddlewareAction;
  phase: MiddlewarePhase;
  data?: T | Partial<T>;
  id?: string;
  userId?: string;
  userRole?: UserRole;
  supabase: SupabaseClient;
  /** middleware에서 수정 가능한 결과 */
  result?: T;
  /** middleware 체인 중단 여부 */
  abort?: boolean;
  abortReason?: string;
}

export type MiddlewareFn<T = unknown> = (
  ctx: MiddlewareContext<T>
) => Promise<MiddlewareContext<T>> | MiddlewareContext<T>;

// ── 검증 규칙 ───────────────────────────────────────
export interface ValidationRule {
  field: string;
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: unknown;
  message: string;
  validate?: (value: unknown, record: Record<string, unknown>) => boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string }[];
}
