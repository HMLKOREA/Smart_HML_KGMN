/**
 * 정산 월간/기간 분석 엔진 (순수 함수)
 * 가이던스 §1~§9 구현. 입력 라인 → AnalysisPayload → runChecks.
 * 계산(엔진)과 표현(렌더)을 분리: 렌더러는 payload만 소비.
 */

export type VehicleType = 'TANK_LORRY' | 'CARGO_TRUCK' | 'GOODS';
export type RateBasis = 'PER_TON' | 'PER_TRIP';

export interface SettlementLine {
  month: string;            // 'YYYY-MM' (정산 귀속월)
  vehicleType: VehicleType;
  origin: string;
  client: string;           // 거래처(정규화 전 원본)
  carrier: string;          // 운송사
  unitPrice: number;
  rateBasis: RateBasis;
  trips: number;
  tons: number;
  amount: number;           // 운송금액(VAT 별도). 상차도=0
  isSelfLoad?: boolean;
  isGoods?: boolean;
}

export interface PeriodExtras {
  consultingCharge: number; // 컨설팅 차지(원, VAT 별도)
  vatRate: number;          // 기본 0.10
  operationalNotes?: string[];
}

export type Triple = { trips: number; tons: number; amount: number };
export interface Insight { tag: '감소' | '증가' | '집중도' | '운영'; head: string; body: string }
export interface CheckResult { id: string; label: string; ok: boolean; detail?: string }

export interface AnalysisPayload {
  meta: { company: string; periodLabel: string; periodKey: string; prevLabel: string;
          reportDate: string; supplier: string; vatRate: number; mode: PeriodMode };
  kpi: {
    freightTotal: number; totalTons: number; billedTotal: number;
    tankRatePerTon: number; vehicleCount: number;
    breakdown: { tank: Triple; goods: Triple; cargo: Triple; bct: Triple };
    mom: { freightPct: number; tonsPct: number; ratePct: number; freightAbs: number; tonsAbs: number;
           prevFreight: number; prevTons: number; prevRate: number };
  };
  reconciliation: { freight: number; consulting: number; supply: number; vat: number; billedTotal: number };
  volumeNote: { totalTons: number; selfLoadTons: number; billableTons: number };
  carriers: Array<{ name: string; tonsPrev: number; tonsCur: number; amtCur: number | null; gapAmt: number | null; sharePct: number | null }>;
  clients: Array<{ name: string; amtCur: number; sharePct: number; cumPct: number }>;
  concentration: { top4Pct: number; top6Pct: number };
  trend: Array<{ month: string; freightTotal: number; totalTons: number }>;
  detail: {
    tankByCarrier: DetailGroup[];
    goods: DetailGroup[];
    bctTotal: { prev: Triple; cur: Triple };
    cargo: Array<{ carrier: string; client: string; unitPrice: number; prev: Triple | null; cur: Triple | null }>;
  };
  summary: { insights: Insight[]; operationalNotes: string[] };
  checks: CheckResult[];
}
export interface DetailGroup { carrier: string; rows: Array<{ client: string; unitPrice: number; prev: Triple | null; cur: Triple | null }>; subtotalPrev: Triple; subtotalCur: Triple }

export type PeriodMode = 'month' | 'quarter' | 'half' | 'year';

export interface AnalysisConfig {
  clientNormalize?: (name: string) => string;
  carrierOrder?: string[];
  topN?: number;
  monthlySeries?: Array<{ month: string; freightTotal: number; totalTons: number }>; // 추이(외부 제공)
}

const CARRIER_ORDER = ['퍼스트', '강천', '성진', '대경', '진흥', '태윤', '우주', '우신', '상차도'];

// §7.1 거래처 정규화 (기본 규칙 — config로 교체 가능)
export function defaultNormalizeClient(name: string): string {
  const n = (name || '').trim();
  if (/금호/.test(n)) return '금호석유화학';
  if (/SGC/i.test(n)) return 'SGC에너지';
  if (/KDF|보령/.test(n)) return 'KDF보령';
  if (/삼승/.test(n)) return '삼승화학';
  if (/한화.*여수|여수.*한화/.test(n)) return '한화에너지 여수';
  return n;
}

const z: Triple = { trips: 0, tons: 0, amount: 0 };
const addT = (a: Triple, l: SettlementLine): Triple => ({ trips: a.trips + (l.trips || 0), tons: a.tons + (l.tons || 0), amount: a.amount + (l.amount || 0) });
const sumT = (a: Triple, b: Triple): Triple => ({ trips: a.trips + b.trips, tons: a.tons + b.tons, amount: a.amount + b.amount });
const r0 = (n: number) => Math.round(n);
const pct = (num: number, den: number) => den ? (num / den) * 100 : 0;

function aggregate(lines: SettlementLine[]) {
  let tank = { ...z }, goods = { ...z }, cargo = { ...z };
  let totalTons = 0, selfLoadTons = 0;
  for (const l of lines) {
    totalTons += l.tons || 0;
    if (l.isSelfLoad) { selfLoadTons += l.tons || 0; continue; } // 상차도: 톤만, 금액/대수 제외
    if (l.vehicleType === 'CARGO_TRUCK') cargo = addT(cargo, l);
    else if (l.vehicleType === 'GOODS') goods = addT(goods, l);
    else tank = addT(tank, l);
  }
  const bct = sumT(tank, goods);
  const freightTotal = bct.amount + cargo.amount;
  const vehicleCount = tank.trips + goods.trips + cargo.trips;
  const billableTons = totalTons - selfLoadTons;
  const tankRate = tank.tons ? tank.amount / tank.tons : 0;
  return { tank, goods, cargo, bct, freightTotal, vehicleCount, totalTons, selfLoadTons, billableTons, tankRate };
}

function detailGroups(lines: SettlementLine[], prev: SettlementLine[], filter: (l: SettlementLine) => boolean, order: string[]): DetailGroup[] {
  const key = (l: SettlementLine) => `${l.carrier}||${l.client}||${l.unitPrice}`;
  const groups = new Map<string, DetailGroup>();
  const ensure = (carrier: string) => {
    if (!groups.has(carrier)) groups.set(carrier, { carrier, rows: [], subtotalPrev: { ...z }, subtotalCur: { ...z } });
    return groups.get(carrier)!;
  };
  const rowMap = new Map<string, { carrier: string; client: string; unitPrice: number; prev: Triple; cur: Triple }>();
  const acc = (arr: SettlementLine[], side: 'prev' | 'cur') => {
    for (const l of arr) {
      if (!filter(l) || l.isSelfLoad) continue;
      const k = key(l);
      if (!rowMap.has(k)) rowMap.set(k, { carrier: l.carrier, client: l.client, unitPrice: l.unitPrice, prev: { ...z }, cur: { ...z } });
      const row = rowMap.get(k)!;
      row[side] = addT(row[side], l);
    }
  };
  acc(prev, 'prev'); acc(lines, 'cur');
  for (const row of rowMap.values()) {
    const g = ensure(row.carrier);
    g.rows.push({ client: row.client, unitPrice: row.unitPrice, prev: row.prev.trips || row.prev.tons ? row.prev : null, cur: row.cur.trips || row.cur.tons ? row.cur : null });
    g.subtotalPrev = sumT(g.subtotalPrev, row.prev);
    g.subtotalCur = sumT(g.subtotalCur, row.cur);
  }
  const ordIdx = (c: string) => { const i = order.indexOf(c); return i === -1 ? 999 : i; };
  return [...groups.values()].sort((a, b) => ordIdx(a.carrier) - ordIdx(b.carrier) || b.subtotalCur.amount - a.subtotalCur.amount);
}

export function computeAnalysis(
  cur: SettlementLine[], prev: SettlementLine[], extras: PeriodExtras,
  meta: { company: string; periodLabel: string; periodKey: string; prevLabel: string; reportDate: string; supplier: string; mode: PeriodMode },
  cfg: AnalysisConfig = {},
): AnalysisPayload {
  const norm = cfg.clientNormalize || defaultNormalizeClient;
  const order = cfg.carrierOrder || CARRIER_ORDER;
  const topN = cfg.topN ?? 10;
  const vat = extras.vatRate ?? 0.10;

  const A = aggregate(cur);
  const P = aggregate(prev);

  // KPI
  const billedTotal = r0((A.freightTotal + extras.consultingCharge) * (1 + vat));
  const mom = {
    freightAbs: A.freightTotal - P.freightTotal,
    tonsAbs: A.totalTons - P.totalTons,
    freightPct: pct(A.freightTotal - P.freightTotal, P.freightTotal),
    tonsPct: pct(A.totalTons - P.totalTons, P.totalTons),
    ratePct: pct(A.tankRate - P.tankRate, P.tankRate),
    prevFreight: P.freightTotal, prevTons: P.totalTons, prevRate: P.tankRate,
  };

  // 인보이스 대사
  const supply = A.freightTotal + extras.consultingCharge;
  const reconciliation = { freight: A.freightTotal, consulting: extras.consultingCharge, supply, vat: r0(supply * vat), billedTotal };

  // 운송사별 (상차도 포함, 금액/비중은 상차도 null)
  const carrierMap = new Map<string, { tonsPrev: number; tonsCur: number; amtCur: number; self: boolean }>();
  const ensureC = (c: string, self: boolean) => { if (!carrierMap.has(c)) carrierMap.set(c, { tonsPrev: 0, tonsCur: 0, amtCur: 0, self }); return carrierMap.get(c)!; };
  for (const l of prev) ensureC(l.carrier, !!l.isSelfLoad).tonsPrev += l.tons || 0;
  for (const l of cur) { const e = ensureC(l.carrier, !!l.isSelfLoad); e.tonsCur += l.tons || 0; if (!l.isSelfLoad) e.amtCur += l.amount || 0; }
  const carriers = [...carrierMap.entries()].map(([name, v]) => ({
    name, tonsPrev: v.tonsPrev, tonsCur: v.tonsCur,
    amtCur: v.self ? null : v.amtCur,
    gapAmt: v.self ? null : v.amtCur - (0), // gapAmt = amt7 - amt6 (금액) — 아래서 보정
    sharePct: v.self ? null : pct(v.amtCur, A.freightTotal),
  }));
  // gapAmt 보정: 전월 금액 필요 → 전월 운송사 금액 맵
  const prevCarrierAmt = new Map<string, number>();
  for (const l of prev) if (!l.isSelfLoad) prevCarrierAmt.set(l.carrier, (prevCarrierAmt.get(l.carrier) || 0) + (l.amount || 0));
  for (const c of carriers) if (c.amtCur != null) c.gapAmt = c.amtCur - (prevCarrierAmt.get(c.name) || 0);
  carriers.sort((a, b) => { const oi = (n: string) => { const i = order.indexOf(n); return i === -1 ? 999 : i; }; return oi(a.name) - oi(b.name); });

  // 거래처 집중도 (탱크+상품, 정규화)
  const clientAmt = new Map<string, number>();
  const tankGoodsAmt = A.tank.amount + A.goods.amount;
  for (const l of cur) {
    if (l.isSelfLoad || l.vehicleType === 'CARGO_TRUCK') continue;
    const c = norm(l.client);
    clientAmt.set(c, (clientAmt.get(c) || 0) + (l.amount || 0));
  }
  let clientArr = [...clientAmt.entries()].map(([name, amt]) => ({ name, amtCur: amt, sharePct: pct(amt, tankGoodsAmt), cumPct: 0 }))
    .sort((a, b) => b.amtCur - a.amtCur);
  let cum = 0; clientArr.forEach(c => { cum += c.sharePct; c.cumPct = cum; });
  const top4 = clientArr.slice(0, 4).reduce((s, c) => s + c.sharePct, 0);
  const top6 = clientArr.slice(0, 6).reduce((s, c) => s + c.sharePct, 0);
  // 상위 N + Other
  if (clientArr.length > topN) {
    const head = clientArr.slice(0, topN);
    const rest = clientArr.slice(topN);
    const otherAmt = rest.reduce((s, c) => s + c.amtCur, 0);
    head.push({ name: '기타', amtCur: otherAmt, sharePct: pct(otherAmt, tankGoodsAmt), cumPct: 100 });
    clientArr = head;
  }

  // 상세 부속서
  const tankByCarrier = detailGroups(cur, prev, l => l.vehicleType === 'TANK_LORRY', order);
  const goodsGroups = detailGroups(cur, prev, l => l.vehicleType === 'GOODS', order);
  const bctTotal = { prev: P.bct, cur: A.bct };
  // 카고 (독립 섹션): carrier+client+unitPrice, prev/cur triple
  const cargoMap = new Map<string, { carrier: string; client: string; unitPrice: number; prev: Triple; cur: Triple }>();
  const cargoAcc = (arr: SettlementLine[], side: 'prev' | 'cur') => {
    for (const l of arr) { if (l.vehicleType !== 'CARGO_TRUCK' || l.isSelfLoad) continue; const k = `${l.carrier}||${l.client}||${l.unitPrice}`; if (!cargoMap.has(k)) cargoMap.set(k, { carrier: l.carrier, client: l.client, unitPrice: l.unitPrice, prev: { ...z }, cur: { ...z } }); cargoMap.get(k)![side] = addT(cargoMap.get(k)![side], l); }
  };
  cargoAcc(prev, 'prev'); cargoAcc(cur, 'cur');
  const cargo = [...cargoMap.values()].map(c => ({ carrier: c.carrier, client: c.client, unitPrice: c.unitPrice, prev: (c.prev.trips || c.prev.tons) ? c.prev : null, cur: (c.cur.trips || c.cur.tons) ? c.cur : null }));

  // 요약 (§9)
  const insights = buildInsights({ A, P, mom, carriers, clientArr, top4, top6, norm, cur, prev });

  const trend = cfg.monthlySeries || [{ month: meta.periodKey, freightTotal: A.freightTotal, totalTons: A.totalTons }];

  const payload: AnalysisPayload = {
    meta: { company: meta.company, periodLabel: meta.periodLabel, periodKey: meta.periodKey, prevLabel: meta.prevLabel, reportDate: meta.reportDate, supplier: meta.supplier, vatRate: vat, mode: meta.mode },
    kpi: {
      freightTotal: A.freightTotal, totalTons: A.totalTons, billedTotal, tankRatePerTon: r0(A.tankRate), vehicleCount: A.vehicleCount,
      breakdown: { tank: A.tank, goods: A.goods, cargo: A.cargo, bct: A.bct }, mom,
    },
    reconciliation, volumeNote: { totalTons: A.totalTons, selfLoadTons: A.selfLoadTons, billableTons: A.billableTons },
    carriers, clients: clientArr, concentration: { top4Pct: top4, top6Pct: top6 }, trend,
    detail: { tankByCarrier, goods: goodsGroups, bctTotal, cargo },
    summary: { insights, operationalNotes: extras.operationalNotes || [] },
    checks: [],
  };
  payload.checks = runChecks(payload, A, P, extras);
  return payload;
}

function buildInsights(ctx: {
  A: ReturnType<typeof aggregate>; P: ReturnType<typeof aggregate>;
  mom: AnalysisPayload['kpi']['mom']; carriers: AnalysisPayload['carriers']; clientArr: AnalysisPayload['clients'];
  top4: number; top6: number; norm: (s: string) => string; cur: SettlementLine[]; prev: SettlementLine[];
}): Insight[] {
  const out: Insight[] = [];
  const M = (n: number) => `₩${(Math.abs(n) / 1_000_000).toFixed(1)}백만`;
  // 감소/증가
  if (ctx.mom.freightPct < 0) {
    out.push({ tag: '감소', head: '물량 감소', body: `운송비(${ctx.mom.freightPct.toFixed(1)}%)·운송량(${ctx.mom.tonsPct.toFixed(1)}%)이 함께 하락, 실행단가는 ${ctx.mom.ratePct.toFixed(1)}%. ${Math.abs(ctx.mom.ratePct) <= 3 ? '사실상 물량 효과이며 단가·수익성 훼손은 아닙니다.' : '단가 변동을 함께 점검하세요.'}` });
  } else if (ctx.mom.freightPct > 0) {
    out.push({ tag: '증가', head: '물량 증가', body: `운송비(+${ctx.mom.freightPct.toFixed(1)}%)·운송량(+${ctx.mom.tonsPct.toFixed(1)}%) 증가, 실행단가 ${ctx.mom.ratePct.toFixed(1)}%.` });
  }
  const movers = ctx.carriers.filter(c => c.gapAmt != null).sort((a, b) => (a.gapAmt || 0) - (b.gapAmt || 0));
  const down = movers.filter(c => (c.gapAmt || 0) < 0).slice(0, 3);
  const up = movers.filter(c => (c.gapAmt || 0) > 0).sort((a, b) => (b.gapAmt || 0) - (a.gapAmt || 0)).slice(0, 3);
  if (down.length) out.push({ tag: '감소', head: '감소는 소수 운송사에 집중', body: down.map(c => `${c.name} −${M(c.gapAmt || 0)}`).join(', ') + '.' });
  if (up.length) out.push({ tag: '증가', head: '일부 구간 반등', body: up.map(c => `${c.name} +${M(c.gapAmt || 0)}`).join(' · ') + '.' });
  // 집중도
  const t4 = ctx.clientArr.slice(0, 4).map(c => c.name).join('·');
  out.push({ tag: '집중도', head: `상위 4개사가 ${ctx.top4.toFixed(0)}%`, body: `탱크로리 매출의 ${ctx.top4.toFixed(1)}%를 상위 4개사(${t4})가 점유. 상위 6개사 ${ctx.top6.toFixed(1)}%.` });
  return out;
}

export function runChecks(p: AnalysisPayload, A: ReturnType<typeof aggregate>, P: ReturnType<typeof aggregate>, extras: PeriodExtras): CheckResult[] {
  const eqWon = (a: number, b: number) => Math.abs(Math.round(a) - Math.round(b)) <= 1;
  const eqPct = (a: number, b: number) => Math.abs(a - b) <= 0.1;
  const c: CheckResult[] = [];
  const tankSub = p.detail.tankByCarrier.reduce((s, g) => s + g.subtotalCur.amount, 0);
  c.push({ id: 'C1', label: '탱크 운송사 소계 = 탱크 총액', ok: eqWon(tankSub, A.tank.amount), detail: `${Math.round(tankSub)} vs ${Math.round(A.tank.amount)}` });
  c.push({ id: 'C2', label: '탱크+상품 = BCT', ok: eqWon(A.tank.amount + A.goods.amount, A.bct.amount) });
  c.push({ id: 'C3', label: 'BCT+카고 = 총운송비', ok: eqWon(A.bct.amount + A.cargo.amount, A.freightTotal) });
  c.push({ id: 'C4', label: '공급가액·VAT·청구총액 정합', ok: eqWon(p.reconciliation.freight + p.reconciliation.consulting, p.reconciliation.supply) && eqWon(Math.round(p.reconciliation.supply * (1 + p.meta.vatRate)), p.reconciliation.billedTotal) });
  const clientSum = p.clients.reduce((s, x) => s + x.amtCur, 0);
  c.push({ id: 'C5', label: '거래처 합 = 탱크+상품', ok: eqWon(clientSum, A.tank.amount + A.goods.amount) });
  const shareSum = p.carriers.filter(x => x.sharePct != null).reduce((s, x) => s + (x.sharePct || 0), 0);
  c.push({ id: 'C6', label: '운송사 비중 합 ≈ 100%', ok: eqPct(shareSum, 100), detail: `${shareSum.toFixed(1)}%` });
  c.push({ id: 'C7', label: '총톤 − 상차도 = 운임물량', ok: Math.abs((A.totalTons - A.selfLoadTons) - A.billableTons) <= 0.01 });
  const zeroShareBug = p.carriers.some(x => x.amtCur != null && x.amtCur > 0 && (x.sharePct == null || x.sharePct <= 0));
  c.push({ id: 'C8', label: '금액>0인데 비중 0/null 없음', ok: !zeroShareBug });
  return c;
}

// ── 앱 정산행 → SettlementLine 어댑터 ──
export interface AppSettlementRow {
  date: string; company: string; customer: string; transportType: string;
  product?: string; weightNet: number; unitPrice: number; transportFee: number;
}
export function toSettlementLines(rows: AppSettlementRow[], origin = '경기광업'): SettlementLine[] {
  return rows.map(r => {
    const isCargo = r.transportType === '카고';
    const self = r.company === '상차도' || (r.transportFee === 0 && (r.unitPrice || 0) === 0);
    const goods = !isCargo && /신동|상품/.test(r.product || '');
    const vt: VehicleType = isCargo ? 'CARGO_TRUCK' : goods ? 'GOODS' : 'TANK_LORRY';
    return {
      month: String(r.date || '').slice(0, 7),
      vehicleType: vt,
      origin,
      client: r.customer || '-',
      carrier: r.company || '-',
      unitPrice: r.unitPrice || 0,
      rateBasis: isCargo ? 'PER_TRIP' : 'PER_TON',
      trips: 1,
      tons: r.weightNet || 0,
      amount: self ? 0 : (r.transportFee || 0),
      isSelfLoad: self,
      isGoods: goods,
    };
  });
}
