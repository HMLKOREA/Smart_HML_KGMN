'use client';

import { useEffect } from 'react';

export interface StatementRow {
  date: string;
  product: string;
  transportType: string;
  weightNet: number;
  unitPrice: number;
  transportFee: number;
  tax: number;
  totalFee: number;
}

interface Props {
  customer: string;       // 공급받는자(거래처)
  supplier?: string;      // 공급자
  periodLabel: string;
  rows: StatementRow[];
  onClose: () => void;
}

const won = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');

export default function TransactionStatementPrint({ customer, supplier = '경기광업 / 하멜코리아', periodLabel, rows, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const sum = rows.reduce(
    (a, r) => ({
      weight: a.weight + (r.weightNet || 0),
      supply: a.supply + (r.transportFee || 0),
      tax: a.tax + (r.tax || 0),
      total: a.total + (r.totalFee || 0),
    }),
    { weight: 0, supply: 0, tax: 0, total: 0 },
  );

  const th: React.CSSProperties = { padding: '10px 8px', fontSize: 16, fontWeight: 800, color: '#111', background: '#eef2f7', border: '1px solid #999', textAlign: 'center', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 8px', fontSize: 16, fontWeight: 600, color: '#111', border: '1px solid #bbb', textAlign: 'center' };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right' };

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="no-print fixed top-3 right-3 flex gap-2 z-[210]">
        <button onClick={() => window.print()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-base min-h-[44px]">인쇄</button>
        <button onClick={onClose} className="px-5 py-2.5 bg-gray-500 text-white rounded-lg font-bold text-base min-h-[44px]">닫기</button>
      </div>

      <div id="stmt-area" className="print-doc" style={{
        width: 'min(210mm, 96vw)', minHeight: '297mm', background: '#fff', boxSizing: 'border-box',
        padding: 'clamp(14px, 4vw, 40px)', fontFamily: "'Pretendard', -apple-system, sans-serif",
        overflow: 'auto', maxHeight: '95dvh', boxShadow: '0 4px 24px rgba(0,0,0,.15)',
      }}>
        <h1 style={{ textAlign: 'center', fontSize: 30, fontWeight: 900, letterSpacing: '0.3em', margin: '0 0 18px', color: '#111' }}>거 래 명 세 서</h1>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, border: '1px solid #999', padding: '12px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#555', marginBottom: 4 }}>공급받는자 (거래처)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{customer || '-'}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220, border: '1px solid #999', padding: '12px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#555', marginBottom: 4 }}>공급자</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{supplier}</div>
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 10 }}>거래기간: {periodLabel}</div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', border: '1.5px solid #777' }}>
            <thead>
              <tr>
                <th style={th}>일자</th>
                <th style={th}>품목</th>
                <th style={th}>운송구분</th>
                <th style={th}>중량(톤)</th>
                <th style={th}>단가</th>
                <th style={th}>공급가액</th>
                <th style={th}>세액</th>
                <th style={th}>합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={td}>{r.date?.slice(5) || ''}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.product || ''}</td>
                  <td style={td}>{r.transportType || ''}</td>
                  <td style={tdR}>{(r.weightNet || 0).toFixed(2)}</td>
                  <td style={tdR}>{won(r.unitPrice)}</td>
                  <td style={tdR}>{won(r.transportFee)}</td>
                  <td style={tdR}>{won(r.tax)}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{won(r.totalFee)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td style={td} colSpan={8}>해당 기간 거래 내역이 없습니다.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...th, textAlign: 'right' }} colSpan={3}>합계</td>
                <td style={{ ...th, textAlign: 'right' }}>{sum.weight.toFixed(2)}</td>
                <td style={th}></td>
                <td style={{ ...th, textAlign: 'right' }}>{won(sum.supply)}</td>
                <td style={{ ...th, textAlign: 'right' }}>{won(sum.tax)}</td>
                <td style={{ ...th, textAlign: 'right', fontSize: 18 }}>{won(sum.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 40, fontSize: 16, color: '#333' }}>
          <div>인수자: ______________ (인)</div>
          <div>공급자: ______________ (인)</div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden; }
          #stmt-area, #stmt-area * { visibility: visible; }
          #stmt-area { position: absolute; left: 0; top: 0; width: 100%; min-height: auto; padding: 0; box-shadow: none !important; max-height: none; overflow: visible; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
