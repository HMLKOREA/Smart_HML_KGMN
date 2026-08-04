'use client';

/**
 * CSV 가져오기 유틸리티
 * - BOM 제거, 따옴표/콤마/줄바꿈 포함 필드 처리
 * - 헤더 행 기준으로 { [헤더]: 값 } 객체 배열 반환
 */

/** CSV 텍스트 → 2차원 배열 (RFC4180 준수 파서) */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  // BOM 제거
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
      else field += c;
    }
  }
  // 마지막 필드/행
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** CSV 텍스트 → 레코드 배열 (헤더 기반). 빈 행은 제외 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text).filter(r => r.some(c => c.trim() !== ''));
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

/** 파일 → 텍스트 (UTF-8) */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}
