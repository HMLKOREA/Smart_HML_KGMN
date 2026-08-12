-- 008_views_security_invoker.sql
-- ────────────────────────────────────────────────────────────────
-- 목적: v_shipments / v_drivers 뷰가 '조회자'의 RLS를 따르도록
--       security_invoker 를 활성화한다.
--
-- 배경:
--   Postgres 뷰는 기본적으로 소유자 권한으로 실행되어 하위 테이블의
--   RLS 를 우회한다(security_invoker=off). 이 때문에 운송사(transporter)
--   계정이 v_shipments 를 직접 조회하면 앱 필터를 우회해 타사 배차정보가
--   노출될 수 있었다.
--
-- 효과(방어심층화):
--   - transporter → shipments RLS(company_id=자사)만 통과 → 자사 행만 조회
--   - staff(admin/monitor/field) → is_staff() → 전체 조회 (기존과 동일)
--   - 조인 룩업(customers/products/drivers/transport_companies)은
--     인증사용자 읽기 허용이라 결과에 영향 없음
-- ────────────────────────────────────────────────────────────────
ALTER VIEW public.v_shipments SET (security_invoker = on);
ALTER VIEW public.v_drivers   SET (security_invoker = on);
