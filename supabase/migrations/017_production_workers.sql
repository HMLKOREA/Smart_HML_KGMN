-- ============================================================
-- 017_production_workers.sql
-- 생산일지 작업자 명단(버튼 선택용). 현장 staff가 관리.
-- ============================================================
create table if not exists public.production_workers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  is_active  boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.production_workers enable row level security;
revoke all on public.production_workers from anon;
drop policy if exists production_workers_rw on public.production_workers;
create policy production_workers_rw on public.production_workers for all to authenticated
  using ((select public.current_role_name()) in ('admin','monitor','field'))
  with check ((select public.current_role_name()) in ('admin','monitor','field'));

insert into public.production_workers (name, sort) values
  ('조진환', 1), ('김용갑', 2), ('이영진', 3)
on conflict (name) do nothing;
