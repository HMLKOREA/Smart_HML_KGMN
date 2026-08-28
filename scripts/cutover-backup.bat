@echo off
REM SmartHML cutover: final FULL sync -> full backup (ASCII only).
cd /d C:\SmartHML\web-app
REM 1) 최종 전체 동기화(레거시 마지막분까지 확실히 반영)
"C:\Program Files\nodejs\node.exe" scripts\sync-mysql-to-supabase.mjs >> scripts\cutover-backup.log 2>&1
REM 2) 전체 백업
"C:\Program Files\nodejs\node.exe" --env-file=.env.local scripts\backup-supabase.mjs >> scripts\cutover-backup.log 2>&1
