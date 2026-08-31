'use client';

import { useEffect, useRef } from 'react';

/**
 * 출하증 출력 — 경기광업주식회사 양식 (기존 출하증과 동일)
 * A4 1장에 2매(상/하), 여백 좁게.
 */
interface ShipmentPrintProps {
  shipment: {
    shipment_date: string;
    shipment_number: string;
    customer_name?: string;
    product_name?: string;
    product_code?: string;
    quantity?: number;
    unit?: string;
    driver_name?: string;
    company_name?: string;
    vehicle_number?: string;
    weight_empty?: number;
    weight_loaded?: number;
    weight_net?: number;
    delivery_address?: string;
    certificate_time?: string;
    memo?: string;
    notes?: string;
  };
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDateTime = (d: Date) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** 단일 출하증 복사본 */
function CertificateCopy({ shipment, shipDate, issuedTime }: { shipment: ShipmentPrintProps['shipment']; shipDate: string; issuedTime: string }) {
  const rows: [string, string][] = [
    ['출하일시', shipDate],
    ['출하', '경기광업'],
    ['거래처', shipment.customer_name || '-'],
    ['제품명', shipment.product_name || '-'],
    ['운송사', shipment.company_name || '-'],
    ['차량정보', shipment.vehicle_number || '-'],
    ['중량', '계량 기준에 따름'],
    ['기타', shipment.notes || shipment.memo || ''],
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif" }}>
      {/* 상단: 경기광업 로고 + 제목 + 표 */}
      <div>
        {/* 경기광업 로고 (마크 + 경기광업주식회사 텍스트 포함) — 중앙 */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kgmn-logo.png" alt="경기광업주식회사" style={{ height: 34, objectFit: 'contain', display: 'inline-block' }} />
        </div>

        {/* 제목 */}
        <div style={{ textAlign: 'center', margin: '6px 0 10px' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#111', letterSpacing: '0.15em' }}>출하증</span>
        </div>

        {/* 표 (중앙, 좌우 여백) */}
        <table style={{ width: '80%', margin: '0 auto', borderCollapse: 'collapse', border: '1px solid #555' }}>
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={i}>
                <td style={{
                  width: '30%', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle',
                  border: '1px solid #9aa0a6', fontSize: 12.5, fontWeight: 700, color: '#222', whiteSpace: 'nowrap',
                }}>{label}</td>
                <td style={{
                  padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle',
                  border: '1px solid #9aa0a6', fontSize: 12.5, color: '#111',
                }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 발급시각 (표 아래 우측) */}
        <div style={{ width: '80%', margin: '6px auto 0', textAlign: 'right', fontSize: 11, color: '#333' }}>
          출하일시:&nbsp;&nbsp;&nbsp;{issuedTime}
        </div>
      </div>

      {/* 하단: 하멜 로고 + 회사정보 (중앙) */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hamel-logo.png" alt="HAMEL KOREA" style={{ height: 60, objectFit: 'contain', display: 'inline-block', marginBottom: 5 }} />
        <div style={{ fontSize: 14, fontWeight: 800, color: '#222', letterSpacing: '0.02em', lineHeight: 1.5 }}>HAMEL KOREA CO., LTD</div>
        <div style={{ fontSize: 10, color: '#444', lineHeight: 1.7 }}>서울특별시 강남구 선릉로 638 에버홈빌딩 2F</div>
        <div style={{ fontSize: 10, color: '#444', lineHeight: 1.7 }}>T. 02-6956-6710 / F. 02-6956-6712</div>
      </div>
    </div>
  );
}

export default function ShipmentPrint({ shipment, onClose }: ShipmentPrintProps) {
  const issued = shipment.certificate_time ? new Date(shipment.certificate_time) : new Date();
  const issuedTime = fmtDateTime(issued);
  const shipDate = shipment.shipment_date
    ? String(shipment.shipment_date).slice(0, 10)
    : fmtDate(issued);

  const printed = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { printed.current = true; window.print(); }, 400);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  // 인쇄 대화상자가 닫히면(인쇄 완료/취소) 자동으로 닫아 대기화면으로 복귀.
  // afterprint 미발화 브라우저 대비 focus 폴백 병행(인쇄 중 blur → 닫히면 focus).
  useEffect(() => {
    let done = false;
    const close = () => { if (done) return; done = true; setTimeout(() => onClose(), 200); };
    const onFocus = () => { if (printed.current) close(); };
    window.addEventListener('afterprint', close);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('afterprint', close); window.removeEventListener('focus', onFocus); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[500] flex items-center justify-center">
      <div className="no-print fixed top-4 right-4 flex gap-2 z-[510]">
        <button onClick={() => { printed.current = true; window.print(); }} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">인쇄</button>
        <button onClick={onClose} className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium">닫기</button>
      </div>

      <div
        id="print-shipment-area"
        style={{
          width: '210mm', height: '297mm', backgroundColor: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          boxSizing: 'border-box', padding: '9mm 12mm', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <CertificateCopy shipment={shipment} shipDate={shipDate} issuedTime={issuedTime} />
        </div>
        <div style={{ flexShrink: 0, padding: '5px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, borderBottom: '1px dashed #9ca3af' }} />
          <span style={{ position: 'relative', backgroundColor: '#fff', padding: '0 12px', fontSize: 9, color: '#9ca3af' }}>✂ 절취선</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <CertificateCopy shipment={shipment} shipDate={shipDate} issuedTime={issuedTime} />
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body * { visibility: hidden; }
          #print-shipment-area, #print-shipment-area * { visibility: visible; }
          #print-shipment-area { position: absolute; left: 0; top: 0; width: 210mm; height: 297mm; padding: 9mm 12mm; box-sizing: border-box; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
