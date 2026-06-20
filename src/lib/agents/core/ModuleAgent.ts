/**
 * ModuleAgent — CRUD 기능이 내장된 모듈 에이전트
 *
 * BaseAgent를 확장하여 Supabase 테이블 CRUD와
 * 비즈니스 로직 훅을 결합합니다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaginatedResult } from '@/types';
import type { AgentConfig, QueryParams, MiddlewareContext } from './types';
import { BaseAgent } from './BaseAgent';

export abstract class ModuleAgent<T extends { id: string }> extends BaseAgent<T> {
  protected tableName: string;
  protected viewName?: string;

  /** 마지막 로드된 데이터 (캐시) */
  protected cachedData: T[] = [];

  constructor(
    supabase: SupabaseClient,
    config: AgentConfig,
    tableName: string,
    viewName?: string,
  ) {
    super(supabase, config);
    this.tableName = tableName;
    this.viewName = viewName;
  }

  // ─── 목록 조회 ────────────────────────────────

  async list(params?: QueryParams): Promise<PaginatedResult<T>> {
    this.setStatus('loading');
    try {
      const source = this.viewName || this.tableName;
      let query = this.supabase.from(source).select('*', { count: 'exact' });

      // 날짜 범위
      if (params?.dateRange && params?.dateField) {
        query = query
          .gte(params.dateField, params.dateRange.start)
          .lte(params.dateField, params.dateRange.end);
      }

      // 텍스트 검색
      if (params?.search && params?.searchFields?.length) {
        const conditions = params.searchFields
          .map(f => `${f}.ilike.%${params.search}%`)
          .join(',');
        query = query.or(conditions);
      }

      // 필터
      if (params?.filters) {
        for (const [key, value] of Object.entries(params.filters)) {
          if (value !== undefined && value !== null && value !== '') {
            query = query.eq(key, value);
          }
        }
      }

      // 정렬
      if (params?.orderBy) {
        query = query.order(params.orderBy, { ascending: params?.orderAsc ?? false });
      }

      // 페이지네이션
      const page = params?.pagination?.page ?? 1;
      const pageSize = params?.pagination?.pageSize ?? 50;
      query = query.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, error, count } = await query;

      if (error) {
        this.setStatus('error', error.message);
        throw new Error(`목록 조회 실패: ${error.message}`);
      }

      const result: PaginatedResult<T> = {
        data: (data as T[]) || [],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };

      this.cachedData = result.data;
      this.state.dataCount = result.total;
      this.state.lastRefresh = new Date().toISOString();
      this.setStatus('ready');
      this.emit('data:loaded', { count: result.total });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      this.setStatus('error', msg);
      throw err;
    }
  }

  // ─── 단건 조회 ────────────────────────────────

  async getById(id: string): Promise<T | null> {
    const source = this.viewName || this.tableName;
    const { data, error } = await this.supabase
      .from(source)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      this.log('error', `조회 실패 [${id}]:`, error.message);
      return null;
    }
    return data as T;
  }

  // ─── 생성 ─────────────────────────────────────

  async create(
    record: Partial<T>,
    userId?: string,
    userRole?: string,
  ): Promise<T> {
    // before 미들웨어
    let ctx: MiddlewareContext<T> = {
      action: 'create',
      phase: 'before',
      data: record,
      userId,
      userRole: userRole as MiddlewareContext['userRole'],
      supabase: this.supabase,
    };
    ctx = await this.runMiddleware('before', 'create', ctx);
    if (ctx.abort) throw new Error(ctx.abortReason || '생성 중단됨');

    // 검증
    const validation = this.validate(record as Record<string, unknown>);
    if (!validation.valid) {
      const msg = validation.errors.map(e => e.message).join(', ');
      throw new Error(`검증 실패: ${msg}`);
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(ctx.data || record)
      .select()
      .single();

    if (error) {
      this.log('error', '등록 실패:', error.message);
      throw new Error(`등록 실패: ${error.message}`);
    }

    // after 미들웨어
    ctx = { ...ctx, phase: 'after', result: data as T };
    await this.runMiddleware('after', 'create', ctx);

    this.emit('data:created', data);
    return data as T;
  }

  // ─── 수정 ─────────────────────────────────────

  async update(
    id: string,
    record: Partial<T>,
    userId?: string,
    userRole?: string,
  ): Promise<T> {
    let ctx: MiddlewareContext<T> = {
      action: 'update',
      phase: 'before',
      data: record,
      id,
      userId,
      userRole: userRole as MiddlewareContext['userRole'],
      supabase: this.supabase,
    };
    ctx = await this.runMiddleware('before', 'update', ctx);
    if (ctx.abort) throw new Error(ctx.abortReason || '수정 중단됨');

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(ctx.data || record)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.log('error', '수정 실패:', error.message);
      throw new Error(`수정 실패: ${error.message}`);
    }

    ctx = { ...ctx, phase: 'after', result: data as T };
    await this.runMiddleware('after', 'update', ctx);

    this.emit('data:updated', data);
    return data as T;
  }

  // ─── 삭제 ─────────────────────────────────────

  async delete(id: string, userId?: string, userRole?: string): Promise<void> {
    let ctx: MiddlewareContext<T> = {
      action: 'delete',
      phase: 'before',
      id,
      userId,
      userRole: userRole as MiddlewareContext['userRole'],
      supabase: this.supabase,
    };
    ctx = await this.runMiddleware('before', 'delete', ctx);
    if (ctx.abort) throw new Error(ctx.abortReason || '삭제 중단됨');

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      this.log('error', '삭제 실패:', error.message);
      throw new Error(`삭제 실패: ${error.message}`);
    }

    await this.runMiddleware('after', 'delete', { ...ctx, phase: 'after' });
    this.emit('data:deleted', { id });
  }

  // ─── 일괄 처리 ────────────────────────────────

  async bulkCreate(records: Partial<T>[]): Promise<T[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(records)
      .select();

    if (error) throw new Error(`일괄 등록 실패: ${error.message}`);
    return (data as T[]) || [];
  }

  async bulkUpdate(ids: string[], updates: Partial<T>): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update(updates)
      .in('id', ids);

    if (error) throw new Error(`일괄 수정 실패: ${error.message}`);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .in('id', ids);

    if (error) throw new Error(`일괄 삭제 실패: ${error.message}`);
  }

  // ─── 건수 조회 ────────────────────────────────

  async count(filters?: Record<string, unknown>): Promise<number> {
    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
    }

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  }

  // ─── 새로고침 ─────────────────────────────────

  async refresh(): Promise<void> {
    this.setStatus('refreshing');
    try {
      await this.list(); // 기본 새로고침은 전체 조회
      this.emit('data:refreshed');
    } catch {
      // 에러는 list() 에서 처리
    }
  }

  // ─── 캐시 ─────────────────────────────────────

  getCachedData(): readonly T[] {
    return this.cachedData;
  }

  clearCache(): void {
    this.cachedData = [];
    this.state.dataCount = 0;
  }
}
