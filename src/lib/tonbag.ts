// 톤백 재고관리 ↔ 사일로 현황 공용 상수/계산

export const TONBAG_PRODUCTS = ['K200', 'K10', 'K18', 'K50', 'K325'];

// 톤백 1개당 중량(톤) — 톤 표시·사일로 연동 공용
export const BAG_TON: Record<string, number> = { K200: 1.2, K10: 1.4, K18: 1.4, K50: 1.4, K325: 1.6 };

// 톤백 제품 → 사일로 번호
export const PRODUCT_SILO: Record<string, number> = { K200: 3, K10: 6, K18: 8, K50: 7, K325: 1 };
// 사일로 번호 → 톤백 제품 (역매핑)
export const SILO_PRODUCT: Record<number, string> = { 3: 'K200', 6: 'K10', 8: 'K18', 7: 'K50', 1: 'K325' };

/**
 * 제품별 톤백 재고(개수) 산출 — 당일 스냅샷 방식.
 * 매일 아침 8시 그날 재고를 입력하는 운영. 이월/출하차감 없이 그날(asOf) 값만 반영:
 * = asOf 당일 아침재고 + asOf 당일 생산. (아침 입력 전이면 0)
 */
export function computeTonbagInventory(
  stockRows: { check_date: string; product: string; qty: number }[],
  prodRows: { log_date: string; product: string; good_count: number }[],
  asOf: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of TONBAG_PRODUCTS) {
    let morning = 0;
    for (const c of stockRows) if (c.product === p && c.check_date === asOf) morning = c.qty;
    let prod = 0;
    for (const l of prodRows) if (l.product === p && l.log_date === asOf) prod += l.good_count;
    out[p] = Math.max(0, morning + prod);
  }
  return out;
}
