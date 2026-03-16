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
      {/* 인쇄/닫기 버튼 */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-[210]">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          인쇄
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium"
        >
          닫기
        </button>
      </div>

      {/* 인쇄 영역 */}
      <div
        id="print-list-area"
        style={{
          width: '297mm',
          minHeight: '210mm',
          backgroundColor: '#fff',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          boxSizing: 'border-box',
          padding: '12mm 14mm',
          fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
          overflow: 'auto',
          maxHeight: '95vh',
        }}
      >
        {/* 테이블 */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #999',
        }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding: '6px 8px',
                  fontSize: 12,
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
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.shipment_date?.slice(5) || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.transport_type || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  color: '#333',
                }}>
                  {row.customer_name || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  color: '#333',
                }}>
                  {row.product_name || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.company_name || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.vehicle_number || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd', borderRight: '1px solid #eee',
                  textAlign: 'center', color: '#333',
                }}>
                  {row.silo || ''}
                </td>
                <td style={{
                  padding: '5px 8px', fontSize: 11, borderBottom: '1px solid #ddd',
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
                padding: '5px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right',
                borderTop: '1.5px solid #999', borderRight: '1px solid #eee', color: '#333',
              }}>
              </td>
              <td style={{
                padding: '5px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right',
                borderTop: '1.5px solid #999', color: '#333', backgroundColor: '#f9f9f9',
              }}>
                {totalWeight.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

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
        }
      `}</style>
    </div>
  );
}
