'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import InlineCellDropdown, { type DropdownOption } from '@/components/ui/InlineCellDropdown';

// ── Types ──
interface Shipment {
  id: string;
  shipment_date: string;
  shipment_number: string;
  customer_id: string | null;
  customer_name: string | null;
  product_id: string | null;
  product_name: string | null;
  product_code: string | null;
  quantity: number;
  unit: string;
  delivery_address: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  company_id: string | null;
  company_name: string | null;
  transport_type: string | null;
  silo: string | null;
  is_shipped: boolean;
  weight_empty: number | null;
  weight_loaded: number | null;
  weight_net: number | null;
  certificate_time: string | null;
  has_attachment: boolean;
  dispatch_notified: boolean;
  is_confirmed: boolean;
  notes: string | null;
  status: string;
  memo: string | null;
  created_at: string;
}

interface LookupCustomer { id: string; name: string; }
interface LookupProduct { id: string; code: string; name: string; unit: string; }
interface LookupDriver { id: string; name: string; vehicle_number: string; company_id: string | null; }
interface LookupCompany { id: string; name: string; phone: string | null; email: string | null; }

export interface EditableRowData {
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

const TRANSPORT_TYPES = ['탱크', '벌크', '백(bag)', '기타'];

function formatKoreanDateTime(dt: string | null): string {
  if (!dt) return '';
  const d = new Date(dt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface InlineShipmentRowProps {
  row: Shipment;
  index: number;
  isSelected: boolean;
  isEditing: boolean;
  isNew: boolean;
  isSaving: boolean;
  editData: EditableRowData | null;
  customers: LookupCustomer[];
  products: LookupProduct[];
  drivers: LookupDriver[];
  companies: LookupCompany[];
  onToggleSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: (id: string) => void;
  onSaveEdit: (id: string) => void;
  onUpdateEditData: (id: string, updates: Partial<EditableRowData>) => void;
  onShipToggle: (id: string, currentValue: boolean) => void;
  isAdmin?: boolean;
}

// Prepare lookup options once (memoized in parent)
export function prepareOptions(
  customers: LookupCustomer[],
  products: LookupProduct[],
  drivers: LookupDriver[],
  companies: LookupCompany[],
) {
  return {
    customerOpts: customers.map(c => ({ id: c.id, label: c.name })),
    productOpts: products.map(p => ({ id: p.id, label: p.name, subLabel: p.code })),
    driverOpts: drivers.map(d => ({ id: d.id, label: d.vehicle_number, subLabel: d.name })),
    companyOpts: companies.map(c => ({ id: c.id, label: c.name })),
  };
}

/** 워크플로우 상태 판별 */
function getWorkflowStatus(row: Shipment): { label: string; bg: string; color: string } {
  if (row.is_shipped || row.certificate_time) {
    return { label: '출하완료', bg: '#dcfce7', color: '#15803d' };
  }
  if (row.driver_name || row.vehicle_number) {
    return { label: '기사배정', bg: '#e0e7ff', color: '#4338ca' };
  }
  if (row.company_name) {
    return { label: '배차완료', bg: '#dbeafe', color: '#1d4ed8' };
  }
  if (row.customer_name && row.product_name) {
    return { label: '출하등록', bg: '#fef3c7', color: '#b45309' };
  }
  return { label: '입력중', bg: '#f3f4f6', color: '#6b7280' };
}

// Responsive padding: compact on mobile (tight screens), normal on desktop
const cellPad = 'clamp(4px, 1vw, 8px) clamp(4px, 1vw, 8px)';
const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '4px 6px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  outline: 'none',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
};

export default function InlineShipmentRow({
  row,
  index,
  isSelected,
  isEditing,
  isNew,
  isSaving,
  editData,
  customers,
  products,
  drivers,
  companies,
  onToggleSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onUpdateEditData,
  onShipToggle,
  isAdmin = false,
}: InlineShipmentRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Prepare dropdown options
  const customerOpts: DropdownOption[] = customers.map(c => ({ id: c.id, label: c.name }));
  const productOpts: DropdownOption[] = products.map(p => ({ id: p.id, label: p.name, subLabel: p.code }));
  const driverOpts: DropdownOption[] = drivers.map(d => ({ id: d.id, label: d.vehicle_number, subLabel: d.name }));
  const companyOpts: DropdownOption[] = companies.map(c => ({ id: c.id, label: c.name }));

  const update = useCallback((updates: Partial<EditableRowData>) => {
    onUpdateEditData(row.id, updates);
  }, [row.id, onUpdateEditData]);

  // Auto-fill: driver → vehicle_number + company_id
  const handleDriverChange = useCallback((driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    update({
      driver_id: driverId,
      vehicle_number: driver?.vehicle_number || '',
      company_id: driver?.company_id || '',
    });
  }, [drivers, update]);

  // Auto-fill: product → unit
  const handleProductChange = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    update({ product_id: productId, unit: product?.unit || 'ton' });
  }, [products, update]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancelEdit(row.id);
    } else if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      onSaveEdit(row.id);
    }
  }, [row.id, onCancelEdit, onSaveEdit]);

  // ── Display Mode ──
  if (!isEditing || !editData) {
    const bgColor = row.is_confirmed
      ? isSelected ? '#fbbf24' : '#fde68a'
      : isSelected ? '#eff6ff' : undefined;
    const isLocked = row.is_confirmed && !isAdmin;

    return (
      <tr
        ref={rowRef}
        style={{ cursor: 'pointer', backgroundColor: bgColor, touchAction: 'manipulation' }}
        onClick={() => onToggleSelect(row.id)}
        onDoubleClick={() => { if (!isLocked) onStartEdit(row.id); }}
      >
        <td style={{ textAlign: 'center', padding: cellPad }}>
          {(() => {
            const ws = getWorkflowStatus(row);
            return (
              <span style={{
                display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                fontSize: 11, fontWeight: 700, backgroundColor: ws.bg, color: ws.color,
                whiteSpace: 'nowrap',
              }}>
                {ws.label}
              </span>
            );
          })()}
        </td>
        <td style={{ textAlign: 'center', color: '#9ca3af', padding: cellPad, fontSize: 13 }}>{index + 1}</td>
        <td style={{ textAlign: 'center', padding: cellPad }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.id)} />
        </td>
        <td style={{ whiteSpace: 'nowrap', padding: cellPad, fontSize: 13 }}>{row.shipment_date?.slice(2)}</td>
        <td style={{ padding: cellPad, fontSize: 13 }}>{row.transport_type || '-'}</td>
        <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: cellPad, fontSize: 13 }}>
          {row.customer_name || '-'}
        </td>
        <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: cellPad, fontSize: 13 }}>
          {row.product_name || '-'}
        </td>
        <td style={{ padding: cellPad, fontSize: 13 }}>{row.company_name || '-'}</td>
        <td style={{ fontFamily: 'monospace', fontSize: 12, padding: cellPad }}>{row.vehicle_number || '-'}</td>
        <td style={{ padding: cellPad, fontSize: 13 }}>{row.silo || '-'}</td>
        <td style={{ textAlign: 'center', padding: cellPad }} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={row.is_shipped || false}
            onChange={() => onShipToggle(row.id, row.is_shipped || false)}
          />
        </td>
        <td style={{ textAlign: 'right', fontWeight: (row.weight_net || 0) > 0 ? 600 : 400, padding: cellPad, fontSize: 13 }}>
          {(row.weight_net ?? 0).toFixed(2)}
        </td>
        <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, padding: cellPad }}>
          {row.notes || ''}
        </td>
        <td style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '2px 4px', textAlign: 'center', fontFamily: 'monospace' }}>
          {formatKoreanDateTime(row.certificate_time)}
        </td>
        <td style={{ textAlign: 'center', fontWeight: 600, color: row.has_attachment ? '#16a34a' : '#dc2626', padding: cellPad, fontSize: 13 }}>
          {row.has_attachment ? 'O' : 'X'}
        </td>
        <td style={{ textAlign: 'center', fontWeight: 600, color: row.dispatch_notified ? '#16a34a' : '#dc2626', padding: cellPad, fontSize: 13 }}>
          {row.dispatch_notified ? 'O' : 'X'}
        </td>
        <td style={{ textAlign: 'center', padding: cellPad }}>
          <button
            onClick={e => { e.stopPropagation(); onStartEdit(row.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#6b7280', lineHeight: 1 }}
            title="편집"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
        </td>
      </tr>
    );
  }

  // ── Edit Mode ──
  const bgEdit = isNew ? '#f0fdf4' : '#eff6ff';
  const borderLeft = isNew ? '2px solid #16a34a' : '2px solid #3b82f6';

  return (
    <tr
      ref={rowRef}
      style={{ backgroundColor: bgEdit, borderLeft, touchAction: 'manipulation' }}
      onKeyDown={handleKeyDown}
    >
      <td style={{ textAlign: 'center', padding: cellPad }}>
        <span style={{
          display: 'inline-block', padding: '2px 6px', borderRadius: 4,
          fontSize: 11, fontWeight: 700, backgroundColor: '#fef3c7', color: '#b45309',
          whiteSpace: 'nowrap',
        }}>
          {isNew ? '신규' : '편집중'}
        </span>
      </td>
      <td style={{ textAlign: 'center', color: '#9ca3af', padding: cellPad, fontSize: 13 }}>
        {isNew ? '+' : index + 1}
      </td>
      <td style={{ textAlign: 'center', padding: cellPad }}>
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.id)} />
      </td>

      {/* 출하일자 */}
      <td style={{ padding: '2px 3px' }}>
        <input
          type="date"
          value={editData.shipment_date}
          onChange={e => update({ shipment_date: e.target.value })}
          style={{ ...inputStyle, width: 88 }}
        />
      </td>

      {/* 운송구분 */}
      <td style={{ padding: '2px 3px' }}>
        <select
          value={editData.transport_type}
          onChange={e => update({ transport_type: e.target.value })}
          style={{ ...inputStyle, padding: '3px 2px' }}
        >
          {TRANSPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>

      {/* 거래처 */}
      <td style={{ padding: '2px 3px' }}>
        <InlineCellDropdown
          options={customerOpts}
          value={editData.customer_id}
          onChange={id => update({ customer_id: id })}
          placeholder="거래처"
        />
      </td>

      {/* 제품명 */}
      <td style={{ padding: '2px 3px' }}>
        <InlineCellDropdown
          options={productOpts}
          value={editData.product_id}
          onChange={handleProductChange}
          placeholder="제품"
        />
      </td>

      {/* 운송사 */}
      <td style={{ padding: '2px 3px' }}>
        <InlineCellDropdown
          options={companyOpts}
          value={editData.company_id}
          onChange={id => update({ company_id: id })}
          placeholder="운송사"
        />
      </td>

      {/* 차량정보 (기사 연동) */}
      <td style={{ padding: '2px 3px' }}>
        <InlineCellDropdown
          options={driverOpts}
          value={editData.driver_id}
          onChange={handleDriverChange}
          placeholder="차량"
        />
      </td>

      {/* 사일로 */}
      <td style={{ padding: '2px 3px' }}>
        <input
          type="text"
          value={editData.silo}
          onChange={e => update({ silo: e.target.value })}
          style={{ ...inputStyle, width: 50 }}
          placeholder="사일로"
        />
      </td>

      {/* 출하 */}
      <td style={{ textAlign: 'center', padding: cellPad }}>
        <input
          type="checkbox"
          checked={editData.is_shipped}
          onChange={e => update({ is_shipped: e.target.checked })}
        />
      </td>

      {/* 계근결과 */}
      <td style={{ padding: '2px 3px' }}>
        <input
          type="text"
          inputMode="decimal"
          value={editData.weight_net ?? ''}
          onChange={e => {
            const v = e.target.value;
            if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
              update({ weight_net: v === '' ? null : parseFloat(v) || null });
            }
          }}
          onBlur={e => {
            if (e.target.value) {
              update({ weight_net: parseFloat(parseFloat(e.target.value).toFixed(2)) });
            }
          }}
          style={{ ...inputStyle, width: 66, textAlign: 'right', fontWeight: 600 }}
          placeholder="0.00"
        />
      </td>

      {/* 기타 */}
      <td style={{ padding: '2px 3px' }}>
        <input
          type="text"
          value={editData.notes}
          onChange={e => update({ notes: e.target.value })}
          style={{ ...inputStyle, width: '100%' }}
          placeholder="기타"
        />
      </td>

      {/* 출하증 발급시간 - read-only */}
      <td style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '2px 4px', textAlign: 'center', fontFamily: 'monospace' }}>
        {formatKoreanDateTime(row.certificate_time)}
      </td>

      {/* 첨부파일 - read-only */}
      <td style={{ textAlign: 'center', fontWeight: 600, color: row.has_attachment ? '#16a34a' : '#dc2626', padding: cellPad, fontSize: 13 }}>
        {row.has_attachment ? 'O' : 'X'}
      </td>

      {/* 배차통보 - read-only */}
      <td style={{ textAlign: 'center', fontWeight: 600, color: row.dispatch_notified ? '#16a34a' : '#dc2626', padding: cellPad, fontSize: 13 }}>
        {row.dispatch_notified ? 'O' : 'X'}
      </td>

      {/* 작업 (저장/취소) */}
      <td style={{ textAlign: 'center', padding: cellPad, whiteSpace: 'nowrap' }}>
        <button
          onClick={() => onSaveEdit(row.id)}
          disabled={isSaving}
          style={{
            background: 'none', border: 'none', cursor: isSaving ? 'wait' : 'pointer',
            padding: 2, color: '#16a34a', lineHeight: 1, opacity: isSaving ? 0.5 : 1,
          }}
          title="저장 (Ctrl+Enter)"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </button>
        <button
          onClick={() => onCancelEdit(row.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#dc2626', lineHeight: 1, marginLeft: 2 }}
          title="취소 (Esc)"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
