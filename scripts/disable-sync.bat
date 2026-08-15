@echo off
REM ============================================================
REM SmartHML - Disable all sync scheduled tasks (D-day cutover)
REM ASCII only. Run as Administrator.
REM ============================================================
setlocal

echo.
echo [SmartHML] Disabling all sync scheduled tasks...
echo.

schtasks /Change /TN "SmartHML_Sync_10min"  /DISABLE
schtasks /Change /TN "SmartHML_Sync_Hourly" /DISABLE
schtasks /Change /TN "SmartHML_Sync_1900"   /DISABLE

echo.
echo [SmartHML] Current status:
schtasks /Query /TN "SmartHML_Sync_10min"  /FO LIST | findstr /I "TaskName Status"
schtasks /Query /TN "SmartHML_Sync_Hourly" /FO LIST | findstr /I "TaskName Status"
schtasks /Query /TN "SmartHML_Sync_1900"   /FO LIST | findstr /I "TaskName Status"

echo.
echo [SmartHML] Done. All sync tasks are DISABLED (not deleted).
echo   - To re-enable:  schtasks /Change /TN "SmartHML_Sync_Hourly" /ENABLE
echo   - To delete permanently:  schtasks /Delete /TN "SmartHML_Sync_Hourly" /F
echo.
pause
endlocal
