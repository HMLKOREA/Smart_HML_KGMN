-- ============================================================
-- 006_lock_activity_logs.sql
-- activity_logs(SmartHML 앱 전용 활동로그: action/target_id/details/user_id,
-- ShippingAgent가 기록)를 anon 노출에서 차단한다.
-- (주의: hamel_*/shared_*/users/deliveries/country_codes 는 같은 프로젝트를
--  공유하는 별도 앱의 테이블이라 여기서 건드리지 않는다.)
-- ============================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_logs', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_logs FROM anon;
CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated
  USING ((SELECT public.current_role_name()) IN ('admin','monitor'));
