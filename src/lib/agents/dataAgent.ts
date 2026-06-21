/**
 * 데이터 에이전트 (Data Agent)
 *
 * 각 모듈별 데이터 CRUD 작업을 관리하는 에이전트.
 * Supabase와의 데이터 통신을 캡슐화합니다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginatedResult, DateRange } from '@/types';
import { sanitizeFilterValue } from '@/lib/utils/sanitize';

export class DataAgent<T> {
  private supabase: SupabaseClient;
  private tableName: string;
  private viewName?: string;

  constructor(supabase: SupabaseClient, tableName: string, viewName?: string) {
    this.supabase = supabase;
    this.tableName = tableName;
    this.viewName = viewName;
  }

  // 목록 조회 (뷰 사용)
  async list(params?: {
    dateRange?: DateRange;
    dateField?: string;
    search?: string;
    searchFields?: string[];
    filters?: Record<string, unknown>;
    orderBy?: string;
    orderAsc?: boolean;
    pagination?: PaginationParams;
  }): Promise<PaginatedResult<T>> {
    const source = this.viewName || this.tableName;
    let query = this.supabase.from(source).select('*', { count: 'exact' });

    // 날짜 범위 필터
    if (params?.dateRange && params?.dateField) {
      query = query
        .gte(params.dateField, params.dateRange.start)
        .lte(params.dateField, params.dateRange.end);
    }

    // 텍스트 검색 (OR 조건)
    if (params?.search && params?.searchFields?.length) {
      const safeSearch = sanitizeFilterValue(params.search.trim());
      const searchConditions = params.searchFields
        .map(field => `${field}.ilike.%${safeSearch}%`)
        .join(',');
      query = query.or(searchConditions);
    }

    // 추가 필터
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
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 목록 조회 실패:`, error);
      throw new Error(`데이터 조회 실패: ${error.message}`);
    }

    return {
      data: (data as T[]) || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // 단건 조회
  async getById(id: string): Promise<T | null> {
    const source = this.viewName || this.tableName;
    const { data, error } = await this.supabase
      .from(source)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 조회 실패:`, error);
      return null;
    }

    return data as T;
  }

  // 등록
  async create(record: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 등록 실패:`, error);
      throw new Error(`등록 실패: ${error.message}`);
    }

    return data as T;
  }

  // 수정
  async update(id: string, record: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(record)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 수정 실패:`, error);
      throw new Error(`수정 실패: ${error.message}`);
    }

    return data as T;
  }

  // 삭제
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 삭제 실패:`, error);
      throw new Error(`삭제 실패: ${error.message}`);
    }
  }

  // 일괄 등록
  async bulkCreate(records: Partial<T>[]): Promise<T[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(records)
      .select();

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 일괄 등록 실패:`, error);
      throw new Error(`일괄 등록 실패: ${error.message}`);
    }

    return (data as T[]) || [];
  }

  // 일괄 수정
  async bulkUpdate(ids: string[], updates: Partial<T>): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update(updates)
      .in('id', ids);

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 일괄 수정 실패:`, error);
      throw new Error(`일괄 수정 실패: ${error.message}`);
    }
  }

  // 건수 조회
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

    if (error) {
      console.error(`[DataAgent:${this.tableName}] 건수 조회 실패:`, error);
      return 0;
    }

    return count || 0;
  }
}
