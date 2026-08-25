// 톤백 재고관리 ↔ 사일로 현황 공용 상수/계산

export const TONBAG_PRODUCTS = ['K200', 'K10', 'K18', 'K50', 'K325'];

// 톤백 1개당 중량(톤) — 톤 표시·사일로 연동 공용
export const BAG_TON: Record<string, number> = { K200: 1.2, K10: 1.4, K18: 1.4, K50: 1.4, K325: 1.6 };

// 톤백 제품 → 사일로 번호
export const PRODUCT_SILO: Record<string, number> = { K200: 3, K10: 6, K18: 8, K50: 7, K325: 1 };
// 사일로 번호 → 톤백 제품 (역매핑)
export const SILO_PRODUCT: Record<number, string> = { 3: 'K200', 6: 'K10', 8: 'K18', 7: 'K50', 1: 'K325' };

/**
 * 제품별 현재 톤백 재고(개수) 산출.
 * 최신 아침재고 체크일을 기준으로 = 그날 아침재고 + 그날 생산(양호). (매일 아침 재체크 전제)
 */
export function computeTonbagInventory(
  stockRows: { check_date: string; product: string; qty: number }[],
  prodRows: { log_date: string; product: string; good_count: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of TONBAG_PRODUCTS) {
    let anchor = '';
    let morning = 0;
    for (const c of stockRows) if (c.product === p && c.check_date > anchor) { anchor = c.check_date; morning = c.qty; }
    if (!anchor) for (const l of prodRows) if (l.product === p && l.log_date > anchor) anchor = l.log_date;
    const prod = anchor ? prodRows.filter(l => l.product === p && l.log_date === anchor).reduce((s, l) => s + l.good_count, 0) : 0;
    out[p] = Math.max(0, morning + prod);
  }
  return out;
}
