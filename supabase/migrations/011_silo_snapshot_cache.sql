-- 011_silo_snapshot_cache.sql
-- 사일로 벤더 API(비즈에이앤씨)의 호출제한(1회/60초)을 여러 서버 인스턴스가
-- 공유해 지키기 위한 전역 스냅샷 캐시(단일 행). 서버(service_role)만 접근.
CREATE TABLE IF NOT EXISTS public.silo_snapshot (
  id integer PRIMARY KEY DEFAULT 1,
  readings jsonb NOT NULL,      -- { "1": {"weight":85,"measuredAt":"..."}, ... }
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT silo_snapshot_singleton CHECK (id = 1)
);
ALTER TABLE public.silo_snapshot ENABLE ROW LEVEL SECURITY;
-- authenticated 정책 없음: /api/silo 라우트가 service_role 로만 읽고 쓴다.
