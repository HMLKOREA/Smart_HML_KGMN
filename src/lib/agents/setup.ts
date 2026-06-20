/**
 * Agent Setup — 앱 초기화 시 에이전트 등록
 *
 * 사용법:
 *   const supabase = createClient();
 *   setupAgents(supabase);
 *   const shipping = getAgent<ShippingAgent>('shipping');
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AgentRegistry } from './core/AgentRegistry';

import { ShippingAgent } from './modules/ShippingAgent';
import { ProductionAgent } from './modules/ProductionAgent';
import { SettlementAgent } from './modules/SettlementAgent';
import { DispatchAgent } from './modules/DispatchAgent';
import { ReportAgent } from './modules/ReportAgent';
import {
  CustomerAgent,
  TransportCompanyAgent,
  DriverAgent,
  ProductAgent,
  UnitPriceAgent,
} from './modules/MasterDataAgent';
import type { BaseAgent } from './core/BaseAgent';

let initialized = false;

/**
 * 전체 에이전트 초기화 및 레지스트리 등록
 */
export function setupAgents(supabase: SupabaseClient): void {
  if (initialized) return;

  // 비즈니스 에이전트
  AgentRegistry.register(new ShippingAgent(supabase));
  AgentRegistry.register(new ProductionAgent(supabase));
  AgentRegistry.register(new SettlementAgent(supabase));
  AgentRegistry.register(new DispatchAgent(supabase));
  AgentRegistry.register(new ReportAgent(supabase));

  // 마스터 데이터 에이전트
  AgentRegistry.register(new CustomerAgent(supabase));
  AgentRegistry.register(new TransportCompanyAgent(supabase));
  AgentRegistry.register(new DriverAgent(supabase));
  AgentRegistry.register(new ProductAgent(supabase));
  AgentRegistry.register(new UnitPriceAgent(supabase));

  initialized = true;
  console.log('[AgentSetup] 전체 에이전트 초기화 완료');
}

/**
 * 레지스트리에서 에이전트 조회 (타입 안전)
 */
export function getAgent<T extends BaseAgent>(id: string): T | undefined {
  return AgentRegistry.get<T>(id);
}
