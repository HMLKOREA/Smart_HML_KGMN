-- ============================================================
-- 005_rls_perf.sql
-- RLS 성능: 정책 내 함수 호출을 (SELECT ...)로 감싸 쿼리당 1회만
-- 평가(InitPlan)되도록 한다. STABLE 함수도 WHERE 절에서는 행마다
-- 평가되어 대용량 테이블(shipments 25k+)에서 타임아웃이 발생했음.
-- 또한 운송사 격리 조회 가속을 위해 company_id 인덱스를 추가한다.
-- ============================================================

-- 출하/배차
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipments','dispatches'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING ((SELECT public.is_staff()) OR company_id = (SELECT public.current_company_id()))', t);
    EXECUTE format('CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated USING ((SELECT public.current_role_name()) IN (''admin'',''field'') OR ((SELECT public.current_role_name()) = ''transporter'' AND company_id = (SELECT public.current_company_id()))) WITH CHECK ((SELECT public.current_role_name()) IN (''admin'',''field'') OR ((SELECT public.current_role_name()) = ''transporter'' AND company_id = (SELECT public.current_company_id())))', t);
  END LOOP;
END $$;

-- 마스터 데이터
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transport_companies','customers','drivers','products','unit_prices'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_admin_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING ((SELECT public.current_role_name()) IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY %1$s_admin_write ON public.%1$s FOR ALL TO authenticated USING ((SELECT public.current_role_name()) = ''admin'') WITH CHECK ((SELECT public.current_role_name()) = ''admin'')', t);
  END LOOP;
END $$;

-- 성적서/생산일정
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quality_reports','production_schedules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING ((SELECT public.current_role_name()) IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated USING ((SELECT public.current_role_name()) IN (''admin'',''field'')) WITH CHECK ((SELECT public.current_role_name()) IN (''admin'',''field''))', t);
  END LOOP;
END $$;

-- user_profiles
DROP POLICY IF EXISTS up_select ON public.user_profiles;
DROP POLICY IF EXISTS up_admin_write ON public.user_profiles;
CREATE POLICY up_select ON public.user_profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.current_role_name()) = 'admin');
CREATE POLICY up_admin_write ON public.user_profiles FOR ALL TO authenticated
  USING ((SELECT public.current_role_name()) = 'admin') WITH CHECK ((SELECT public.current_role_name()) = 'admin');

-- 정산
DROP POLICY IF EXISTS settlements_read ON public.settlements;
DROP POLICY IF EXISTS settlements_admin_write ON public.settlements;
CREATE POLICY settlements_read ON public.settlements FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR company_id = (SELECT public.current_company_id()));
CREATE POLICY settlements_admin_write ON public.settlements FOR ALL TO authenticated
  USING ((SELECT public.current_role_name()) = 'admin') WITH CHECK ((SELECT public.current_role_name()) = 'admin');

DROP POLICY IF EXISTS settlement_details_read ON public.settlement_details;
DROP POLICY IF EXISTS settlement_details_admin_write ON public.settlement_details;
CREATE POLICY settlement_details_read ON public.settlement_details FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_details.settlement_id AND s.company_id = (SELECT public.current_company_id())));
CREATE POLICY settlement_details_admin_write ON public.settlement_details FOR ALL TO authenticated
  USING ((SELECT public.current_role_name()) = 'admin') WITH CHECK ((SELECT public.current_role_name()) = 'admin');

-- 시스템 로그
DROP POLICY IF EXISTS system_logs_admin ON public.system_logs;
CREATE POLICY system_logs_admin ON public.system_logs FOR ALL TO authenticated
  USING ((SELECT public.current_role_name()) = 'admin') WITH CHECK ((SELECT public.current_role_name()) = 'admin');

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_shipments_company ON public.shipments(company_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_company ON public.dispatches(company_id);
