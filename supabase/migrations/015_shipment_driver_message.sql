-- ============================================================
-- 015_shipment_driver_message.sql
-- 출하관리 "전달사항"(기사 전달 사항) 컬럼 추가.
-- 앱 전용 컬럼(레거시 sync 미대상). 출하증 발급 시 팝업(C)로 노출.
-- v_shipments 는 s.* 를 생성시점에 펼치므로 새 컬럼 노출을 위해 뷰 재생성.
-- ============================================================
alter table public.shipments add column if not exists driver_message text;

drop view if exists public.v_shipments;
create view public.v_shipments as
select
  s.*,
  c.name  as customer_name,
  p.name  as product_name,
  p.code  as product_code,
  d.name  as driver_name,
  tc.name as company_name
from shipments s
left join customers c on s.customer_id = c.id
left join products p on s.product_id = p.id
left join drivers d on s.driver_id = d.id
left join transport_companies tc on s.company_id = tc.id;
alter view public.v_shipments set (security_invoker = on);
grant select on public.v_shipments to anon, authenticated;
