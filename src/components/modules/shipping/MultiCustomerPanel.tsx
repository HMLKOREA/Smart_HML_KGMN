'use client';

import { useState } from 'react';
import InlineCellDropdown from '@/components/ui/InlineCellDropdown';

interface LookupCustomer { id: string; name: string; }
interface LookupProduct { id: string; code: string; name: string; unit: string; }

const TRANSPORT_TYPES = ['탱크', '벌크', '백(bag)', '기타'];

interface MultiCustomerPanelProps {
  customers: LookupCustomer[];
  products: LookupProduct[];
  defaultDate: string;
  onRegister: (data: {
    shipment_date: string;
    transport_type: string;
    product_id: string;
    silo: string;
    customerIds: string[];
  }) => void;
  onClose: () => void;
}

export default function MultiCustomerPanel({
  customers,
  products,
  defaultDate,
  onRegister,
  onClose,
}: MultiCustomerPanelProps) {
  const [shipmentDate, setShipmentDate] = useState(defaultDate);
  const [transportType, setTransportType] = useState('탱크');
  const [productId, setProductId] = useState('');
  const [silo, setSilo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleCustomer = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map(c => c.id)));
    }
  };

  const handleRegister = () => {
    if (selectedIds.size === 0 || !productId) return;
    onRegister({
      shipment_date: shipmentDate,
      transport_type: transportType,
      product_id: productId,
      silo,
      customerIds: Array.from(selectedIds),
    });
  };

  const productOpts = products.map(p => ({ id: p.id, label: p.name, subLabel: p.code }));

  return (
    <div style={{
      borderBottom: '2px solid #3b82f6',
      backgroundColor: '#f8fafc',
      padding: '12px 16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
          거래처 다중 등록
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1 }}
        >
          &times;
        </button>
      </div>

      {/* Common Fields Row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 2 }}>출하일자</label>
          <input
            type="date"
            value={shipmentDate}
            onChange={e => setShipmentDate(e.target.value)}
            style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, outline: 'none', width: 120 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 2 }}>운송구분</label>
          <select
            value={transportType}
            onChange={e => setTransportType(e.target.value)}
            style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, outline: 'none', width: 80 }}
          >
            {TRANSPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 2 }}>제품 *</label>
          <InlineCellDropdown
            options={productOpts}
            value={productId}
            onChange={setProductId}
            placeholder="제품 선택"
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 2 }}>사일로</label>
          <input
            type="text"
            value={silo}
            onChange={e => setSilo(e.target.value)}
            placeholder="사일로"
            style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, outline: 'none', width: 60 }}
          />
        </div>
      </div>

      {/* Customer Chips */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
            거래처 선택 ({selectedIds.size}개)
          </label>
          <button
            onClick={toggleAll}
            style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            {selectedIds.size === customers.length ? '전체해제' : '전체선택'}
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 100, overflowY: 'auto' }}>
          {customers.map(c => (
            <button
              key={c.id}
              onClick={() => toggleCustomer(c.id)}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 99,
                border: selectedIds.has(c.id) ? '1px solid #3b82f6' : '1px solid #d1d5db',
                backgroundColor: selectedIds.has(c.id) ? '#eff6ff' : '#fff',
                color: selectedIds.has(c.id) ? '#1d4ed8' : '#374151',
                cursor: 'pointer',
                fontWeight: selectedIds.has(c.id) ? 600 : 400,
                transition: 'all 0.1s',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 12px' }}>
          취소
        </button>
        <button
          onClick={handleRegister}
          disabled={selectedIds.size === 0 || !productId}
          className="btn btn-primary"
          style={{
            fontSize: 11, padding: '4px 14px',
            opacity: selectedIds.size === 0 || !productId ? 0.5 : 1,
          }}
        >
          등록 ({selectedIds.size}건)
        </button>
      </div>
    </div>
  );
}
