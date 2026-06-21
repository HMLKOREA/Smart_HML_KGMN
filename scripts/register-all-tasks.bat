@echo off
REM SmartHML 전체 자동화 작업 등록
REM 관리자 권한으로 실행 필요

echo ============================================
echo  SmartHML 자동화 작업 등록
echo ============================================
echo.

REM 1. 매시간 MySQL→Supabase 동기화 (매시 05분)
echo [1/2] 매시간 동기화 등록...
schtasks /create ^
  /tn "SmartHML_Sync_Hourly" ^
  /tr "C:\SmartHML\web-app\scripts\sync-hourly.bat" ^
  /sc HOURLY ^
  /st 00:05 ^
  /ru "%USERNAME%" ^
  /f >nul 2>&1
if %errorlevel% equ 0 (echo   OK: SmartHML_Sync_Hourly) else (echo   FAIL: SmartHML_Sync_Hourly)

REM 2. 매일 18:00 텔레그램 일일보고 발송
echo [2/2] 일일보고 텔레그램 등록...
schtasks /create ^
  /tn "SmartHML_Telegram_Daily" ^
  /tr "C:\SmartHML\web-app\scripts\daily-telegram-report.bat" ^
  /sc DAILY ^
  /st 18:00 ^
  /ru "%USERNAME%" ^
  /f >nul 2>&1
if %errorlevel% equ 0 (echo   OK: SmartHML_Telegram_Daily) else (echo   FAIL: SmartHML_Telegram_Daily)

echo.
echo ============================================
echo  등록 완료!
echo.
echo  [1] 매시간 동기화: XX:05 마다 MySQL→Supabase 증분 동기화
echo  [2] 일일보고: 매일 18:00 텔레그램 발송
echo.
echo  확인: schtasks /query /tn "SmartHML_*"
echo  삭제: schtasks /delete /tn "SmartHML_Sync_Hourly" /f
echo        schtasks /delete /tn "SmartHML_Telegram_Daily" /f
echo ============================================
pause
