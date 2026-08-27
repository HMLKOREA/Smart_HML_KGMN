@echo off
REM SmartHML disable all sync tasks (ASCII only, non-interactive for scheduler).
cd /d C:\SmartHML\web-app
schtasks /Change /TN "SmartHML_Sync_10min"  /DISABLE >> scripts\cutover-disable.log 2>&1
schtasks /Change /TN "SmartHML_Sync_Hourly" /DISABLE >> scripts\cutover-disable.log 2>&1
schtasks /Change /TN "SmartHML_Sync_1900"   /DISABLE >> scripts\cutover-disable.log 2>&1
