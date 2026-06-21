'use client';

import { useState, useEffect, useMemo } from 'react';

interface LookupCustomer { id: string; name: string; }
interface LookupProduct { id: string; code: string; name: string; unit: string; }

interface RecentEntry {
  transport_type: string;
  customer_id: string;
  customer_name: string;
  product_id: string;
  product_name: string;
  customer_code: string;
  silo: string;
  count: number;
  selected: boolean;
}

interface MultiCustomerPanelProps {
  customers: LookupCustomer[];
  products: LookupProduct[];
  defaultDate: string;
  recentData: Array<{
    transport_type: string | null;
    customer_id: string | null;
    customer_name: string | null;
    product_id: string | null;
    product_name: string | null;
    product_code: string | null;
    silo: string | null;
  }>;
  onRegister: (data: {
    shipment_date: string;
    entries: Array<{
      transport_type: string;
      customer_id: string;
      product_id: string;
      silo: string;
      count: number;
    }>;
  }) => void;
  onClose: () => void;
}

export default function MultiCustomerPanel({
  customers,
  products,
  defaultDate,
  recentData,
  onRegister,
  onClose,
}: MultiCustomerPanelProps) {
  const [shipmentDate, setShipmentDate] = useState(defaultDate);

  // Build recent entries from actual shipment data
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  useEffect(() => {
    // Group recent data by transport_type + customer + product, count occurrences
    const keyMap = new Map<string, RecentEntry>();
    for (const row of recentData) {
      if (!row.customer_id || !row.product_id) continue;
      const key = `${row.transport_type || '탱크'}|${row.customer_id}|${row.product_id}`;
      if (keyMap.has(key)) {
        keyMap.get(key)!.count += 1;
      } else {
        keyMap.set(key, {
          transport_type: row.transport_type || '탱크',
          customer_id: row.customer_id,
          customer_name: row.customer_name || '-',
          product_id: row.product_id,
          product_name: row.product_name || '-',
          customer_code: row.product_code || '',
          silo: row.silo || '',
          count: 1,
          selected: false,
        });
      }
    }
    setEntries(Array.from(keyMap.values()));
  }, [recentData]);

  const toggleSelect = (idx: number) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e));
  };

  const toggleAll = () => {
    const allSelected = entries.every(e => e.selected);
    setEntries(prev => prev.map(e => ({ ...e, selected: !allSelected })));
  };

  const updateCount = (idx: number, val: number) => {
    if (val < 1) val = 1;
    if (val > 99) val = 99;
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, count: val } : e));
  };

  const selectedEntries = entries.filter(e => e.selected);
  const totalCount = selectedEntries.reduce((sum, e) => sum + e.count, 0);

  const handleRegister = () => {
    if (selectedEntries.length === 0) return;
    onRegister({
      shipment_date: shipmentDate,
      entries: selectedEntries.map(e => ({
        transport_type: e.transport_type,
        customer_id: e.customer_id,
        product_id: e.product_id,
        silo: e.silo,
        count: e.count,
      })),
    });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 160 }}>
      {/* Modal container: full-screen on mobile, max-900px on larger screens */}
      <div
        className="modal-content"
        style={{
          maxWidth: 900,
          width: '100%',
          margin: '0 auto',
          maxHeight: '100dvh',
          borderRadius: 0,
        }}
        /* On sm+ screens add margin and rounded corners via a class override below */
      >
        <style>{`
          @media (min-width: 640px) {
            .multi-customer-modal {
              margin: 20px auto !important;
              max-height: calc(100vh - 40px) !important;
              border-radius: 8px !important;
            }
          }
        `}</style>
        {/* Re-apply class for sm breakpoint overrides */}
        <div
          className="multi-customer-modal"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            maxHeight: '100dvh',
          }}
        >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '2px solid #2563eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc',
          flexShrink: 0,
          gap: 8,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 20, borderRadius: 2, background: '#2563eb', flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>거래처 다중 등록</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px', borderRadius: 6, border: '1px solid #d1d5db',
                background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              닫기
            </button>
            <button
              onClick={handleRegister}
              disabled={selectedEntries.length === 0}
              style={{
                padding: '7px 16px', borderRadius: 6, border: 'none',
                background: selectedEntries.length === 0 ? '#94a3b8' : '#2563eb',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: selectedEntries.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              저장 ({totalCount}건)
            </button>
          </div>
        </div>

        {/* Date selector */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>출하일자</label>
          <input
            type="date"
            value={shipmentDate}
            onChange={e => setShipmentDate(e.target.value)}
            style={{ fontSize: 13, padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={toggleAll}
              style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 5,
                border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
                color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {entries.every(e => e.selected) ? '전체해제' : '전체선택/해제'}
            </button>
          </div>
        </div>

        {/* Table — horizontally scrollable on small screens */}
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ width: 36, padding: '9px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={entries.length > 0 && entries.every(e => e.selected)}
                    onChange={toggleAll}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: 30, padding: '9px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>#</th>
                <th style={{ width: 72, padding: '9px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>운송구분</th>
                <th style={{ padding: '9px 8px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>거래처</th>
                <th style={{ padding: '9px 8px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>제품명</th>
                <th style={{ width: 80, padding: '9px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>거래처 코드</th>
                <th style={{ width: 70, padding: '9px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>창고 코드</th>
                <th style={{ width: 64, padding: '9px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '2px solid #cbd5e1' }}>대수</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 0', textAlign: 'center', fontSize: 14, color: '#9ca3af' }}>
                    최근 출하 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <tr
                    key={idx}
                    onClick={() => toggleSelect(idx)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: entry.selected ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfc',
                      transition: 'background-color 0.1s',
                    }}
                  >
                    <td style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={() => toggleSelect(idx)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f1f5f9' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontSize: 12, color: '#374151', fontWeight: 500, borderBottom: '1px solid #f1f5f9' }}>
                      {entry.transport_type}
                    </td>
                    <td style={{ padding: '8px', fontSize: 13, color: '#1d4ed8', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                      {entry.customer_name}
                    </td>
                    <td style={{ padding: '8px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f1f5f9' }}>
                      {entry.product_name}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f1f5f9' }}>
                      {entry.customer_code}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f1f5f9' }}>
                      {entry.silo}
                    </td>
                    <td style={{ padding: '6px 6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={entry.count}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateCount(idx, parseInt(e.target.value) || 1)}
                        style={{
                          width: 46, textAlign: 'center', fontSize: 14, fontWeight: 700,
                          padding: '4px 2px', border: '1px solid #d1d5db', borderRadius: 4,
                          outline: 'none', color: '#1e293b',
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div style={{
          padding: '10px 16px', borderTop: '2px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc', flexShrink: 0, flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            선택: <strong style={{ color: '#1d4ed8' }}>{selectedEntries.length}</strong>개 거래처
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
            총 등록 건수: <span style={{ color: '#2563eb', fontSize: 16 }}>{totalCount}</span>건
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}
