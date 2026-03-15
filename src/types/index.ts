// ============================================================
// SmartHML 타입 정의
// ============================================================

// 사용자 역할
export type UserRole = 'admin' | 'monitor' | 'transporter' | 'field';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  company_id?: string;
  company_name?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 운송사 (Transport Company)
export interface TransportCompany {
  id: string;
  name: string;
  business_number: string;
  representative: string;
  phone: string;
  fax?: string;
  address?: string;
  email?: string;
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 거래처 (Customer)
export interface Customer {
  id: string;
  name: string;
  business_number?: string;
  representative?: string;
  phone?: string;
  fax?: string;
  address?: string;
  delivery_address?: string;
  email?: string;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 기사 (Driver)
export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle_number: string;
  vehicle_type?: string;
  vehicle_tonnage?: number;
  company_id: string;
  company_name?: string;
  license_number?: string;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 제품코드 (Product)
export interface Product {
  id: string;
  code: string;
  name: string;
  specification?: string;
  unit: string;
  unit_price?: number;
  category?: string;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 출하 (Shipment)
export interface Shipment {
  id: string;
  shipment_date: string;
  shipment_number: string;
  customer_id: string;
  customer_name?: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  quantity: number;
  unit: string;
  delivery_address?: string;
  driver_id?: string;
  driver_name?: string;
  vehicle_number?: string;
  company_id?: string;
  company_name?: string;
  dispatch_id?: string;
  transport_type?: string;
  silo?: string;
  is_shipped?: boolean;
  weight_empty?: number;
  weight_loaded?: number;
  weight_net?: number;
  certificate_time?: string;
  has_attachment?: boolean;
  dispatch_notified?: boolean;
  is_confirmed?: boolean;
  notes?: string;
  status: ShipmentStatus;
  memo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type ShipmentStatus = 'pending' | 'dispatched' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';

// 배차 (Dispatch)
export interface Dispatch {
  id: string;
  dispatch_date: string;
  dispatch_number: string;
  shipment_id: string;
  company_id: string;
  company_name?: string;
  driver_id: string;
  driver_name?: string;
  vehicle_number?: string;
  product_id?: string;
  product_name?: string;
  customer_id?: string;
  customer_name?: string;
  quantity?: number;
  unit?: string;
  delivery_address?: string;
  status: DispatchStatus;
  departure_time?: string;
  arrival_time?: string;
  memo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type DispatchStatus = 'assigned' | 'departed' | 'arrived' | 'completed' | 'cancelled';

// 성적서 (Report / Certificate)
export interface QualityReport {
  id: string;
  report_number: string;
  report_date: string;
  shipment_id?: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  customer_id?: string;
  customer_name?: string;
  template_type: number; // 1~11 성적서 양식
  test_results: Record<string, string | number>;
  inspector?: string;
  approved_by?: string;
  memo?: string;
  status: 'draft' | 'approved' | 'issued';
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// 정산 (Settlement)
export interface Settlement {
  id: string;
  settlement_date: string;
  settlement_number: string;
  company_id: string;
  company_name?: string;
  period_start: string;
  period_end: string;
  total_quantity?: number;
  total_amount: number;
  unit_price?: number;
  tax_amount?: number;
  final_amount?: number;
  status: SettlementStatus;
  memo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type SettlementStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled';

// 정산 상세 (Settlement Detail)
export interface SettlementDetail {
  id: string;
  settlement_id: string;
  shipment_id: string;
  shipment_date: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  amount: number;
  memo?: string;
}

// 단가 (Unit Price)
export interface UnitPrice {
  id: string;
  company_id: string;
  company_name?: string;
  product_id: string;
  product_name?: string;
  price: number;
  effective_date: string;
  end_date?: string;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 공통 필터/검색 타입
export interface DateRange {
  start: string;
  end: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// API 응답 타입
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 건강 체크 (Health Check)
export interface HealthCheckResult {
  module: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

// 메뉴 아이템
export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  roles: UserRole[];
  children?: MenuItem[];
}
