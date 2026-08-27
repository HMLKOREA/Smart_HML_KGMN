'use client';

import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/audit/logActivity';
import { format } from 'date-fns';

interface SavePayload {
  shipment_date: string;
  transport_type: string;
  customer_id: string;
  product_id: string;
  company_id: string;
  driver_id: string;
  vehicle_number: string;
  silo: string;
  driver_message: string;
  quantity: number;
  unit: string;
  delivery_address: string;
  weight_empty: number | null;
  weight_loaded: number | null;
  weight_net: number | null;
  is_shipped: boolean;
  notes: string;
  memo: string;
  status: string;
}

function generateShipmentNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SH-${date}-${rand}`;
}

export function useShipmentCrud() {
  const supabase = createClient();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const saveRow = useCallback(async (
    data: SavePayload,
    existingId: string | null,
  ): Promise<{ success: boolean; error?: string }> => {
    const key = existingId || 'new';
    setSavingIds(prev => new Set(prev).add(key));

    try {
      const payload = {
        shipment_date: data.shipment_date,
        transport_type: data.transport_type,
        customer_id: data.customer_id || null,
        product_id: data.product_id || null,
        company_id: data.company_id || null,
        driver_id: data.driver_id || null,
        vehicle_number: data.vehicle_number || null,
        silo: data.silo || null,
        driver_message: data.driver_message || null,
        quantity: data.quantity,
        unit: data.unit,
        delivery_address: data.delivery_address || null,
        weight_empty: data.weight_empty,
        weight_loaded: data.weight_loaded,
        weight_net: data.weight_net,
        is_shipped: data.is_shipped,
        notes: data.notes || null,
        memo: data.memo || null,
        status: data.status,
      };

      if (existingId) {
        const { error } = await supabase.from('shipments').update(payload).eq('id', existingId);
        if (error) throw error;
        logActivity({ module: 'shipping', action: 'update', targetId: existingId, details: { ...payload } });
      } else {
        const { data: inserted, error } = await supabase.from('shipments').insert({
          ...payload,
          shipment_number: generateShipmentNumber(),
        }).select('id').single();
        if (error) throw error;
        logActivity({ module: 'shipping', action: 'create', targetId: inserted?.id ?? null, details: { ...payload } });
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '저장 실패' };
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [supabase]);

  const deleteRows = useCallback(async (ids: string[]): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('shipments').delete().in('id', ids);
      if (error) throw error;
      logActivity({ module: 'shipping', action: 'delete', targetId: ids.join(','), details: { count: ids.length, ids } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '삭제 실패' };
    }
  }, [supabase]);

  const toggleShip = useCallback(async (id: string, currentValue: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
      // 출하확정(마감) = is_shipped 토글만. 출하증 발급(certificate_time)은 별개 개념이므로 건드리지 않는다.
      const { error } = await supabase.from('shipments').update({ is_shipped: !currentValue }).eq('id', id);
      if (error) throw error;
      logActivity({ module: 'shipping', action: currentValue ? 'unship' : 'ship', targetId: id, details: { is_shipped: !currentValue } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '상태 변경 실패' };
    }
  }, [supabase]);

  const batchInsert = useCallback(async (rows: Array<{
    shipment_date: string;
    transport_type: string;
    customer_id: string;
    product_id: string;
    silo: string | null;
  }>): Promise<{ success: boolean; error?: string }> => {
    try {
      const records = rows.map(r => ({
        ...r,
        shipment_number: generateShipmentNumber(),
        quantity: 0,
        unit: 'ton',
        status: 'pending',
      }));
      const { error } = await supabase.from('shipments').insert(records);
      if (error) throw error;
      logActivity({ module: 'shipping', action: 'create_batch', details: { count: records.length } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '등록 실패' };
    }
  }, [supabase]);

  const batchUpdate = useCallback(async (ids: string[], updates: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('shipments').update(updates).in('id', ids);
      if (error) throw error;
      {
        const act = 'is_confirmed' in updates ? (updates.is_confirmed ? 'confirm' : 'unconfirm')
          : 'dispatch_notified' in updates ? 'notify' : 'update_batch';
        logActivity({ module: 'shipping', action: act, targetId: ids.join(','), details: { count: ids.length, updates } });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '업데이트 실패' };
    }
  }, [supabase]);

  const issueCertificate = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('shipments')
        .update({ certificate_time: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      logActivity({ module: 'shipping', action: 'issue_cert', targetId: id });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '출하증 발급 실패' };
    }
  }, [supabase]);

  return { saveRow, deleteRows, toggleShip, batchInsert, batchUpdate, issueCertificate, savingIds };
}
