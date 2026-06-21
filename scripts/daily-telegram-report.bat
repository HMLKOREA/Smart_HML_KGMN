@echo off
REM SmartHML 일일 배차결과 텔레그램 자동 발송
REM 매일 저녁 18:00에 실행하도록 작업 스케줄러에 등록

cd /d C:\SmartHML\web-app

set LOG_DIR=C:\SmartHML\web-app\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set LOG_FILE=%LOG_DIR%\telegram-%date:~0,4%%date:~5,2%%date:~8,2%.log

echo [%date% %time%] 텔레그램 일일보고 전송 시작 >> "%LOG_FILE%"
node scripts/test-telegram.mjs >> "%LOG_FILE%" 2>&1
echo [%date% %time%] 전송 완료 >> "%LOG_FILE%"
