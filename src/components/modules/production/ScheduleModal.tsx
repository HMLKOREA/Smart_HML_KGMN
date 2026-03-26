'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ProductionSchedule, TransportCategory, ProductionScheduleStatus } from '@/types';
import { SUB_CATEGORIES, TRANSPORT_CATEGORIES, SCHEDULE_STATUS_MAP, todayStr } from './constants';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  schedule: ProductionSchedule | null;  // null = 신규
  defaultDate?: string;
  canEdit: boolean;
  canDelete: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: any, existingId: string | null, userId?: string) => Promise<{ success: boolean; error?: string }>;
  onDelete: (ids: string[]) => Promise<{ success: boolean; error?: string }>;
  userId?: string;
}

interface DropdownItem { id: string; name: string; code?: string }

export default function ScheduleModal({
  open, onClose, onSaved, schedule, defaultDate, canEdit, canDelete, onSave, onDelete, userId,
}: Props) {
  const supabase = createClient();
  const isNew = !schedule;

  // Form state
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<TransportCategory>('cargo_truck');
  const [subCat, setSubCat] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [plannedQty, setPlannedQty] = useState('');
  const [plannedTrucks, setPlannedTrucks] = useState('');
  const [actualQty, setActualQty] = useState('');
  const [actualTrucks, setActualTrucks] = useState('');
  const [status, setStatus] = useState<ProductionScheduleStatus>('planned');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Dropdown data
  const [customers, setCustomers] = useState<DropdownItem[]>([]);
  const [products, setProducts] = useState<DropdownItem[]>([]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [c, p] = await Promise.all([
        supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
        supabase.from('products').select('id, name, code').eq('is_active', true).order('code'),
      ]);
      setCustomers((c.data as DropdownItem[]) || []);
      setProducts((p.data as DropdownItem[]) || []);
    };
    load();
  }, [open, supabase]);

  // 폼 초기화
  useEffect(() => {
    if (!open) return;
    if (schedule) {
      setDate(schedule.schedule_date);
      setCategory(schedule.transport_category);
      setSubCat(schedule.sub_category);
      setCustomerId(schedule.customer_id || '');
      setProductId(schedule.product_id || '');
      setPlannedQty(String(schedule.planned_quantity || ''));
      setPlannedTrucks(String(schedule.planned_trucks || ''));
      setActualQty(String(schedule.actual_quantity || ''));
      setActualTrucks(String(schedule.actual_trucks || ''));
      setStatus(schedule.status);
      setNotes(schedule.notes || '');
    } else {
      setDate(defaultDate || todayStr());
      setCategory('cargo_truck');
      setSubCat(SUB_CATEGORIES.cargo_truck[0]);
      setCustomerId('');
      setProductId('');
      setPlannedQty('');
      setPlannedTrucks('');
      setActualQty('');
      setActualTrucks('');
      setStatus('planned');
      setNotes('');
    }
    setError('');
  }, [open, schedule, defaultDate]);

  const handleSave = useCallback(async () => {
    if (!date || !subCat) { setError('날짜와 세부구분은 필수입니다.'); return; }
    setSaving(true);
    setError('');
    const result = await onSave({
      schedule_date: date,
      transport_category: category,
      sub_category: subCat,
      customer_id: customerId,
      product_id: productId,
      planned_quantity: Number(plannedQty) || 0,
      planned_trucks: Number(plannedTrucks) || 0,
      actual_quantity: Number(actualQty) || 0,
      actual_trucks: Number(actualTrucks) || 0,
      status,
      notes,
    }, schedule?.id || null, userId);
    setSaving(false);
    if (result.success) { onSaved(); onClose(); }
    else setError(result.error || '저장 실패');
  }, [date, category, subCat, customerId, productId, plannedQty, plannedTrucks, actualQty, actualTrucks, status, notes, schedule, onSave, onSaved, onClose, userId]);

  const handleDelete = useCallback(async () => {
    if (!schedule) return;
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    setSaving(true);
    const result = await onDelete([schedule.id]);
    setSaving(false);
    if (result.success) { onSaved(); onClose(); }
    else setError(result.error || '삭제 실패');
  }, [schedule, onDelete, onSaved, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">
            {isNew ? '생산 일정 등록' : canEdit ? '생산 일정 수정' : '생산 일정 상세'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

          {/* 날짜 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">날짜 *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50" />
          </div>

          {/* 운송 구분 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">운송 구분 *</label>
            <div className="flex gap-2">
              {TRANSPORT_CATEGORIES.map(c => (
                <button key={c.value} type="button" disabled={!canEdit}
                  onClick={() => { setCategory(c.value); setSubCat(SUB_CATEGORIES[c.value][0]); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${category === c.value
                    ? c.value === 'cargo_truck' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} disabled:opacity-60`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 세부 구분 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">세부 구분 *</label>
            <select value={subCat} onChange={e => setSubCat(e.target.value)} disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50">
              {SUB_CATEGORIES[category].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* 거래처 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">거래처</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50">
              <option value="">선택</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* 제품 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제품</label>
            <select value={productId} onChange={e => setProductId(e.target.value)} disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50">
              <option value="">선택</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
            </select>
          </div>

          {/* 수량 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">계획 수량 (ton)</label>
              <input type="number" step="0.001" value={plannedQty} onChange={e => setPlannedQty(e.target.value)} disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">계획 대수</label>
              <input type="number" value={plannedTrucks} onChange={e => setPlannedTrucks(e.target.value)} disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" placeholder="0" />
            </div>
          </div>

          {/* 실적 (수정모드만) */}
          {!isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">실적 수량 (ton)</label>
                <input type="number" step="0.001" value={actualQty} onChange={e => setActualQty(e.target.value)} disabled={!canEdit}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">실적 대수</label>
                <input type="number" value={actualTrucks} onChange={e => setActualTrucks(e.target.value)} disabled={!canEdit}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" placeholder="0" />
              </div>
            </div>
          )}

          {/* 상태 */}
          {!isNew && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(SCHEDULE_STATUS_MAP).map(([k, v]) => (
                  <button key={k} type="button" disabled={!canEdit}
                    onClick={() => setStatus(k as ProductionScheduleStatus)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${status === k ? v.style + ' ring-2' : 'bg-gray-50 text-gray-400'} disabled:opacity-60`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 resize-none" placeholder="참고 사항" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
          <div>
            {!isNew && canDelete && (
              <button onClick={handleDelete} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50">
                삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">
              {canEdit ? '취소' : '닫기'}
            </button>
            {canEdit && (
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50">
                {saving ? '저장중...' : isNew ? '등록' : '저장'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
