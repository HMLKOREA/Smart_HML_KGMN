@echo off
REM SmartHML MySQL → Supabase 매시간 증분 동기화
REM Windows 작업 스케줄러에 등록하여 사용

cd /d C:\SmartHML\web-app

REM 로그 파일 (날짜별)
set LOG_DIR=C:\SmartHML\web-app\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set LOG_FILE=%LOG_DIR%\sync-%date:~0,4%%date:~5,2%%date:~8,2%.log

echo [%date% %time%] 동기화 시작 >> "%LOG_FILE%"
node scripts/sync-mysql-to-supabase.mjs --delta >> "%LOG_FILE%" 2>&1
echo [%date% %time%] 동기화 완료 >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
