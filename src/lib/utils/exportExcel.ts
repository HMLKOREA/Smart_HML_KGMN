'use client';

/**
 * 엑셀 내보내기 유틸리티
 * CSV 형태로 내보내며, 한글이 깨지지 않도록 BOM을 추가합니다.
 */

interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
}

export function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExcelColumn[],
  filename: string
) {
  if (data.length === 0) {
    alert('내보낼 데이터가 없습니다.');
    return;
  }

  // BOM (Byte Order Mark) 추가 - 엑셀에서 한글 인식용
  const BOM = '\uFEFF';

  // 헤더 행
  const headerRow = columns.map(col => escapeCSV(col.header)).join(',');

  // 데이터 행
  const dataRows = data.map(row =>
    columns
      .map(col => {
        const value = row[col.key];
        if (col.formatter) {
          return escapeCSV(col.formatter(value));
        }
        if (value === null || value === undefined) return '';
        return escapeCSV(String(value));
      })
      .join(',')
  );

  const csvContent = BOM + [headerRow, ...dataRows].join('\n');

  // 파일 다운로드
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${formatDateForFile(new Date())}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateForFile(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

// 각 모듈별 엑셀 컬럼 정의
export const EXCEL_COLUMNS = {
  shipments: [
    { key: 'shipment_date', header: '출하일자' },
    { key: 'shipment_number', header: '출하번호' },
    { key: 'customer_name', header: '거래처' },
    { key: 'product_name', header: '제품명' },
    { key: 'quantity', header: '수량' },
    { key: 'unit', header: '단위' },
    { key: 'driver_name', header: '기사명' },
    { key: 'vehicle_number', header: '차량번호' },
    { key: 'company_name', header: '운송사' },
    { key: 'weight_empty', header: '공차중량' },
    { key: 'weight_loaded', header: '적재중량' },
    { key: 'weight_net', header: '순중량' },
    { key: 'status', header: '상태' },
    { key: 'memo', header: '비고' },
  ],
  dispatches: [
    { key: 'dispatch_date', header: '배차일자' },
    { key: 'dispatch_number', header: '배차번호' },
    { key: 'company_name', header: '운송사' },
    { key: 'driver_name', header: '기사명' },
    { key: 'vehicle_number', header: '차량번호' },
    { key: 'product_name', header: '제품명' },
    { key: 'customer_name', header: '거래처' },
    { key: 'quantity', header: '수량' },
    { key: 'status', header: '상태' },
    { key: 'memo', header: '비고' },
  ],
  companies: [
    { key: 'name', header: '운송사명' },
    { key: 'business_number', header: '사업자번호' },
    { key: 'representative', header: '대표자' },
    { key: 'phone', header: '전화번호' },
    { key: 'address', header: '주소' },
    { key: 'email', header: '이메일' },
    { key: 'bank_name', header: '은행명' },
    { key: 'account_number', header: '계좌번호' },
    { key: 'account_holder', header: '예금주' },
  ],
  customers: [
    { key: 'name', header: '거래처명' },
    { key: 'business_number', header: '사업자번호' },
    { key: 'representative', header: '대표자' },
    { key: 'phone', header: '전화번호' },
    { key: 'address', header: '주소' },
    { key: 'delivery_address', header: '납품주소' },
    { key: 'email', header: '이메일' },
  ],
  drivers: [
    { key: 'name', header: '기사명' },
    { key: 'phone', header: '연락처' },
    { key: 'vehicle_number', header: '차량번호' },
    { key: 'vehicle_type', header: '차종' },
    { key: 'vehicle_tonnage', header: '톤수' },
    { key: 'company_name', header: '운송사' },
  ],
  products: [
    { key: 'code', header: '제품코드' },
    { key: 'name', header: '제품명' },
    { key: 'specification', header: '규격' },
    { key: 'unit', header: '단위' },
    { key: 'unit_price', header: '단가' },
    { key: 'category', header: '분류' },
  ],
  settlements: [
    { key: 'settlement_date', header: '정산일자' },
    { key: 'settlement_number', header: '정산번호' },
    { key: 'company_name', header: '운송사' },
    { key: 'period_start', header: '기간시작' },
    { key: 'period_end', header: '기간종료' },
    { key: 'total_quantity', header: '총수량' },
    { key: 'total_amount', header: '공급가액' },
    { key: 'tax_amount', header: '세액' },
    { key: 'final_amount', header: '합계금액' },
    { key: 'status', header: '상태' },
  ],
};
