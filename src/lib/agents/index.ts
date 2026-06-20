/**
 * 에이전트 시스템 — 메인 진입점
 *
 * 구조:
 *   core/       — BaseAgent, ModuleAgent, AgentRegistry (프레임워크)
 *   modules/    — ShippingAgent, ProductionAgent, ... (비즈니스 에이전트)
 *   setup.ts    — 앱 초기화 시 에이전트 등록
 *
 * 레거시 호환:
 *   DataAgent, HealthCheckAgent, MigrationAgent — 기존 코드 하위 호환
 */

// ── Core Framework ──────────────────────────────
export {
  BaseAgent,
  ModuleAgent,
  AgentRegistry,
} from './core';

export type {
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentEvent,
  AgentEventType,
  AgentEventHandler,
  QueryParams,
  RolePermissions,
  MiddlewareFn,
  MiddlewareAction,
  MiddlewareContext,
  ValidationRule,
  ValidationResult,
} from './core';

// ── Module Agents ───────────────────────────────
export {
  ShippingAgent,
  ProductionAgent,
  SettlementAgent,
  DispatchAgent,
  ReportAgent,
  CustomerAgent,
  TransportCompanyAgent,
  DriverAgent,
  ProductAgent,
  UnitPriceAgent,
} from './modules';

// ── Setup ───────────────────────────────────────
export { setupAgents, getAgent } from './setup';

// ── Legacy (하위 호환) ──────────────────────────
export { DataAgent } from './dataAgent';
export { HealthCheckAgent, validateRecord, validationRules } from './healthCheckAgent';
