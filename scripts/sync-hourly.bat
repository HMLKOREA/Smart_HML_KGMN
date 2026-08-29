@echo off
REM SmartHML MySQL -> Supabase sync (ASCII only). merge-legacy mode until cutover.
REM Self-healing: retry once if node fails, so a transient MySQL/network hiccup is not a miss.
cd /d C:\SmartHML\web-app
if not exist logs mkdir logs
echo [%date% %time%] sync start >> logs\sync.log
set NODE="C:\Program Files\nodejs\node.exe"

%NODE% scripts\sync-mysql-to-supabase.mjs --merge-legacy >> logs\sync.log 2>&1
set RC=%ERRORLEVEL%
if not "%RC%"=="0" (
  echo [%date% %time%] sync retry (first exit=%RC%) >> logs\sync.log
  timeout /t 30 /nobreak > nul
  %NODE% scripts\sync-mysql-to-supabase.mjs --merge-legacy >> logs\sync.log 2>&1
  set RC=%ERRORLEVEL%
)
echo [%date% %time%] sync done exit=%RC% >> logs\sync.log
echo. >> logs\sync.log
REM propagate node's real exit so the scheduler LastResult is meaningful
exit /b %RC%
