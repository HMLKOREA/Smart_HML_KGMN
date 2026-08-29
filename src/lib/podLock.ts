// 운송사 계근수량 입력 마감 규칙
// - 출하확정(is_shipped) 여부와 무관하게, 출하일 +1 영업일까지 입력/수정 가능.
// - +1 영업일 = 다음 날. 단 토(6)·일(0)은 건너뛰어 다음 평일로. (금·토 출하분 → 월요일까지)
// - 마감(그날) 이후에는 잠금. 관리자(admin)는 항상 수정 가능(호출측에서 별도 우회).

/** 출하일(YYYY-MM-DD) → 입력 마감일(YYYY-MM-DD, 그날 끝까지 허용) */
export function weightLockDeadline(shipmentDate: string): string {
  const base = (shipmentDate || '').slice(0, 10);
  const d = new Date(base + 'T00:00:00Z');
  if (isNaN(d.getTime())) return base;
  d.setUTCDate(d.getUTCDate() + 1);                 // D+1
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) // 일(0)·토(6) 건너뜀
    d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 오늘(KST) 날짜 YYYY-MM-DD */
export function kstTodayStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 운송사 기준 계근수량 잠금 여부(오늘 KST가 마감일을 지났으면 true). 관리자는 호출측에서 우회. */
export function isWeightLocked(shipmentDate: string): boolean {
  if (!shipmentDate) return false;
  return kstTodayStr() > weightLockDeadline(shipmentDate);
}
