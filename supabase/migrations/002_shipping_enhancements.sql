-- ============================================================
-- SmartHML 출하 테이블 기능 확장
-- C# 프로그램 기능 동기화
-- ============================================================

-- 운송구분 (탱크, 벌크, 백 등)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS transport_type TEXT DEFAULT '탱크';

-- 사일로 번호/정보
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS silo TEXT;

-- 출하 여부 체크박스
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS is_shipped BOOLEAN DEFAULT false;

-- 출하증 발급시간
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS certificate_time TIMESTAMPTZ;

-- 전부파일 (첨부파일 유무)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS has_attachment BOOLEAN DEFAULT false;

-- 배차통보 여부
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dispatch_notified BOOLEAN DEFAULT false;

-- 확정 여부
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;

-- 기타 (별도 메모 필드, 기존 memo와 구분)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS notes TEXT;

-- v_shipments 뷰는 s.* 를 사용하므로 새 컬럼이 자동 포함됨
-- 별도 뷰 수정 불필요
