-- 009_customer_products_master.sql
-- ────────────────────────────────────────────────────────────────
-- 거래처×제품 마스터 (레거시 custom_mst 182건 미러)
-- 용도: 출하관리 '거래처 다중 등록' 소스. 기존에는 최근 출하에서
--       파생해 21건만 노출됐으나, 레거시처럼 전체 마스터를 보여준다.
-- 동기화: scripts/sync-mysql-to-supabase.mjs → syncCustomerProducts()
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_uid integer UNIQUE,           -- custom_mst.uid
  transport_type text,                 -- carr_gubun_cd (BCT→탱크 등)
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,                  -- cp_name
  customer_code text,                  -- cus_code (거래처코드)
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,                   -- product (제품명)
  product_code text,                   -- prod_code
  warehouse_code text,                 -- storage_code (창고코드)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.customer_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_products_read ON public.customer_products;
CREATE POLICY customer_products_read ON public.customer_products
  FOR SELECT TO authenticated
  USING ((SELECT public.current_role_name()) IS NOT NULL);

DROP POLICY IF EXISTS customer_products_admin_write ON public.customer_products;
CREATE POLICY customer_products_admin_write ON public.customer_products
  FOR ALL TO authenticated
  USING ((SELECT public.current_role_name()) = 'admin')
  WITH CHECK ((SELECT public.current_role_name()) = 'admin');
