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
"%NODE_EXE%" scripts\sync-mysql-to-supabase.mjs --delta >> "%LOG_FILE%" 2>&1
set "RC=%ERRORLEVEL%"
echo [%date% %time%] sync done exit=%RC% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
exit /b %RC%
