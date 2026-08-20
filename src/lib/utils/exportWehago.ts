'use client';

/**
 * 위하고(SMART A) 출고처리 업로드 엑셀 생성 — 우리(출하관리) 몫만 채움.
 * 상단(거래처정보) + 하단(품목정보) 2단 전표. 거래처별 그룹번호로 묶음.
 * 확실한 값만 채우고(출하일·계근수량·비고), 코드·단가 등은 비움(경기광업 입력).
 */
import * as XLSX from 'xlsx';

export interface WehagoRow {
  date: string;        // YYYY-MM-DD
  customer: string;
  product: string;
  weight: number;      // 계근수량
  vehicle?: string;
  silo?: string;
}

const TOP_HEADER = ['그룹번호', '일자', '처리구분', '거래처코드', '부서코드', '사원코드', '관리항목코드', '프로젝트코드', '납기일', '비고1', '비고2', '비고3'];
const BOT_HEADER = ['그룹번호', '품목코드', '규격', '납기일자', '수량', '단가', '공급가액', '부가세액', '창고코드', '프로젝트코드', '품목비고', '입고단가'];

export function downloadWehago(rows: WehagoRow[], periodLabel: string) {
  if (!rows.length) { alert('내보낼 출하 내역이 없습니다.'); return; }

  // 거래처 → 그룹번호 (가나다순)
  const customers = [...new Set(rows.map(r => r.customer || '미지정'))].sort((a, b) => a.localeCompare(b, 'ko'));
  const groupOf = new Map<string, number>();
  customers.forEach((c, i) => groupOf.set(c, i + 1));

  // 상단: 거래처별 1행 (그룹번호 + 비고1 거래처명 + 비고2 기간, 나머지 비움)
  const top: (string | number)[][] = [TOP_HEADER];
  for (const c of customers) top.push([groupOf.get(c)!, '', '', '', '', '', '', '', '', c, periodLabel, '']);

  // 하단: 출하 건별 1행 (그룹번호 + 납기일자 + 수량 + 품목비고, 나머지 비움)
  const bot: (string | number)[][] = [BOT_HEADER];
  const sorted = [...rows].sort((a, b) =>
    (a.customer || '').localeCompare(b.customer || '', 'ko') || String(a.date).localeCompare(String(b.date)));
  for (const r of sorted) {
    const g = groupOf.get(r.customer || '미지정')!;
    const bigo = [r.product, r.vehicle, r.silo ? `사일로${r.silo}` : ''].filter(Boolean).join(' / ');
    bot.push([g, '', '', String(r.date).replace(/-/g, ''), r.weight, '', '', '', '', '', bigo, '']);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(top), '출고처리 거래처정보(상단)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bot), '출고처리 폼목정보(하단)');
  XLSX.writeFile(wb, `위하고_출고처리_${periodLabel}.xlsx`);
}
