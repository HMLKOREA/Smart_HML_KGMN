@echo off
REM SmartHML 매시간 동기화 — Windows 작업 스케줄러 등록
REM 관리자 권한으로 실행 필요

echo SmartHML MySQL→Supabase 매시간 동기화 작업을 등록합니다...

schtasks /create ^
  /tn "SmartHML_Sync_Hourly" ^
  /tr "C:\SmartHML\web-app\scripts\sync-hourly.bat" ^
  /sc HOURLY ^
  /st 00:05 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %errorlevel% equ 0 (
  echo.
  echo ✅ 작업 등록 성공!
  echo    작업 이름: SmartHML_Sync_Hourly
  echo    실행 주기: 매시간 (XX:05)
  echo    실행 파일: C:\SmartHML\web-app\scripts\sync-hourly.bat
  echo    로그 경로: C:\SmartHML\web-app\logs\
  echo.
  echo 확인: schtasks /query /tn "SmartHML_Sync_Hourly"
  echo 삭제: schtasks /delete /tn "SmartHML_Sync_Hourly" /f
) else (
  echo ❌ 등록 실패 — 관리자 권한으로 다시 실행하세요
)

pause
