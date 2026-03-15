-- ============================================================
-- SmartHML 초기 데이터베이스 스키마
-- 경기광업 스마트배차 웹 시스템
-- ============================================================

-- 사용자 프로필 (Supabase Auth 확장)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'monitor', 'transporter', 'field')),
  company_id UUID,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 운송사 (Transport Company)
CREATE TABLE IF NOT EXISTS transport_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_number TEXT,
  representative TEXT,
  phone TEXT,
  fax TEXT,
  address TEXT,
  email TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 거래처 (Customer)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_number TEXT,
  representative TEXT,
  phone TEXT,
  fax TEXT,
  address TEXT,
  delivery_address TEXT,
  email TEXT,
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기사 (Driver)
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT,
  vehicle_tonnage DECIMAL(10,2),
  company_id UUID REFERENCES transport_companies(id),
  license_number TEXT,
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 제품코드 (Product)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  specification TEXT,
  unit TEXT DEFAULT 'ton',
  unit_price DECIMAL(12,2),
  category TEXT,
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 출하 (Shipment)
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shipment_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id),
  product_id UUID REFERENCES products(id),
  quantity DECIMAL(12,3) DEFAULT 0,
  unit TEXT DEFAULT 'ton',
  delivery_address TEXT,
  driver_id UUID REFERENCES drivers(id),
  vehicle_number TEXT,
  company_id UUID REFERENCES transport_companies(id),
  dispatch_id UUID,
  weight_empty DECIMAL(12,3),
  weight_loaded DECIMAL(12,3),
  weight_net DECIMAL(12,3),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','dispatched','in_transit','delivered','completed','cancelled')),
  memo TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 배차 (Dispatch)
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  dispatch_number TEXT NOT NULL UNIQUE,
  shipment_id UUID REFERENCES shipments(id),
  company_id UUID REFERENCES transport_companies(id),
  driver_id UUID REFERENCES drivers(id),
  vehicle_number TEXT,
  product_id UUID REFERENCES products(id),
  customer_id UUID REFERENCES customers(id),
  quantity DECIMAL(12,3),
  unit TEXT DEFAULT 'ton',
  delivery_address TEXT,
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned','departed','arrived','completed','cancelled')),
  departure_time TIMESTAMPTZ,
  arrival_time TIMESTAMPTZ,
  memo TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 성적서 (Quality Report)
CREATE TABLE IF NOT EXISTS quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT NOT NULL UNIQUE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shipment_id UUID REFERENCES shipments(id),
  product_id UUID REFERENCES products(id),
  customer_id UUID REFERENCES customers(id),
  template_type INTEGER DEFAULT 1,
  test_results JSONB DEFAULT '{}',
  inspector TEXT,
  approved_by TEXT,
  memo TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','issued')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 단가 (Unit Price)
CREATE TABLE IF NOT EXISTS unit_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES transport_companies(id),
  product_id UUID REFERENCES products(id),
  price DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  end_date DATE,
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 정산 (Settlement)
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  settlement_number TEXT NOT NULL UNIQUE,
  company_id UUID REFERENCES transport_companies(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_quantity DECIMAL(12,3),
  total_amount DECIMAL(15,2) DEFAULT 0,
  unit_price DECIMAL(12,2),
  tax_amount DECIMAL(15,2) DEFAULT 0,
  final_amount DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','confirmed','paid','cancelled')),
  memo TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 정산 상세 (Settlement Detail)
CREATE TABLE IF NOT EXISTS settlement_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES shipments(id),
  shipment_date DATE,
  product_name TEXT,
  quantity DECIMAL(12,3),
  unit_price DECIMAL(12,2),
  amount DECIMAL(15,2),
  memo TEXT
);

-- 시스템 로그 (System Log for Health Check Agent)
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info','warning','error')),
  message TEXT NOT NULL,
  details JSONB,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX idx_shipments_date ON shipments(shipment_date);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_company ON shipments(company_id);
CREATE INDEX idx_dispatches_date ON dispatches(dispatch_date);
CREATE INDEX idx_dispatches_status ON dispatches(status);
CREATE INDEX idx_dispatches_company ON dispatches(company_id);
CREATE INDEX idx_dispatches_driver ON dispatches(driver_id);
CREATE INDEX idx_drivers_company ON drivers(company_id);
CREATE INDEX idx_quality_reports_date ON quality_reports(report_date);
CREATE INDEX idx_settlements_date ON settlements(settlement_date);
CREATE INDEX idx_settlements_company ON settlements(company_id);
CREATE INDEX idx_unit_prices_company ON unit_prices(company_id);
CREATE INDEX idx_unit_prices_product ON unit_prices(product_id);
CREATE INDEX idx_system_logs_module ON system_logs(module);
CREATE INDEX idx_system_logs_level ON system_logs(level);

-- ============================================================
-- RLS (Row Level Security) 정책
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Admin: 모든 데이터 접근 가능
CREATE POLICY "admin_all" ON user_profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- 공통 읽기 정책 (인증된 사용자)
CREATE POLICY "authenticated_read" ON transport_companies FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON customers FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON drivers FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON products FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON shipments FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON dispatches FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON quality_reports FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON unit_prices FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON settlements FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON settlement_details FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON system_logs FOR SELECT
  TO authenticated USING (true);

-- Admin/Field 쓰기 정책
CREATE POLICY "admin_write" ON transport_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON customers FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON drivers FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON products FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON quality_reports FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON unit_prices FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON settlements FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON settlement_details FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));
CREATE POLICY "admin_write" ON system_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin')));

-- 출하/배차: Admin, Field, Transporter 쓰기 가능
CREATE POLICY "shipment_write" ON shipments FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','field','transporter')));
CREATE POLICY "shipment_update" ON shipments FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','field','transporter')));
CREATE POLICY "dispatch_write" ON dispatches FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','field','transporter')));
CREATE POLICY "dispatch_update" ON dispatches FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','field','transporter')));

-- User Profile: 자신의 프로필 읽기
CREATE POLICY "own_profile_read" ON user_profiles FOR SELECT
  TO authenticated USING (id = auth.uid() OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 트리거: updated_at 자동 갱신
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_transport_companies_updated_at BEFORE UPDATE ON transport_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_shipments_updated_at BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_dispatches_updated_at BEFORE UPDATE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_quality_reports_updated_at BEFORE UPDATE ON quality_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_unit_prices_updated_at BEFORE UPDATE ON unit_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_settlements_updated_at BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 뷰: 자주 사용하는 조인 뷰
-- ============================================================
CREATE OR REPLACE VIEW v_shipments AS
SELECT
  s.*,
  c.name AS customer_name,
  p.name AS product_name,
  p.code AS product_code,
  d.name AS driver_name,
  tc.name AS company_name
FROM shipments s
LEFT JOIN customers c ON s.customer_id = c.id
LEFT JOIN products p ON s.product_id = p.id
LEFT JOIN drivers d ON s.driver_id = d.id
LEFT JOIN transport_companies tc ON s.company_id = tc.id;

CREATE OR REPLACE VIEW v_dispatches AS
SELECT
  di.*,
  tc.name AS company_name,
  dr.name AS driver_name,
  p.name AS product_name,
  c.name AS customer_name
FROM dispatches di
LEFT JOIN transport_companies tc ON di.company_id = tc.id
LEFT JOIN drivers dr ON di.driver_id = dr.id
LEFT JOIN products p ON di.product_id = p.id
LEFT JOIN customers c ON di.customer_id = c.id;

CREATE OR REPLACE VIEW v_drivers AS
SELECT
  d.*,
  tc.name AS company_name
FROM drivers d
LEFT JOIN transport_companies tc ON d.company_id = tc.id;

CREATE OR REPLACE VIEW v_settlements AS
SELECT
  s.*,
  tc.name AS company_name
FROM settlements s
LEFT JOIN transport_companies tc ON s.company_id = tc.id;

CREATE OR REPLACE VIEW v_quality_reports AS
SELECT
  qr.*,
  p.name AS product_name,
  p.code AS product_code,
  c.name AS customer_name
FROM quality_reports qr
LEFT JOIN products p ON qr.product_id = p.id
LEFT JOIN customers c ON qr.customer_id = c.id;
