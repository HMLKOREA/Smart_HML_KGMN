/**
 * Module Agents — 모듈별 에이전트 공개 API
 */

// 출하관리
export { ShippingAgent, SHIPPING_AGENT_CONFIG } from './ShippingAgent';

// 생산현황
export { ProductionAgent, PRODUCTION_AGENT_CONFIG } from './ProductionAgent';

// 정산관리
export { SettlementAgent, SETTLEMENT_AGENT_CONFIG } from './SettlementAgent';
export type { SettlementCalcResult } from './SettlementAgent';

// 배차관리
export { DispatchAgent, DISPATCH_AGENT_CONFIG } from './DispatchAgent';

// 성적서관리
export { ReportAgent, REPORT_AGENT_CONFIG } from './ReportAgent';

// 마스터 데이터
export {
  CustomerAgent, CUSTOMER_AGENT_CONFIG,
  TransportCompanyAgent, TRANSPORT_COMPANY_AGENT_CONFIG,
  DriverAgent, DRIVER_AGENT_CONFIG,
  ProductAgent, PRODUCT_AGENT_CONFIG,
  UnitPriceAgent, UNIT_PRICE_AGENT_CONFIG,
} from './MasterDataAgent';
