-- 012_settlement_closings.sql
-- 정산 확정/이력: 특정 기간의 정산 집계를 스냅샷으로 확정 저장한다.
-- 확정 시점의 집계(대수/톤/공급가액/세액/청구총액)를 고정 기록하여 감사·인수인계 근거로 사용.
create table if not exists public.settlement_closings (
  id uuid primary key default gen_random_uuid(),
  period_type   text not null,                       -- daily|monthly|quarterly|semi-annual|annual
  period_label  text not null,                       -- 예: '2026년 7월'
  period_from   date not null,
  period_to     date not null,
  scope_company text,                                -- 필터된 운송사(선택). null = 전체
  row_count     integer not null default 0,
  total_weight  numeric not null default 0,          -- 총 계근수량(톤)
  total_fee     numeric not null default 0,          -- 공급가액(운송료 합계)
  total_tax     numeric not null default 0,          -- 세액
  total_all     numeric not null default 0,          -- 청구총액(세포함)
  memo          text,
  status        text not null default 'confirmed',   -- confirmed|revoked
  confirmed_by      uuid references auth.users(id) on delete set null,
  confirmed_by_name text,
  confirmed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table public.settlement_closings enable row level security;

-- 조회: staff(admin/monitor/field)
drop policy if exists sc_select on public.settlement_closings;
create policy sc_select on public.settlement_closings
  for select using (public.is_staff());

-- 쓰기(확정/취소): admin 만. (실제 쓰기는 service_role API 경유하나 정책도 명시)
drop policy if exists sc_write on public.settlement_closings;
create policy sc_write on public.settlement_closings
  for all using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

create index if not exists idx_sc_period on public.settlement_closings(period_from, period_to);
create index if not exists idx_sc_confirmed_at on public.settlement_closings(confirmed_at desc);
