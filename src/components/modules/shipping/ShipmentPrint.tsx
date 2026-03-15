'use client';

import { useEffect } from 'react';

/**
 * 출하증 출력 컴포넌트
 * 경기광업주식회사 스타일 — A4 용지에 2매 복사본 (상/하)
 *
 * 레이아웃 계산 (A4 = 210mm × 297mm):
 *   @page margin: 0  →  전체 297mm 사용
 *   내부 padding: 14mm 상하, 20mm 좌우
 *   가용 높이: 297 - 28 = 269mm
 *   각 복사본: (269 - 5mm 절취선) / 2 ≈ 132mm
 *   복사본 콘텐츠: ~105mm → 27mm 여유 (space-between으로 배분)
 */

interface ShipmentPrintProps {
  shipment: {
    shipment_date: string;
    shipment_number: string;
    customer_name?: string;
    product_name?: string;
    product_code?: string;
    quantity: number;
    unit: string;
    driver_name?: string;
    vehicle_number?: string;
    company_name?: string;
    weight_empty?: number;
    weight_loaded?: number;
    weight_net?: number;
    delivery_address?: string;
    memo?: string;
    certificate_time?: string;
    notes?: string;
  };
  onClose: () => void;
}

/** 단일 출하증 복사본 (상/하 반복용) */
function CertificateCopy({ shipment, issuedTime }: { shipment: ShipmentPrintProps['shipment']; issuedTime: string }) {
  const rows: [string, string][] = [
    ['출하일시', issuedTime],
    ['출    하', '경기광업'],
    ['거 래 처', shipment.customer_name || '-'],
    ['제 품 명', shipment.product_name || '-'],
    ['운 송 사', shipment.company_name || '-'],
    ['차량정보', shipment.vehicle_number || '-'],
    ['중    량', ''],
    ['기    타', shipment.notes || shipment.memo || ''],
  ];

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      {/* ── 상단: 로고 + 제목 + 테이블 ── */}
      <div>
        {/* 경기광업 로고 (PNG: 로고마크 + 경기광업주식회사 텍스트 포함) */}
        <div style={{ marginBottom: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kgmn-logo.png"
            alt="경기광업주식회사"
            style={{ height: 28, objectFit: 'contain', display: 'block' }}
          />
        </div>

        {/* 제목 */}
        <div style={{
          textAlign: 'center',
          marginTop: 28,
          marginBottom: 10,
          borderBottom: '2px solid #1e293b',
          paddingBottom: 6,
        }}>
          <h2 style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#1e293b',
            letterSpacing: '0.4em',
            textDecoration: 'underline',
            textUnderlineOffset: 5,
            textDecorationThickness: 2,
            textDecorationColor: '#1e293b',
            margin: 0,
            padding: 0,
            lineHeight: 1.3,
          }}>
            출 하 증
          </h2>
        </div>

        {/* 테이블 */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1.5px solid #374151',
        }}>
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={i}>
                <td style={{
                  width: 100,
                  padding: '6px 14px',
                  backgroundColor: '#f3f4f6',
                  borderBottom: i < rows.length - 1 ? '1px solid #d1d5db' : 'none',
                  borderRight: '1.5px solid #374151',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#374151',
                  whiteSpace: 'pre',
                  letterSpacing: '0.06em',
                  lineHeight: 1.4,
                }}>
                  {label}
                </td>
                <td style={{
                  padding: '6px 16px',
                  borderBottom: i < rows.length - 1 ? '1px solid #d1d5db' : 'none',
                  fontSize: 13,
                  color: '#111827',
                  lineHeight: 1.4,
                }}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 하단: 발급시간 + HAMEL 정보 ── */}
      <div>
        <div style={{
          fontSize: 10,
          color: '#6b7280',
          marginBottom: 6,
          lineHeight: 1,
        }}>
          출하일시: {issuedTime}
        </div>
        <div style={{
          borderTop: '1px solid #d1d5db',
          paddingTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hamel-logo.png"
              alt="HAMEL KOREA"
              style={{ height: 24, objectFit: 'contain' }}
            />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', lineHeight: 1.4 }}>
                HAMEL KOREA CO., LTD
              </div>
              <div style={{ fontSize: 8, color: '#6b7280', lineHeight: 1.4 }}>
                서울시 강남구 선릉로 638
              </div>
            </div>
          </div>
          <div style={{ fontSize: 8, color: '#6b7280', textAlign: 'right', lineHeight: 1.6 }}>
            <div>kgmn@hmlkorea.com</div>
            <div>www.moqv.kr</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShipmentPrint({ shipment, onClose }: ShipmentPrintProps) {
  const now = new Date();
  const issuedTime = shipment.certificate_time
    ? (() => {
        const d = new Date(shipment.certificate_time);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 자동 인쇄
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      {/* 인쇄/닫기 버튼 — 화면에서만 표시 */}
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

      {/* ── 출하증 본문 (A4) ──
          화면: 210mm × 297mm 고정 크기 미리보기
          인쇄: @page margin:0 + 내부 padding으로 여백 제어
      */}
      <div
        id="print-area"
        style={{
          width: '210mm',
          height: '297mm',
          backgroundColor: '#fff',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          boxSizing: 'border-box',
          padding: '14mm 20mm',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 1매 — 상단 절반 */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CertificateCopy shipment={shipment} issuedTime={issuedTime} />
        </div>

        {/* 절취선 */}
        <div style={{
          flexShrink: 0,
          padding: '6px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            borderBottom: '1px dashed #9ca3af',
          }} />
          <span style={{
            position: 'relative',
            backgroundColor: '#fff',
            padding: '0 12px',
            fontSize: 9,
            color: '#9ca3af',
          }}>
            ✂ 절취선
          </span>
        </div>

        {/* 2매 — 하단 절반 */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CertificateCopy shipment={shipment} issuedTime={issuedTime} />
        </div>
      </div>

      {/* 인쇄 전용 스타일 — @page margin:0 으로 잘림 방지 */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
            padding: 14mm 20mm;
            box-sizing: border-box;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
