'use client';

import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ProductionScheduleStatus, TransportCategory } from '@/types';

export interface SchedulePayload {
  schedule_date: string;
  transport_category: TransportCategory;
  sub_category: string;
  customer_id: string;
  product_id: string;
  planned_quantity: number;
  planned_trucks: number;
  actual_quantity?: number;
  actual_trucks?: number;
  status?: ProductionScheduleStatus;
  priority?: number;
  notes?: string;
}

export function useProductionCrud() {
  const supabase = createClient();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const saveSchedule = useCallback(async (
    data: SchedulePayload,
    existingId: string | null,
    userId?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const key = existingId || 'new';
    setSavingIds(prev => new Set(prev).add(key));

    try {
      const payload = {
        schedule_date: data.schedule_date,
        transport_category: data.transport_category,
        sub_category: data.sub_category,
        customer_id: data.customer_id || null,
        product_id: data.product_id || null,
        planned_quantity: data.planned_quantity || 0,
        planned_trucks: data.planned_trucks || 0,
        actual_quantity: data.actual_quantity ?? 0,
        actual_trucks: data.actual_trucks ?? 0,
        status: data.status || 'planned',
        priority: data.priority ?? 0,
        notes: data.notes || null,
      };

      if (existingId) {
        const { error } = await supabase
          .from('production_schedules')
          .update({ ...payload, updated_by: userId })
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('production_schedules')
          .insert({ ...payload, created_by: userId });
        if (error) throw error;
      }
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '저장 실패' };
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [supabase]);

  const deleteSchedules = useCallback(async (ids: string[]): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('production_schedules')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '삭제 실패' };
    }
  }, [supabase]);

  const updateStatus = useCallback(async (
    id: string,
    status: ProductionScheduleStatus,
    userId?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('production_schedules')
        .update({ status, updated_by: userId })
        .eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '상태 변경 실패' };
    }
  }, [supabase]);

  return { saveSchedule, deleteSchedules, updateStatus, savingIds };
}
