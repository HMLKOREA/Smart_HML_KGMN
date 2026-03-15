'use client';

import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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

function generateShipmentNumber() {
  const today = format(new Date(), 'yyyyMMdd');
  const seq = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SH-${today}-${seq}`;
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
      } else {
        const { error } = await supabase.from('shipments').insert({
          ...payload,
          shipment_number: generateShipmentNumber(),
        });
        if (error) throw error;
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
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '삭제 실패' };
    }
  }, [supabase]);

  const toggleShip = useCallback(async (id: string, currentValue: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
      const updateData: Record<string, unknown> = { is_shipped: !currentValue };
      if (!currentValue) {
        updateData.certificate_time = new Date().toISOString();
      }
      const { error } = await supabase.from('shipments').update(updateData).eq('id', id);
      if (error) throw error;
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
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '등록 실패' };
    }
  }, [supabase]);

  const batchUpdate = useCallback(async (ids: string[], updates: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('shipments').update(updates).in('id', ids);
      if (error) throw error;
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
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '출하증 발급 실패' };
    }
  }, [supabase]);

  return { saveRow, deleteRows, toggleShip, batchInsert, batchUpdate, issueCertificate, savingIds };
}
