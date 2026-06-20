/**
 * MasterDataAgent — 마스터 데이터 에이전트 (공통)
 *
 * 거래처, 운송사, 기사, 제품코드 등
 * 마스터 데이터 관리를 위한 팩토리 함수.
 *
 * 각각 별도 클래스로 만들기엔 비즈니스 로직이 유사하므로
 * 설정만 다르게 하여 ModuleAgent 인스턴스를 생성.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransportCompany, Customer, Driver, Product, UnitPrice } from '@/types';
import { ModuleAgent } from '../core/ModuleAgent';
import type { AgentConfig, ValidationRule } from '../core/types';

// ── 거래처 ───────────────────────────────────────

export const CUSTOMER_AGENT_CONFIG: AgentConfig = {
  id: 'customer',
  name: '거래처관리',
  description: '거래처 정보 관리',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'monitor', 'field'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
    field: { read: true, create: true, update: true, delete: false, export: true },
  },
  options: {},
};

export class CustomerAgent extends ModuleAgent<Customer> {
  protected validationRules: ValidationRule[] = [
    { field: 'name', type: 'required', message: '거래처명은 필수입니다' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(supabase, { ...CUSTOMER_AGENT_CONFIG, ...config }, 'customers');
  }

  async searchByName(name: string): Promise<Customer[]> {
    const { data } = await this.supabase
      .from('customers')
      .select('*')
      .ilike('name', `%${name}%`)
      .eq('is_active', true)
      .order('name')
      .limit(20);
    return (data as Customer[]) || [];
  }
}

// ── 운송사 ───────────────────────────────────────

export const TRANSPORT_COMPANY_AGENT_CONFIG: AgentConfig = {
  id: 'transport_company',
  name: '운송사관리',
  description: '운송사 정보 관리',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'monitor'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
  },
  options: {},
};

export class TransportCompanyAgent extends ModuleAgent<TransportCompany> {
  protected validationRules: ValidationRule[] = [
    { field: 'name', type: 'required', message: '운송사명은 필수입니다' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(supabase, { ...TRANSPORT_COMPANY_AGENT_CONFIG, ...config }, 'transport_companies');
  }

  async getActiveCompanies(): Promise<TransportCompany[]> {
    const { data } = await this.supabase
      .from('transport_companies')
      .select('*')
      .eq('is_active', true)
      .order('name');
    return (data as TransportCompany[]) || [];
  }
}

// ── 기사 ─────────────────────────────────────────

export const DRIVER_AGENT_CONFIG: AgentConfig = {
  id: 'driver',
  name: '기사관리',
  description: '기사 및 차량 정보 관리',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'monitor', 'field', 'transporter'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
    field: { read: true, create: true, update: true, delete: false, export: true },
    transporter: { read: true, create: true, update: true, delete: false, export: false },
  },
  options: {},
};

export class DriverAgent extends ModuleAgent<Driver> {
  protected validationRules: ValidationRule[] = [
    { field: 'name', type: 'required', message: '기사명은 필수입니다' },
    { field: 'vehicle_number', type: 'required', message: '차량번호는 필수입니다' },
    { field: 'company_id', type: 'required', message: '소속 운송사를 선택하세요' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(supabase, { ...DRIVER_AGENT_CONFIG, ...config }, 'drivers', 'v_drivers');
  }

  async getByCompany(companyId: string): Promise<Driver[]> {
    const { data } = await this.supabase
      .from('v_drivers')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    return (data as Driver[]) || [];
  }
}

// ── 제품코드 ─────────────────────────────────────

export const PRODUCT_AGENT_CONFIG: AgentConfig = {
  id: 'product',
  name: '제품코드관리',
  description: '제품코드 및 규격 관리',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin', 'monitor', 'field'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
    field: { read: true, create: false, update: false, delete: false, export: false },
  },
  options: {},
};

export class ProductAgent extends ModuleAgent<Product> {
  protected validationRules: ValidationRule[] = [
    { field: 'code', type: 'required', message: '제품코드는 필수입니다' },
    { field: 'name', type: 'required', message: '제품명은 필수입니다' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(supabase, { ...PRODUCT_AGENT_CONFIG, ...config }, 'products');
  }
}

// ── 단가 ─────────────────────────────────────────

export const UNIT_PRICE_AGENT_CONFIG: AgentConfig = {
  id: 'unit_price',
  name: '단가관리',
  description: '운송사별 제품 단가 관리',
  enabled: true,
  autoRefreshInterval: 0,
  allowedRoles: ['admin'],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true, export: true },
    monitor: { read: true, create: false, update: false, delete: false, export: true },
  },
  options: {},
};

export class UnitPriceAgent extends ModuleAgent<UnitPrice> {
  protected validationRules: ValidationRule[] = [
    { field: 'company_id', type: 'required', message: '운송사를 선택하세요' },
    { field: 'product_id', type: 'required', message: '제품을 선택하세요' },
    { field: 'price', type: 'required', message: '단가를 입력하세요' },
    { field: 'price', type: 'min', value: 0, message: '단가는 0 이상이어야 합니다' },
  ];

  constructor(supabase: SupabaseClient, config?: Partial<AgentConfig>) {
    super(supabase, { ...UNIT_PRICE_AGENT_CONFIG, ...config }, 'unit_prices');
  }

  /** 운송사별 단가 조회 */
  async getByCompany(companyId: string): Promise<UnitPrice[]> {
    const { data } = await this.supabase
      .from('unit_prices')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('effective_date', { ascending: false });
    return (data as UnitPrice[]) || [];
  }
}
