-- ============================================================
-- 016_tonbag_production_and_stock.sql
-- 톤백 재고관리: 일일 생산일지 + 아침(8시) 재고 체크.
-- 현장(field)에서 직접 기록 → 재고로 이어짐.
-- ============================================================
create table if not exists public.production_logs (
  id           bigint generated always as identity primary key,
  log_date     date not null,
  product      text not null,                 -- K200 / K35 / K50 / K100
  worker       text,                          -- 작업자(선택)
  good_count   integer not null default 0,    -- 양호(재고 반영)
  defect_count integer not null default 0,    -- 불량
  memo         text,
  created_at   timestamptz not null default now()
);
create index if not exists production_logs_date_idx on public.production_logs (log_date desc);
create index if not exists production_logs_prod_idx on public.production_logs (product, log_date desc);

create table if not exists public.tonbag_stock_checks (
  id          bigint generated always as identity primary key,
  check_date  date not null,
  product     text not null,
  qty         integer not null default 0,
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (check_date, product)
);
create index if not exists tonbag_stock_date_idx on public.tonbag_stock_checks (check_date desc);

alter table public.production_logs enable row level security;
alter table public.tonbag_stock_checks enable row level security;
revoke all on public.production_logs from anon;
revoke all on public.tonbag_stock_checks from anon;

drop policy if exists production_logs_rw on public.production_logs;
create policy production_logs_rw on public.production_logs for all to authenticated
  using ((select public.current_role_name()) in ('admin','monitor','field'))
  with check ((select public.current_role_name()) in ('admin','monitor','field'));

drop policy if exists tonbag_stock_rw on public.tonbag_stock_checks;
create policy tonbag_stock_rw on public.tonbag_stock_checks for all to authenticated
  using ((select public.current_role_name()) in ('admin','monitor','field'))
  with check ((select public.current_role_name()) in ('admin','monitor','field'));
