@echo off
REM SmartHML MySQL -> Supabase FULL sync (ASCII only, no powershell dependency).
cd /d C:\SmartHML\web-app
if not exist logs mkdir logs
echo [%date% %time%] sync start >> logs\sync.log
REM --merge-legacy: 컷오버 전까지 레거시 값 반영 + 새 시스템 입력(운송사 등)은 보존.
REM 월요일 컷오버 시 sync 중단 예정(이 태스크 비활성화).
"C:\Program Files\nodejs\node.exe" scripts\sync-mysql-to-supabase.mjs --merge-legacy >> logs\sync.log 2>&1
echo [%date% %time%] sync done exit=%ERRORLEVEL% >> logs\sync.log
echo. >> logs\sync.log
