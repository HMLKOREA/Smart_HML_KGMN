'use client';

import { useEffect } from 'react';

interface ShipmentRow {
  shipment_date: string;
  transport_type: string | null;
  customer_name: string | null;
  product_name: string | null;
  company_name: string | null;
  vehicle_number: string | null;
  silo: string | null;
  weight_net: number | null;
  notes: string | null;
}

interface ShipmentListPrintProps {
  rows: ShipmentRow[];
  dateLabel: string;
  onClose: () => void;
}

export default function ShipmentListPrint({ rows, dateLabel, onClose }: ShipmentListPrintProps) {
  const now = new Date();
  const printTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  // 계근결과 합계
  const totalWeight = rows.reduce((sum, r) => sum + (r.weight_net || 0), 0);

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const columns = [
    { key: 'shipment_date', header: '출하일자', width: '80px', align: 'center' as const },
    { key: 'transport_type', header: '운송구분', width: '60px', align: 'center' as const },
    { key: 'customer_name', header: '거래처', width: 'auto', align: 'left' as const },
    { key: 'product_name', header: '제품명', width: 'auto', align: 'left' as const },
    { key: 'company_name', header: '운송사', width: '60px', align: 'center' as const },
    { key: 'vehicle_number', header: '차량정보', width: '100px', align: 'center' as const },
    { key: 'silo', header: '사일로', width: '100px', align: 'center' as const },
    { key: 'weight_net', header: '계근결과', width: '70px', align: 'right' as const },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      {/* 인쇄/닫기 버튼 — fixed top-right, min touch target 44px */}
      <div className="no-print fixed top-3 right-3 flex flex-col sm:flex-row gap-2 z-[210]">
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm min-h-[44px]"
        >
          인쇄
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium text-sm min-h-[44px]"
        >
          닫기
        </button>
      </div>

      {/* 인쇄 영역 — on-screen: shrinks to viewport; on print: full A4 landscape */}
      <div
        id="print-list-area"
        style={{
          width: 'min(297mm, 96vw)',
          minHeight: '210mm',
          backgroundColor: '#fff',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          boxSizing: 'border-box',
          padding: 'clamp(8px, 4vw, 42px) clamp(10px, 4vw, 50px)',
          fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
          overflow: 'auto',
          maxHeight: '95dvh',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* 제목 + 조회기간 */}
        <div style={{ marginBottom: 12, textAlign: 'center' }}>
          <div className="print-title" style={{
            fontSize: 'clamp(14px, 2.5vw, 18px)',
            fontWeight: 700,
            color: '#222',
          }}>
            출하 목록
          </div>
          {dateLabel && (
            <div className="print-date-label" style={{
              fontSize: 'clamp(10px, 1.5vw, 13px)',
              color: '#666',
              marginTop: 4,
            }}>
              조회기간: {dateLabel}
            </div>
          )}
        </div>

        {/* 테이블 — wrap in scrollable div for narrow screens */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{
          width: '100%',
          minWidth: 520,
          borderCollapse: 'collapse',
          border: '1px solid #999',
        }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding: '6px 8px',
                  fontSize: 'clamp(10px, 1.5vw, 12px)',
                  fontWeight: 700,
                  color: '#333',
                  backgroundColor: '#f5f5f5',
                  borderBottom: '1.5px solid #999',
                  borderRight: '1px solid #ccc',
                  textAlign: col.align,
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.shipment_date?.slice(5) || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.transport_type || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  color: '#333',
                }}>
                  {row.customer_name || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  color: '#333',
                }}>
                  {row.product_name || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.company_name || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.vehicle_number || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.silo || ''}
                </td>
                <td style={{
                  padding: '4px 6px', fontSize: 'clamp(9px, 1.4vw, 11px)', borderBottom: '1px solid #ddd',
                  textAlign: 'right', color: '#333',
                }}>
                  {row.weight_net != null ? row.weight_net.toFixed(2) : '0.00'}
                </td>
              </tr>
            ))}
          </tbody>
          {/* 합계 행 */}
          <tfoot>
            <tr>
              <td colSpan={7} style={{
                padding: '5px 8px', fontSize: 'clamp(9px, 1.4vw, 11px)', fontWeight: 700, textAlign: 'right',
                borderTop: '1.5px solid #999', borderRight: '1px solid #eee', color: '#333',
              }}>
              </td>
              <td style={{
                padding: '5px 8px', fontSize: 'clamp(9px, 1.4vw, 11px)', fontWeight: 700, textAlign: 'right',
                borderTop: '1.5px solid #999', color: '#333', backgroundColor: '#f9f9f9',
              }}>
                {totalWeight.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>

        {/* 출력 시간 */}
        <div style={{
          marginTop: 10,
          fontSize: 10,
          color: '#888',
          textAlign: 'right',
        }}>
          출력시간: {printTime}
        </div>
      </div>

      {/* 인쇄 스타일 */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm 10mm;
          }
          body * {
            visibility: hidden;
          }
          #print-list-area, #print-list-area * {
            visibility: visible;
          }
          #print-list-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            min-height: auto;
            padding: 0;
            box-shadow: none !important;
            max-height: none;
            overflow: visible;
          }
          .no-print {
            display: none !important;
          }
          #print-list-area .print-title {
            font-size: 16px !important;
          }
          #print-list-area .print-date-label {
            font-size: 11px !important;
          }
          #print-list-area th {
            font-size: 10px !important;
          }
          #print-list-area td {
            font-size: 11px !important;
          }
        }
      `}</style>
    </div>
  );
}
