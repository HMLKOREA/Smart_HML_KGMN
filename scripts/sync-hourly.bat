@echo off
REM SmartHML MySQL -> Supabase hourly delta sync
REM ASCII-only to avoid cmd.exe codepage parsing issues.

cd /d C:\SmartHML\web-app

set "LOG_DIR=C:\SmartHML\web-app\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Build YYYYMMDD from PowerShell to avoid locale-dependent %date%
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set "TODAY=%%i"
set "LOG_FILE=%LOG_DIR%\sync-%TODAY%.log"

set "NODE_EXE=C:\Program Files\nodejs\node.exe"

echo [%date% %time%] sync start >> "%LOG_FILE%"
REM 2026-08-28: --delta 제거(전체 동기화). 레거시 update_date 미갱신(출하증발급/차량배정/날짜변경) 누락 방지.
"%NODE_EXE%" scripts\sync-mysql-to-supabase.mjs >> "%LOG_FILE%" 2>&1
set "RC=%ERRORLEVEL%"
echo [%date% %time%] sync done exit=%RC% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
exit /b %RC%
