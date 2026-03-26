-- 003: 생산현황 (Production Schedules) 테이블
-- 현장 화이트보드를 디지털화하기 위한 생산 일정 관리

CREATE TABLE IF NOT EXISTS production_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date DATE NOT NULL,
  transport_category TEXT NOT NULL CHECK (transport_category IN ('cargo_truck','tank_lorry')),
  sub_category TEXT NOT NULL,  -- 'K10','광성화학','기타','탈황용','공업용'
  customer_id UUID REFERENCES customers(id),
  product_id UUID REFERENCES products(id),
  planned_quantity DECIMAL(12,3) DEFAULT 0,
  planned_trucks INTEGER DEFAULT 0,
  actual_quantity DECIMAL(12,3) DEFAULT 0,
  actual_trucks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prod_sched_date ON production_schedules(schedule_date);
CREATE INDEX idx_prod_sched_category ON production_schedules(transport_category);
CREATE INDEX idx_prod_sched_customer ON production_schedules(customer_id);
CREATE INDEX idx_prod_sched_status ON production_schedules(status);

CREATE TRIGGER update_production_schedules_updated_at
  BEFORE UPDATE ON production_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE VIEW v_production_schedules AS
SELECT
  ps.*,
  c.name AS customer_name,
  p.code AS product_code,
  p.name AS product_name
FROM production_schedules ps
LEFT JOIN customers c ON ps.customer_id = c.id
LEFT JOIN products p ON ps.product_id = p.id;

ALTER TABLE production_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_schedules_select" ON production_schedules FOR SELECT USING (true);
CREATE POLICY "production_schedules_insert" ON production_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "production_schedules_update" ON production_schedules FOR UPDATE USING (true);
CREATE POLICY "production_schedules_delete" ON production_schedules FOR DELETE USING (true);
