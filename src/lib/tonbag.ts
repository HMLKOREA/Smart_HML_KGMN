// 톤백 재고관리 ↔ 사일로 현황 공용 상수/계산

export const TONBAG_PRODUCTS = ['K200', 'K10', 'K18', 'K50', 'K325'];

// 톤백 1개당 중량(톤) — 톤 표시·사일로 연동 공용
export const BAG_TON: Record<string, number> = { K200: 1.2, K10: 1.4, K18: 1.4, K50: 1.4, K325: 1.6 };

// 톤백 제품 → 사일로 번호
export const PRODUCT_SILO: Record<string, number> = { K200: 3, K10: 6, K18: 8, K50: 7, K325: 1 };
// 사일로 번호 → 톤백 제품 (역매핑)
export const SILO_PRODUCT: Record<number, string> = { 3: 'K200', 6: 'K10', 8: 'K18', 7: 'K50', 1: 'K325' };

/**
 * 제품별 톤백 재고(개수) 산출 — 이월(carry-over) 방식.
 * asOf 시점 기준: 가장 최근 아침재고 체크(≤asOf)를 기준값으로, 그 체크일 이후(포함)의 생산을 더함.
 * → 오늘 아침 재체크를 안 해도 최근 재고가 그대로 이월되어 표시됨.
 */
export function computeTonbagInventory(
  stockRows: { check_date: string; product: string; qty: number }[],
  prodRows: { log_date: string; product: string; good_count: number }[],
  asOf: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of TONBAG_PRODUCTS) {
    let baseDate = '';
    let baseQty = 0;
    let hasBase = false;
    for (const c of stockRows) {
      if (c.product === p && c.check_date <= asOf && c.check_date >= baseDate) {
        baseDate = c.check_date; baseQty = c.qty; hasBase = true;
      }
    }
    let prod = 0;
    for (const l of prodRows) {
      if (l.product === p && l.log_date <= asOf && (!hasBase || l.log_date >= baseDate)) prod += l.good_count;
    }
    out[p] = Math.max(0, baseQty + prod);
  }
  return out;
}
