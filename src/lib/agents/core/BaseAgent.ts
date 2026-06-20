/**
 * BaseAgent — 모든 에이전트의 기반 클래스
 *
 * 역할:
 * - 설정(AgentConfig) 관리
 * - 상태(AgentState) 관리
 * - 이벤트 발행/구독
 * - 미들웨어(훅) 체인
 * - 로깅
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentEvent,
  AgentEventType,
  AgentEventHandler,
  MiddlewareFn,
  MiddlewareAction,
  MiddlewareContext,
  ValidationRule,
  ValidationResult,
} from './types';

export abstract class BaseAgent<T = unknown> {
  protected supabase: SupabaseClient;
  protected config: AgentConfig;
  protected state: AgentState;

  private listeners = new Map<AgentEventType, Set<AgentEventHandler>>();
  private middlewares = new Map<string, MiddlewareFn<T>[]>(); // "before:create" etc.
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** 모듈별 검증 규칙 (서브클래스에서 오버라이드) */
  protected validationRules: ValidationRule[] = [];

  constructor(supabase: SupabaseClient, config: AgentConfig) {
    this.supabase = supabase;
    this.config = { ...config };
    this.state = {
      status: 'idle',
      lastRefresh: null,
      error: null,
      dataCount: 0,
    };
  }

  // ─── 설정 ──────────────────────────────────────

  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }

  updateConfig(partial: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...partial };
    this.emit('config:changed', this.config);

    // 자동 새로고침 간격 변경 시 타이머 재시작
    if ('autoRefreshInterval' in partial) {
      this.stopAutoRefresh();
      if (this.config.autoRefreshInterval > 0) {
        this.startAutoRefresh();
      }
    }
  }

  // ─── 상태 ──────────────────────────────────────

  getState(): Readonly<AgentState> {
    return { ...this.state };
  }

  protected setStatus(status: AgentStatus, error?: string): void {
    this.state = {
      ...this.state,
      status,
      error: error || null,
    };
    this.emit('status:changed', { status, error });
  }

  // ─── 권한 체크 ────────────────────────────────

  canPerform(role: string, action: 'read' | 'create' | 'update' | 'delete' | 'export'): boolean {
    const perms = this.config.permissions[role];
    if (!perms) return false;
    return perms[action] ?? false;
  }

  canCustom(role: string, customAction: string): boolean {
    const perms = this.config.permissions[role];
    return perms?.custom?.[customAction] ?? false;
  }

  // ─── 이벤트 ───────────────────────────────────

  on(type: AgentEventType, handler: AgentEventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    // 구독 해제 함수 반환
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  protected emit(type: AgentEventType, payload?: unknown): void {
    const event: AgentEvent = {
      type,
      agentId: this.config.id,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.listeners.get(type)?.forEach(handler => {
      try {
        handler(event);
      } catch (err) {
        this.log('error', `이벤트 핸들러 오류 [${type}]:`, err);
      }
    });
  }

  // ─── 미들웨어 ─────────────────────────────────

  use(phase: 'before' | 'after', action: MiddlewareAction, fn: MiddlewareFn<T>): void {
    const key = `${phase}:${action}`;
    if (!this.middlewares.has(key)) {
      this.middlewares.set(key, []);
    }
    this.middlewares.get(key)!.push(fn);
  }

  protected async runMiddleware(
    phase: 'before' | 'after',
    action: MiddlewareAction,
    ctx: MiddlewareContext<T>,
  ): Promise<MiddlewareContext<T>> {
    const key = `${phase}:${action}`;
    const fns = this.middlewares.get(key) || [];

    let current = ctx;
    for (const fn of fns) {
      current = await fn(current);
      if (current.abort) {
        this.log('warn', `미들웨어 중단 [${key}]: ${current.abortReason}`);
        break;
      }
    }
    return current;
  }

  // ─── 검증 ─────────────────────────────────────

  validate(record: Record<string, unknown>): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    for (const rule of this.validationRules) {
      const value = record[rule.field];

      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            errors.push({ field: rule.field, message: rule.message });
          }
          break;
        case 'min':
          if (typeof value === 'number' && value < (rule.value as number)) {
            errors.push({ field: rule.field, message: rule.message });
          }
          break;
        case 'max':
          if (typeof value === 'number' && value > (rule.value as number)) {
            errors.push({ field: rule.field, message: rule.message });
          }
          break;
        case 'pattern':
          if (typeof value === 'string' && !(rule.value as RegExp).test(value)) {
            errors.push({ field: rule.field, message: rule.message });
          }
          break;
        case 'custom':
          if (rule.validate && !rule.validate(value, record)) {
            errors.push({ field: rule.field, message: rule.message });
          }
          break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── 자동 새로고침 ────────────────────────────

  startAutoRefresh(): void {
    if (this.refreshTimer) return;
    const ms = this.config.autoRefreshInterval * 1000;
    if (ms <= 0) return;

    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, ms);
    this.log('info', `자동 새로고침 시작 (${this.config.autoRefreshInterval}초)`);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.log('info', '자동 새로고침 중지');
    }
  }

  /** 서브클래스에서 구현: 데이터 새로고침 */
  abstract refresh(): Promise<void>;

  // ─── 로깅 ─────────────────────────────────────

  protected log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    const prefix = `[${this.config.id}]`;
    switch (level) {
      case 'info':
        console.log(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
    }
  }

  // ─── 정리 ─────────────────────────────────────

  destroy(): void {
    this.stopAutoRefresh();
    this.listeners.clear();
    this.middlewares.clear();
    this.log('info', '에이전트 종료');
  }
}
