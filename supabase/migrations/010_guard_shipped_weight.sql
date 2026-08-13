-- 010_guard_shipped_weight.sql
-- 관리자 출하확정(is_shipped=true) 건은 운송사(transporter)가 계근값(weight_net)을
-- 수정하지 못하도록 DB 레벨에서 강제한다. (UI 잠금 + 방어심층화)
-- service_role(동기화)·admin·field 는 영향 없음(트리거는 transporter 만 차단).
CREATE OR REPLACE FUNCTION public.guard_shipped_weight()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_shipped = true
     AND NEW.weight_net IS DISTINCT FROM OLD.weight_net
     AND (SELECT public.current_role_name()) = 'transporter' THEN
    RAISE EXCEPTION '관리자 출하확정 건은 계근값을 수정할 수 없습니다.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_shipped_weight ON public.shipments;
CREATE TRIGGER trg_guard_shipped_weight
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.guard_shipped_weight();
