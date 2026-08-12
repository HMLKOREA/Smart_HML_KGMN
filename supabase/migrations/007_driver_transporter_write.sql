-- 007_driver_transporter_write.sql
-- ────────────────────────────────────────────────────────────────
-- 목적: 운송사(transporter) 계정이 '자사 소속' 기사 정보를 직접
--       등록/수정할 수 있도록 drivers 테이블 RLS 정책을 추가한다.
--       (기존: drivers 쓰기 = admin 전용)
--
-- 범위 제한:
--   - transporter 는 company_id = 자사(current_company_id) 인 행만
--     INSERT / UPDATE 가능 (다른 운송사로 재배정 불가)
--   - DELETE 는 여전히 admin 전용 (이력 무결성 보호)
--   - 함수 호출은 (SELECT ...) 로 감싸 InitPlan 단일평가(성능) 유지
-- ────────────────────────────────────────────────────────────────

-- 자사 기사 수정
DROP POLICY IF EXISTS drivers_transporter_update ON public.drivers;
CREATE POLICY drivers_transporter_update ON public.drivers
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_role_name()) = 'transporter'
    AND company_id = (SELECT public.current_company_id())
  )
  WITH CHECK (
    (SELECT public.current_role_name()) = 'transporter'
    AND company_id = (SELECT public.current_company_id())
  );

-- 자사 기사 신규등록
DROP POLICY IF EXISTS drivers_transporter_insert ON public.drivers;
CREATE POLICY drivers_transporter_insert ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_role_name()) = 'transporter'
    AND company_id = (SELECT public.current_company_id())
  );
