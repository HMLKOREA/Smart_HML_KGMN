-- ============================================================
-- 018_shipments_write_allow_monitor.sql
-- 출하(shipments) 쓰기 권한에 monitor 추가.
-- (경기광업 서울/임재국 부장이 출하관리 입력을 함께 사용)
-- 기존 004의 shipments_write는 admin/field/transporter(자사)만 허용했음.
-- ============================================================
drop policy if exists shipments_write on public.shipments;
create policy shipments_write on public.shipments for all to authenticated
  using (
    public.current_role_name() in ('admin','field','monitor')
    or (public.current_role_name() = 'transporter' and company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin','field','monitor')
    or (public.current_role_name() = 'transporter' and company_id = public.current_company_id())
  );
