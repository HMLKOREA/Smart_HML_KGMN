'use client';

import { createClient } from '@/lib/supabase/client';
import { getSession } from '@/lib/auth/session';

/**
 * SmartHML 입력/활동 로그 (감사 추적).
 * 모든 쓰기 동작(입력·수정·삭제·확정 등)에서 호출한다.
 * fire-and-forget: 로그 실패가 실제 업무 동작을 절대 막지 않는다.
 */
export type LogModule =
  | 'shipping' | 'dispatch' | 'settlement' | 'unit_price'
  | 'user' | 'customer' | 'driver' | 'company' | 'product' | 'report';

export interface LogInput {
  module: LogModule;
  action: string;                          // create | update | delete | confirm | issue_cert | notify | ship | import | copy ...
  targetId?: string | null;
  targetLabel?: string | null;             // 사람이 읽는 대상(거래처/제품/차량 등)
  details?: Record<string, unknown> | null;
}

export function logActivity(input: LogInput): void {
  try {
    const sess = getSession();
    const supabase = createClient();
    void supabase
      .from('app_activity_logs')
      .insert({
        user_login: sess?.loginId ?? null,
        user_name: sess?.profile?.name ?? null,
        role: sess?.profile?.role ?? null,
        module: input.module,
        action: input.action,
        target_id: input.targetId ?? null,
        target_label: input.targetLabel ?? null,
        details: input.details ?? null,
      })
      .then(({ error }) => { if (error) console.warn('[activity-log]', error.message); });
  } catch (e) {
    console.warn('[activity-log] skipped', e);
  }
}
