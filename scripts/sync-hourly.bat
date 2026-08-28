@echo off
REM SmartHML MySQL -> Supabase FULL sync (ASCII only, no powershell dependency).
cd /d C:\SmartHML\web-app
if not exist logs mkdir logs
echo [%date% %time%] sync start >> logs\sync.log
"C:\Program Files\nodejs\node.exe" scripts\sync-mysql-to-supabase.mjs >> logs\sync.log 2>&1
echo [%date% %time%] sync done exit=%ERRORLEVEL% >> logs\sync.log
echo. >> logs\sync.log
