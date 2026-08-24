-- ============================================================
-- 013_app_activity_logs.sql
-- SmartHML 전용 입력/활동 로그 (감사 추적).
-- 기존 public.activity_logs 는 이 프로젝트를 공유하는 별도 앱 소유이므로
-- 건드리지 않고, SmartHML 전용 테이블을 새로 둔다.
-- 실무자 입력·수정·삭제·확정 등 모든 쓰기 동작을 앱에서 이 테이블에 기록.
-- ============================================================
create table if not exists public.app_activity_logs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  user_login    text,          -- 로그인 아이디
  user_name     text,          -- 표시 이름
  role          text,          -- 역할(admin/monitor/field/transporter)
  module        text not null, -- shipping | dispatch | settlement | unit_price | ...
  action        text not null, -- create | update | delete | confirm | issue_cert | notify | ship | import | copy ...
  target_id     text,          -- 대상 레코드 id
  target_label  text,          -- 사람이 읽는 대상 설명(거래처/제품/차량 등)
  details       jsonb          -- 변경 상세(before/after 등)
);

create index if not exists app_activity_logs_created_idx on public.app_activity_logs (created_at desc);
create index if not exists app_activity_logs_module_idx  on public.app_activity_logs (module, created_at desc);

alter table public.app_activity_logs enable row level security;
revoke all on public.app_activity_logs from anon;

drop policy if exists app_activity_logs_insert on public.app_activity_logs;
drop policy if exists app_activity_logs_select on public.app_activity_logs;

-- 로그인 사용자는 누구나 자기 활동을 기록할 수 있다(append-only).
create policy app_activity_logs_insert on public.app_activity_logs
  for insert to authenticated with check (true);

-- 조회는 관리자/모니터만.
create policy app_activity_logs_select on public.app_activity_logs
  for select to authenticated
  using ((select public.current_role_name()) in ('admin','monitor'));
