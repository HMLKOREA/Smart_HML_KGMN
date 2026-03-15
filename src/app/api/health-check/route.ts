import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HealthCheckResult } from '@/types';

const MODULES = [
  'transport_companies',
  'customers',
  'drivers',
  'products',
  'shipments',
  'dispatches',
  'quality_reports',
  'settlements',
  'unit_prices',
];

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const results: HealthCheckResult[] = [];
  const timestamp = new Date().toISOString();

  // 각 모듈 테이블 상태 확인
  for (const module of MODULES) {
    try {
      const { count, error } = await supabase
        .from(module)
        .select('*', { count: 'exact', head: true });

      if (error) {
        results.push({
          module,
          status: 'error',
          message: `테이블 조회 실패: ${error.message}`,
          timestamp,
          details: { error: error.code },
        });

        // 에러 로그 저장
        await supabase.from('system_logs').insert({
          module,
          level: 'error',
          message: `Health check 실패: ${error.message}`,
          details: { error_code: error.code, error_details: error.details },
        });
      } else {
        results.push({
          module,
          status: 'ok',
          message: `정상 (${count ?? 0}건)`,
          timestamp,
          details: { record_count: count },
        });
      }
    } catch (err) {
      results.push({
        module,
        status: 'error',
        message: `시스템 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
        timestamp,
      });
    }
  }

  // Supabase Auth 상태 확인
  try {
    const { data, error } = await supabase.auth.getUser();
    results.push({
      module: 'auth',
      status: error ? 'warning' : 'ok',
      message: error ? `인증 서비스 경고: ${error.message}` : '인증 서비스 정상',
      timestamp,
      details: { user_id: data?.user?.id },
    });
  } catch {
    results.push({
      module: 'auth',
      status: 'error',
      message: '인증 서비스 연결 실패',
      timestamp,
    });
  }

  // 데이터 무결성 체크
  try {
    // 출하 데이터에 참조되지 않는 고객이 있는지 확인
    const { data: orphanShipments } = await supabase
      .from('shipments')
      .select('id, customer_id')
      .is('customer_id', null)
      .not('status', 'eq', 'cancelled')
      .limit(5);

    if (orphanShipments && orphanShipments.length > 0) {
      results.push({
        module: 'data_integrity',
        status: 'warning',
        message: `거래처 미지정 출하 건: ${orphanShipments.length}건`,
        timestamp,
        details: { orphan_ids: orphanShipments.map(s => s.id) },
      });

      await supabase.from('system_logs').insert({
        module: 'data_integrity',
        level: 'warning',
        message: `거래처 미지정 출하 건 발견: ${orphanShipments.length}건`,
        details: { ids: orphanShipments.map(s => s.id) },
      });
    } else {
      results.push({
        module: 'data_integrity',
        status: 'ok',
        message: '데이터 무결성 정상',
        timestamp,
      });
    }
  } catch {
    results.push({
      module: 'data_integrity',
      status: 'error',
      message: '데이터 무결성 체크 실패',
      timestamp,
    });
  }

  const overallStatus = results.some(r => r.status === 'error')
    ? 'error'
    : results.some(r => r.status === 'warning')
    ? 'warning'
    : 'ok';

  return NextResponse.json({
    status: overallStatus,
    timestamp,
    results,
    summary: {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      warning: results.filter(r => r.status === 'warning').length,
      error: results.filter(r => r.status === 'error').length,
    },
  });
}
