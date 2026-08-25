-- 019: production_schedules 쓰기에 monitor 추가 (임재국 부장/생산관리 주간계획 입력)
drop policy if exists production_schedules_write on public.production_schedules;
create policy production_schedules_write on public.production_schedules for all to authenticated
  using ((select public.current_role_name()) in ('admin','field','monitor'))
  with check ((select public.current_role_name()) in ('admin','field','monitor'));
