'use client';

import { useState, useEffect, useMemo } from 'react';

interface LookupCustomer { id: string; name: string; }
interface LookupProduct { id: string; code: string; name: string; unit: string; }

/** 거래처×제품 마스터 행 (customer_products) */
export interface CustomerProductMaster {
  id: string;
  transport_type: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
  product_id: string | null;
  product_name: string | null;
  warehouse_code: string | null;
}

interface Entry extends CustomerProductMaster {
  count: number;
  selected: boolean;
}

interface MultiCustomerPanelProps {
  customers: LookupCustomer[];
  products: LookupProduct[];
  defaultDate: string;
  /** 레거시 custom_mst 미러(전체 마스터) */
  masterData: CustomerProductMaster[];
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
  defaultDate,
  masterData,
  onRegister,
  onClose,
}: MultiCustomerPanelProps) {
  const [shipmentDate, setShipmentDate] = useState(defaultDate);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    // 전체 마스터를 거래처명 → 제품명 순으로 정렬해 표시
    const sorted = [...masterData].sort((a, b) => {
      const cn = (a.customer_name || '').localeCompare(b.customer_name || '', 'ko');
      if (cn !== 0) return cn;
      return (a.product_name || '').localeCompare(b.product_name || '', 'ko');
    });
    setEntries(sorted.map(m => ({ ...m, count: 1, selected: false })));
  }, [masterData]);

  // 검색 필터 (거래처/제품/거래처코드)
  const filteredIdx = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries.map((_, i) => i);
    return entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) =>
        (e.customer_name || '').toLowerCase().includes(q) ||
        (e.product_name || '').toLowerCase().includes(q) ||
        (e.customer_code || '').toLowerCase().includes(q))
      .map(({ i }) => i);
  }, [entries, search]);

  const toggleSelect = (idx: number) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e));
  };

  const toggleAllVisible = () => {
    const allSel = filteredIdx.every(i => entries[i]?.selected);
    const set = new Set(filteredIdx);
    setEntries(prev => prev.map((e, i) => set.has(i) ? { ...e, selected: !allSel } : e));
  };

  const updateCount = (idx: number, val: number) => {
    if (val < 1) val = 1;
    if (val > 99) val = 99;
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, count: val } : e));
  };

  const selectedEntries = entries.filter(e => e.selected);
  const totalCount = selectedEntries.reduce((sum, e) => sum + e.count, 0);
  const registrable = selectedEntries.filter(e => e.customer_id && e.product_id);

  const handleRegister = () => {
    if (registrable.length === 0) return;
    onRegister({
      shipment_date: shipmentDate,
      entries: registrable.map(e => ({
        transport_type: e.transport_type || '탱크',
        customer_id: e.customer_id!,
        product_id: e.product_id!,
        silo: e.warehouse_code || '',
        count: e.count,
      })),
    });
  };

  const th: React.CSSProperties = {
    padding: '11px 10px', textAlign: 'center', fontSize: 15, fontWeight: 800,
    color: '#334155', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap', background: '#f1f5f9',
  };
  const td: React.CSSProperties = {
    padding: '10px 10px', fontSize: 15, color: '#1f2937', borderBottom: '1px solid #eef2f7',
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 160 }}>
      <div className="modal-content" style={{ maxWidth: 1040, width: '100%', margin: '0 auto', maxHeight: '100dvh', borderRadius: 0 }}>
        <style>{`
          @media (min-width: 640px) {
            .multi-customer-modal { margin: 16px auto !important; max-height: calc(100vh - 32px) !important; border-radius: 10px !important; }
          }
        `}</style>
        <div className="multi-customer-modal" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100dvh' }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: '2px solid #2563eb',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc', flexShrink: 0, gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 5, height: 24, borderRadius: 2, background: '#2563eb', flexShrink: 0 }} />
              <span style={{ fontSize: 19, fontWeight: 800, color: '#1e293b' }}>거래처 다중 등록</span>
              <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>전체 {entries.length}건</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={onClose} style={{
                padding: '9px 18px', borderRadius: 7, border: '1px solid #d1d5db',
                background: '#fff', color: '#374151', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}>닫기</button>
              <button onClick={handleRegister} disabled={registrable.length === 0} style={{
                padding: '9px 20px', borderRadius: 7, border: 'none',
                background: registrable.length === 0 ? '#94a3b8' : '#2563eb',
                color: '#fff', fontSize: 15, fontWeight: 800, cursor: registrable.length === 0 ? 'not-allowed' : 'pointer',
              }}>저장 ({totalCount}건)</button>
            </div>
          </div>

          {/* Toolbar: 날짜 + 검색 + 전체선택 */}
          <div style={{
            padding: '12px 18px', borderBottom: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
          }}>
            <label style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>출하일자</label>
            <input type="date" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)}
              style={{ fontSize: 15, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 7, outline: 'none' }} />
            <input
              type="text" placeholder="거래처 · 제품 · 거래처코드 검색"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 15, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 7, outline: 'none', minWidth: 240, flex: 1 }}
            />
            <button onClick={toggleAllVisible} style={{
              fontSize: 14, padding: '7px 14px', borderRadius: 6,
              border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap',
            }}>전체선택/해제</button>
          </div>

          {/* Table */}
          <div style={{ overflow: 'auto', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ ...th, width: 42 }}>
                    <input type="checkbox"
                      checked={filteredIdx.length > 0 && filteredIdx.every(i => entries[i]?.selected)}
                      onChange={toggleAllVisible} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  </th>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={{ ...th, width: 84 }}>운송구분</th>
                  <th style={{ ...th, textAlign: 'left' }}>거래처</th>
                  <th style={{ ...th, textAlign: 'left' }}>제품명</th>
                  <th style={{ ...th, width: 96 }}>거래처코드</th>
                  <th style={{ ...th, width: 88 }}>창고코드</th>
                  <th style={{ ...th, width: 76 }}>대수</th>
                </tr>
              </thead>
              <tbody>
                {filteredIdx.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '48px 0', textAlign: 'center', fontSize: 15, color: '#9ca3af' }}>
                    조회된 거래처가 없습니다.
                  </td></tr>
                ) : (
                  filteredIdx.map((idx, n) => {
                    const entry = entries[idx];
                    const incomplete = !entry.customer_id || !entry.product_id;
                    return (
                      <tr key={entry.id} onClick={() => toggleSelect(idx)} style={{
                        cursor: 'pointer',
                        backgroundColor: entry.selected ? '#eff6ff' : n % 2 === 0 ? '#fff' : '#fafbfc',
                      }}>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input type="checkbox" checked={entry.selected}
                            onChange={() => toggleSelect(idx)} onClick={e => e.stopPropagation()}
                            style={{ width: 18, height: 18, cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...td, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>{n + 1}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{entry.transport_type || '-'}</td>
                        <td style={{ ...td, color: '#1d4ed8', fontWeight: 700, fontSize: 16 }}>
                          {entry.customer_name || '-'}
                          {incomplete && <span title="거래처/제품 미연결" style={{ marginLeft: 6, fontSize: 12, color: '#dc2626' }}>⚠</span>}
                        </td>
                        <td style={{ ...td }}>{entry.product_name || '-'}</td>
                        <td style={{ ...td, textAlign: 'center', color: '#6b7280' }}>{entry.customer_code || '-'}</td>
                        <td style={{ ...td, textAlign: 'center', color: '#6b7280' }}>{entry.warehouse_code || '-'}</td>
                        <td style={{ ...td, textAlign: 'center', padding: '6px' }}>
                          <input type="number" min={1} max={99} value={entry.count}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateCount(idx, parseInt(e.target.value) || 1)}
                            style={{ width: 54, textAlign: 'center', fontSize: 16, fontWeight: 700, padding: '5px 4px', border: '1px solid #d1d5db', borderRadius: 5, outline: 'none', color: '#1e293b' }} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 18px', borderTop: '2px solid #e5e7eb',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc', flexShrink: 0, flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 15, color: '#6b7280' }}>
              선택 <strong style={{ color: '#1d4ed8' }}>{selectedEntries.length}</strong>개 거래처
              {selectedEntries.length !== registrable.length && (
                <span style={{ color: '#dc2626', marginLeft: 8, fontSize: 13 }}>
                  (미연결 {selectedEntries.length - registrable.length}건 제외)
                </span>
              )}
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
              총 등록 건수: <span style={{ color: '#2563eb', fontSize: 20 }}>{totalCount}</span>건
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
