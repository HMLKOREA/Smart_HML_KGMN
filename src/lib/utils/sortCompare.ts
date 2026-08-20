/**
 * 표 정렬 공용 비교 함수 — 영문 우선 → 한글(가나다) → 숫자·기타.
 * 각 그룹 내에서는 알파벳/가나다순, 숫자는 자연 정렬(numeric).
 * (오름차순 기준. 내림차순은 호출측에서 반전)
 */
function rank(s: string): number {
  const c = s.trim().charAt(0);
  if (/[A-Za-z]/.test(c)) return 0;              // 영문 우선
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)) return 1;      // 한글
  return 2;                                       // 숫자·기타
}

export function smartCompare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a ?? '').trim();
  const sb = String(b ?? '').trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;   // 빈값은 항상 뒤로
  if (!sb) return -1;
  const ra = rank(sa), rb = rank(sb);
  if (ra !== rb) return ra - rb;
  return sa.localeCompare(sb, ra === 0 ? 'en' : 'ko', { numeric: true, sensitivity: 'base' });
}
