-- ============================================================
-- 014_activity_logs_access.sql
-- app_activity_logs 에 접속(auth) 로그용 IP/UserAgent 컬럼 추가.
-- module='auth', action='login'|'login_fail'|'logout' 로 기록.
-- ============================================================
alter table public.app_activity_logs add column if not exists ip text;
alter table public.app_activity_logs add column if not exists user_agent text;
