@echo off
REM SmartHML cutover full backup (ASCII only). Runs backup-supabase.mjs.
cd /d C:\SmartHML\web-app
"C:\Program Files\nodejs\node.exe" --env-file=.env.local scripts\backup-supabase.mjs >> scripts\cutover-backup.log 2>&1
