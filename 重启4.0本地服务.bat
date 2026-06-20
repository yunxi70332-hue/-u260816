@echo off
setlocal
title USM 4.0 Local
cd /d "%~dp0"

echo Restarting USM 4.0 local service...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restart-local-4.ps1" -Port 9011 -OpenBrowser -Foreground
if errorlevel 1 (
  echo.
  echo Failed to restart USM 4.0 local service.
  pause
  exit /b 1
)

echo.
echo Service stopped.
pause
endlocal
