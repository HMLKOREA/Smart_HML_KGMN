-- ============================================================
-- 004_security_lockdown.sql
-- 보안 강화: anon 전권 정책 제거 → 인증/역할/운송사별 격리
--
-- 배경: 기존 정책이 anon(공개키) 역할에 전 테이블 read/write(ALL true)를
--       부여하여 로그인 없이 전 데이터 접근/위변조가 가능했음.
--       이 마이그레이션은 anon 접근을 차단하고, 인증된 사용자의
--       역할(admin/monitor/field/transporter)과 소속 운송사(company_id)
--       기준으로 접근을 제한한다.
--
-- 전제: 앱이 Supabase Auth로 로그인하여 auth.uid()가 user_profiles.id와
--       일치해야 한다. (003 이전의 하드코딩/anon 방식과 함께 쓰면 앱이 멈춘다)
-- ============================================================

-- ------------------------------------------------------------
-- 0) 헬퍼 함수 (SECURITY DEFINER로 user_profiles RLS 재귀 회피)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid() AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.user_profiles WHERE id = auth.uid() AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_role_name() IN ('admin','monitor','field')
$$;

-- ------------------------------------------------------------
-- 1) 기존 개방형 정책 전부 제거 (anon/authenticated/public)
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'user_profiles','transport_companies','customers','drivers','products',
        'unit_prices','shipments','dispatches','quality_reports',
        'settlements','settlement_details','production_schedules','system_logs'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- anon/public 역할의 잔여 테이블 권한 회수 (RLS와 별개의 GRANT 차단)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profiles','transport_companies','customers','drivers','products',
    'unit_prices','shipments','dispatches','quality_reports',
    'settlements','settlement_details','production_schedules','system_logs'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) RLS 보장 (이미 켜져 있지만 명시)
-- ------------------------------------------------------------
ALTER TABLE public.user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_prices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_details   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs          ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3) user_profiles : 본인 읽기 + admin 전체 / 쓰기 admin
-- ------------------------------------------------------------
CREATE POLICY up_select ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_role_name() = 'admin');
CREATE POLICY up_admin_write ON public.user_profiles FOR ALL TO authenticated
  USING (public.current_role_name() = 'admin')
  WITH CHECK (public.current_role_name() = 'admin');

-- ------------------------------------------------------------
-- 4) 마스터 데이터 : 인증 사용자 읽기 / admin 쓰기
--    (transport_companies, customers, drivers, products, unit_prices)
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transport_companies','customers','drivers','products','unit_prices'] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated
        USING (public.current_role_name() IS NOT NULL);
      CREATE POLICY %1$s_admin_write ON public.%1$s FOR ALL TO authenticated
        USING (public.current_role_name() = 'admin')
        WITH CHECK (public.current_role_name() = 'admin');
    $f$, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5) 출하/배차 : staff 전체, transporter는 자사(company_id)만
--    읽기 + 쓰기(insert/update/delete) 모두 동일 가시범위
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipments','dispatches'] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated
        USING (public.is_staff() OR company_id = public.current_company_id());
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated
        USING (public.current_role_name() IN ('admin','field')
               OR (public.current_role_name() = 'transporter' AND company_id = public.current_company_id()))
        WITH CHECK (public.current_role_name() IN ('admin','field')
               OR (public.current_role_name() = 'transporter' AND company_id = public.current_company_id()));
    $f$, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6) 정산 : staff 전체, transporter는 자사만 읽기 / 쓰기 admin
-- ------------------------------------------------------------
CREATE POLICY settlements_read ON public.settlements FOR SELECT TO authenticated
  USING (public.is_staff() OR company_id = public.current_company_id());
CREATE POLICY settlements_admin_write ON public.settlements FOR ALL TO authenticated
  USING (public.current_role_name() = 'admin')
  WITH CHECK (public.current_role_name() = 'admin');

CREATE POLICY settlement_details_read ON public.settlement_details FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.settlements s
               WHERE s.id = settlement_details.settlement_id
                 AND s.company_id = public.current_company_id())
  );
CREATE POLICY settlement_details_admin_write ON public.settlement_details FOR ALL TO authenticated
  USING (public.current_role_name() = 'admin')
  WITH CHECK (public.current_role_name() = 'admin');

-- ------------------------------------------------------------
-- 7) 성적서 / 생산일정 : 인증 읽기 / admin·field 쓰기
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quality_reports','production_schedules'] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated
        USING (public.current_role_name() IS NOT NULL);
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated
        USING (public.current_role_name() IN ('admin','field'))
        WITH CHECK (public.current_role_name() IN ('admin','field'));
    $f$, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 8) 시스템 로그 : admin 전용
-- ------------------------------------------------------------
CREATE POLICY system_logs_admin ON public.system_logs FOR ALL TO authenticated
  USING (public.current_role_name() = 'admin')
  WITH CHECK (public.current_role_name() = 'admin');

-- ============================================================
-- 참고: service_role 키는 RLS를 우회하므로 서버 전용 작업(동기화,
--       사용자 생성 등)은 영향 없음. anon 키는 이제 위 테이블에
--       접근 불가.
-- ============================================================
