# SmartHML 웹 시스템 설정 가이드

## 1. Supabase 프로젝트 생성

### 1-1. Supabase 가입 및 프로젝트 생성
1. https://supabase.com 접속
2. 회원가입 또는 로그인
3. "New Project" 클릭
4. 프로젝트 설정:
   - **Name**: SmartHML
   - **Database Password**: 안전한 비밀번호 설정 (기록해두세요)
   - **Region**: Northeast Asia (ap-northeast-1) 선택 (서울)
5. "Create new project" 클릭 후 2-3분 대기

### 1-2. 환경 변수 확인
1. Supabase 대시보드 → Settings → API
2. 다음 값을 복사:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 1-3. .env.local 파일 수정
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

## 2. 데이터베이스 초기화

### 2-1. SQL 실행
1. Supabase 대시보드 → SQL Editor
2. `supabase/migrations/001_initial_schema.sql` 내용을 복사하여 실행
3. 모든 테이블, 뷰, RLS 정책이 생성됩니다

### 2-2. 초기 관리자 계정 생성
1. Supabase 대시보드 → Authentication → Users → "Add user"
2. 관리자 이메일/비밀번호 입력
3. SQL Editor에서 프로필 등록:
```sql
INSERT INTO user_profiles (id, email, name, role, is_active)
VALUES (
  '생성된-사용자-UUID',
  'admin@hamelkorea.com',
  '관리자',
  'admin',
  true
);
```

### 2-3. 추가 사용자 등록 (예시)
```sql
-- 서울경기광업 (모니터링)
INSERT INTO user_profiles (id, email, name, role, is_active)
VALUES ('UUID', 'monitor@sgmine.com', '서울경기광업', 'monitor', true);

-- 운송사
INSERT INTO user_profiles (id, email, name, role, company_id, is_active)
VALUES ('UUID', 'driver@transport.com', 'A운송', 'transporter', '운송사UUID', true);

-- 현장
INSERT INTO user_profiles (id, email, name, role, is_active)
VALUES ('UUID', 'field@factory.com', '현장담당', 'field', true);
```

## 3. 실행

```bash
cd C:\SmartHML\web-app

# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build
npm run start
```

접속: http://localhost:3000

## 4. 사용자 역할별 접근 권한

| 메뉴 | admin | monitor | transporter | field |
|------|-------|---------|-------------|-------|
| 출하관리 | ✅ | ✅ | ✅ | ✅ |
| 배차관리 | ✅ | ✅ | ✅ | ✅ |
| 운송사관리 | ✅ | ✅ | ❌ | ❌ |
| 거래처관리 | ✅ | ✅ | ❌ | ❌ |
| 기사관리 | ✅ | ✅ | ✅ | ❌ |
| 제품코드관리 | ✅ | ✅ | ❌ | ❌ |
| 성적서관리 | ✅ | ✅ | ❌ | ✅ |
| 정산관리 | ✅ | ✅ | ❌ | ❌ |
