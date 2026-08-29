@echo off
chcp 65001 >nul
title SmartHML 동기화 누락방지 설치
REM 관리자 권한으로 자기 자신 재실행(UAC)
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo 관리자 권한이 필요합니다. [예]를 눌러주세요...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================
echo   SmartHML 동기화 누락방지 설정 적용
echo ============================================
echo.
echo 적용 내용:
echo   - 배터리에서도 실행 (노트북 대응)
echo   - 놓친 실행 자동 복구 (PC 껐다 켜도 따라잡음)
echo   - 로그인 3분 뒤 자동 실행 (부팅 직후 동기화)
echo   - 실패 시 5분 간격 3회 재시도
echo.

schtasks /Create /TN "SmartHML_Sync_Hourly" /XML "%~dp0sync-task.xml" /F
if %errorLevel% neq 0 (
  echo.
  echo [!] 적용 실패. 위 오류를 확인하세요.
  pause
  exit /b 1
)

echo.
echo [OK] 적용 완료!
echo 지금 한 번 즉시 실행합니다...
schtasks /Run /TN "SmartHML_Sync_Hourly" >nul 2>&1
echo.
echo 완료되었습니다. 이 창을 닫아도 됩니다.
pause
